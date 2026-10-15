import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { atenderAviso, LIMITE_CUERPO, urlAviso } from "@/nucleo/avisos";
import { conTenant } from "@/nucleo/db/con-tenant";
import { prisma } from "@/nucleo/db/cliente";
import { crearBus, esperarEventos } from "@/nucleo/eventos/bus";
import type { AvisoEntrante, Modulo } from "@/nucleo/modulos/contrato";
import { crearRegistro } from "@/nucleo/modulos/registro";
import { guardarSecreto } from "@/nucleo/secretos/carga";
import { dueno, escenarioAcceso } from "./apoyo";

let e: Awaited<ReturnType<typeof escenarioAcceso>>;

// Pasarela de mentira: guarda lo que recibe y emite por un bus propio, con idempotencia.
const recibidos: AvisoEntrante[] = [];
const pasarela: Modulo = {
  id: "pasarela-falsa",
  nombre: "Pasarela",
  permisos: [],
  eventosEmite: ["pago.acreditado"],
  avisos: [
    {
      ruta: "/pagos/[canal]",
      manejador: async (a) => {
        recibidos.push(a);
        if (a.cabeceras.get("x-romper")) throw new Error("se rompió el manejador");
        const datos = a.json() as { id?: string } | null;
        if (!datos?.id) return { estado: 400, cuerpo: "falta id" };
        const { repetido } = await bus.emitir("pago.acreditado", a.tenantId, { id: datos.id }, undefined, { unica: datos.id });
        return { cuerpo: { repetido } };
      },
    },
    { ruta: "/estado", metodos: ["GET"], manejador: async () => ({ cuerpo: "vivo" }) },
  ],
};
const reg = crearRegistro([pasarela]);
const bus = crearBus(() => reg);

const pedido = (path: string, init: RequestInit & { cuerpo?: string } = {}) =>
  new Request(`http://app.deocoartist.com${path}`, { method: "POST", body: init.cuerpo, ...init });
const atender = (tenantId: string, path: string, init: RequestInit & { cuerpo?: string } = {}, r = reg) =>
  atenderAviso(pedido(path, init), { tenantId, moduloId: "pasarela-falsa", path: path.split("?")[0] }, r);

beforeAll(async () => {
  e = await escenarioAcceso();
});
beforeEach(async () => {
  recibidos.length = 0;
  await dueno.evento.deleteMany();
  await dueno.secreto.deleteMany();
  await dueno.moduloTenant.deleteMany();
  await dueno.moduloTenant.create({ data: { tenantId: e.a.id, moduloId: "pasarela-falsa" } });
  await dueno.tenant.updateMany({ data: { estado: "ACTIVO" } });
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await esperarEventos();
  await dueno.moduloTenant.deleteMany();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("el núcleo resuelve la banda y entrega el aviso al módulo", () => {
  it("con tenant, parámetros, consulta, cabeceras y cuerpo crudo", async () => {
    const cuerpo = '{"id":"pago-1","monto":1500}';
    const r = await atender(e.a.id, "/pagos/mp?topic=payment&id=99", {
      cuerpo,
      headers: { "x-signature": "ts=1,v1=abc", "content-type": "application/json" },
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ repetido: false });
    const [a] = recibidos;
    expect(a.tenantId).toBe(e.a.id);
    expect(a.metodo).toBe("POST");
    expect(a.params).toEqual({ canal: "mp" });
    expect(a.consulta.get("topic")).toBe("payment");
    expect(a.cabeceras.get("x-signature")).toBe("ts=1,v1=abc");
    expect(Buffer.from(a.cuerpo).toString()).toBe(cuerpo); // byte por byte, para verificar firmas
    expect(a.json()).toEqual({ id: "pago-1", monto: 1500 });
  });

  it("404 sin pistas: id inválido, banda inexistente o archivada, módulo apagado o ruta no declarada", async () => {
    expect((await atender("no-es-uuid", "/pagos/mp")).status).toBe(404);
    expect((await atender("00000000-0000-4000-8000-000000000000", "/pagos/mp")).status).toBe(404);
    expect((await atender(e.b.id, "/pagos/mp", { cuerpo: '{"id":"x"}' })).status).toBe(404); // apagado en B
    expect((await atender(e.a.id, "/otra")).status).toBe(404);
    expect((await atenderAviso(pedido("/x"), { tenantId: e.a.id, moduloId: "nadie", path: "/pagos/mp" }, reg)).status).toBe(404);
    await dueno.tenant.update({ where: { id: e.a.id }, data: { estado: "ARCHIVADO" } });
    expect((await atender(e.a.id, "/pagos/mp", { cuerpo: '{"id":"x"}' })).status).toBe(404);
    expect(recibidos).toHaveLength(0);
  });

  it("suspendida o morosa sigue recibiendo (los pagos de sus ventas tienen que entrar)", async () => {
    await dueno.tenant.update({ where: { id: e.a.id }, data: { estado: "SUSPENDIDO" } });
    expect((await atender(e.a.id, "/pagos/mp", { cuerpo: '{"id":"s1"}' })).status).toBe(200);
  });

  it("405 con el método no declarado; GET si lo declara", async () => {
    const r = await atender(e.a.id, "/pagos/mp", { method: "GET" });
    expect(r.status).toBe(405);
    expect(r.headers.get("allow")).toBe("POST");
    const g = await atender(e.a.id, "/estado", { method: "GET" });
    expect([g.status, await g.text()]).toEqual([200, "vivo"]);
  });

  it("413 si el cuerpo pasa de 1 MB, sin llamar al manejador", async () => {
    const r = await atender(e.a.id, "/pagos/mp", { cuerpo: "x".repeat(LIMITE_CUERPO + 1) });
    expect(r.status).toBe(413);
    expect(recibidos).toHaveLength(0);
  });

  it("si el manejador falla: 500 (la pasarela reintenta) y el log no lleva el cuerpo", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await atender(e.a.id, "/pagos/mp", { cuerpo: '{"tarjeta":"4509-9535"}', headers: { "x-romper": "1" } });
    expect(r.status).toBe(500);
    expect(JSON.stringify(error.mock.calls)).toContain("se rompió el manejador");
    expect(JSON.stringify(error.mock.calls)).not.toContain("4509");
  });

  it("la URL que el módulo le da a la pasarela es de la plataforma, no del dominio de la banda", () => {
    expect(urlAviso(e.a.id, pasarela, "/pagos/mp")).toMatch(
      new RegExp(`^https?://app\\.${process.env.DEOCO_DOMINIO_RAIZ}(:\\d+)?/avisos/${e.a.id}/pasarela-falsa/pagos/mp$`),
    );
  });
});

describe("un aviso repetido no duplica el efecto", () => {
  it("emitir con `unica`: el segundo aviso igual no crea otro evento", async () => {
    const r1 = await atender(e.a.id, "/pagos/mp", { cuerpo: '{"id":"pago-7"}' });
    const r2 = await atender(e.a.id, "/pagos/mp", { cuerpo: '{"id":"pago-7"}' });
    expect(await r1.json()).toEqual({ repetido: false });
    expect(await r2.json()).toEqual({ repetido: true });
    expect(await dueno.evento.count({ where: { nombre: "pago.acreditado" } })).toBe(1);
    await atender(e.a.id, "/pagos/mp", { cuerpo: '{"id":"pago-8"}' });
    expect(await dueno.evento.count({ where: { nombre: "pago.acreditado" } })).toBe(2);
  });

  it("la clave es por banda: el mismo id en otra banda es otro evento", async () => {
    await dueno.moduloTenant.create({ data: { tenantId: e.b.id, moduloId: "pasarela-falsa" } });
    await atender(e.a.id, "/pagos/mp", { cuerpo: '{"id":"mismo"}' });
    await atender(e.b.id, "/pagos/mp", { cuerpo: '{"id":"mismo"}' });
    expect(await dueno.evento.count()).toBe(2);
  });

  it("dentro de una transacción, el repetido no la aborta", async () => {
    await conTenant(e.a.id, async (tx) => {
      expect((await bus.emitir("pago.acreditado", e.a.id, {}, undefined, { tx, unica: "t1" })).repetido).toBe(false);
      expect((await bus.emitir("pago.acreditado", e.a.id, {}, undefined, { tx, unica: "t1" })).repetido).toBe(true);
      await tx.evento.count(); // la transacción sigue viva
    });
    expect(await dueno.evento.count()).toBe(1);
    await bus.esperar();
  });
});

describe("el registro valida los avisos", () => {
  const base = { nombre: "x", permisos: [] };
  const nada = async () => {};
  it.each([
    [[{ ruta: "sin-barra", manejador: nada }], /ruta inválida/],
    [[{ ruta: "/a", manejador: nada }, { ruta: "/a", manejador: nada }], /repetido/],
    [[{ ruta: "/a", metodos: ["PUT" as "GET"], manejador: nada }], /métodos válidos/],
  ])("rechaza avisos mal declarados (%#)", (avisos, error) => {
    expect(() => crearRegistro([{ ...base, id: "m", avisos }])).toThrow(error);
  });

  it("/avisos y /clave son rutas del núcleo también en el sitio público", () => {
    for (const ruta of ["/avisos", "/clave"]) {
      expect(() => crearRegistro([{ ...base, id: "m", rutasPublicas: [{ ruta, componente: () => null }] }])).toThrow(/es del núcleo/);
    }
  });
});

describe("el aviso de ejemplo (módulo de prueba): firma, rapidez, idempotencia", () => {
  const TOKEN = "token-de-la-pasarela-de-prueba-0001";
  const firmar = (cuerpo: string) => createHmac("sha256", TOKEN).update(cuerpo).digest("hex");
  const avisoPrueba = (cuerpo: string, firma: string) =>
    atenderAviso(
      new Request(`http://app.deocoartist.com/avisos/${e.a.id}/prueba/pago`, { method: "POST", body: cuerpo, headers: { "x-firma": firma } }),
      { tenantId: e.a.id, moduloId: "prueba", path: "/pago" },
    );

  beforeEach(async () => {
    await dueno.moduloTenant.create({ data: { tenantId: e.a.id, moduloId: "prueba" } });
  });

  it("sin el token cargado responde 409; con firma inválida 401", async () => {
    expect((await avisoPrueba('{"id":"p1"}', firmar('{"id":"p1"}'))).status).toBe(409);
    await guardarSecreto(e.multi.id, e.a.id, "prueba", "token", TOKEN);
    expect((await avisoPrueba('{"id":"p1"}', "00")).status).toBe(401);
    expect((await avisoPrueba('{"id":"p1"}', firmar('{"id":"OTRO"}'))).status).toBe(401);
    expect(await dueno.evento.count()).toBe(0);
  });

  it("responde antes de que termine el suscripto (que tarda 1,5 s) y no duplica", async () => {
    await guardarSecreto(e.multi.id, e.a.id, "prueba", "token", TOKEN);
    const cuerpo = '{"id":"pago-42"}';
    const inicio = Date.now();
    const r = await avisoPrueba(cuerpo, firmar(cuerpo));
    expect(Date.now() - inicio).toBeLessThan(1000);
    expect(await r.json()).toEqual({ recibido: true, repetido: false });
    expect(await (await avisoPrueba(cuerpo, firmar(cuerpo))).json()).toEqual({ recibido: true, repetido: true });
    await esperarEventos();
    const eventos = await dueno.evento.findMany();
    expect(eventos.map((x) => [x.nombre, x.estado, x.claveUnica])).toEqual([["prueba.verificada", "PROCESADO", "pago:pago-42"]]);
  });
});
