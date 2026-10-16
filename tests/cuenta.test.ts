import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { atenderAvisoPlataforma } from "@/nucleo/avisos";
import { correrTareas } from "@/nucleo/barrido";
import {
  ErrorCuenta,
  ErrorLimite,
  bandaCreada,
  exigirLimite,
  fijarEstado,
  fijarLimites,
  fijarModulos,
  limiteDe,
  usoDeLimites,
} from "@/nucleo/cuenta";
import { conTenant } from "@/nucleo/db/con-tenant";
import { prisma } from "@/nucleo/db/cliente";
import type { Modulo } from "@/nucleo/modulos/contrato";
import { crearRegistro } from "@/nucleo/modulos/registro";
import { dosBandas, dueno } from "./apoyo";

// El núcleo del gestor de cuenta, con módulos de mentira: un gestor, dos módulos con
// dependencia y uno con un límite cuyo "uso" vive en memoria.

const usados = new Map<string, number>();
const ajustes: { tenantId: string; maximo: number }[] = [];
const altas: { tenantId: string; origen: string }[] = [];
const avisosRecibidos: unknown[] = [];
const tareas: Date[] = [];

const gestor: Modulo = {
  id: "gestor",
  nombre: "Gestor",
  permisos: [],
  gestionaCuenta: {
    alCrearBanda: async (tenantId, origen) => void altas.push({ tenantId, origen }),
    pantallaPago: () => null,
    comoAmpliar: async (_t, limite, necesarios) => `Para ${necesarios} ${limite}, cambiá de plan.`,
  },
  avisosPlataforma: [{ ruta: "/cuota/[pasarela]", manejador: async (a) => void avisosRecibidos.push({ params: a.params, cuerpo: a.json() }) }],
  tareasPeriodicas: [{ nombre: "vencimientos", cadaSegundos: 60, correr: async (ahora) => void tareas.push(ahora) }],
};
const base: Modulo = { id: "base", nombre: "Base", permisos: [] };
const extra: Modulo = { id: "extra", nombre: "Extra", permisos: [], dependencias: ["base"] };
const contador: Modulo = {
  id: "contador",
  nombre: "Contador",
  permisos: [],
  limites: [
    {
      clave: "cosas",
      etiqueta: "cosas publicadas",
      usados: async (t) => usados.get(t) ?? 0,
      ajustar: async (tenantId, maximo) => {
        ajustes.push({ tenantId, maximo });
        const antes = usados.get(tenantId) ?? 0;
        usados.set(tenantId, Math.min(antes, maximo));
        return Math.max(0, antes - maximo);
      },
    },
  ],
};
const reg = crearRegistro([gestor, base, extra, contador]);

let e: Awaited<ReturnType<typeof dosBandas>>;
beforeAll(async () => {
  e = await dosBandas();
});
beforeEach(async () => {
  await dueno.tenant.updateMany({ data: { estado: "ACTIVO", limiteAlmacenamiento: null } });
  await dueno.moduloTenant.deleteMany();
  await dueno.limiteBanda.deleteMany();
  await dueno.auditoria.deleteMany();
  usados.clear();
  ajustes.length = 0;
});
afterAll(async () => {
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("registro", () => {
  it("un solo gestor; avisos de plataforma y límites validados", () => {
    expect(() => crearRegistro([gestor, { ...gestor, id: "otro" }])).toThrow(/ya lo es "gestor"/);
    expect(() => crearRegistro([{ ...base, avisosPlataforma: gestor.avisosPlataforma }])).toThrow(/solo el gestor de cuenta/);
    expect(() => crearRegistro([{ ...contador, limites: [{ ...contador.limites![0], clave: "Mal Nombre" }] }])).toThrow(/clave inválida/);
    expect(reg.gestor?.moduloId).toBe("gestor");
    expect(reg.limites.map((l) => l.id)).toEqual(["contador.cosas"]);
  });
});

describe("solo el gestor", () => {
  it("otro módulo no cambia estado, módulos ni límites", async () => {
    await expect(fijarEstado(base, e.a.id, "MOROSO", "x", reg)).rejects.toThrow(ErrorCuenta);
    await expect(fijarModulos(base, e.a.id, [], reg)).rejects.toThrow(ErrorCuenta);
    await expect(fijarLimites(base, e.a.id, {}, reg)).rejects.toThrow(ErrorCuenta);
    // Un objeto con el mismo id que el gestor no alcanza: tiene que ser el registrado.
    await expect(fijarEstado({ ...gestor }, e.a.id, "MOROSO", "x", reg)).rejects.toThrow(ErrorCuenta);
  });
});

describe("estado", () => {
  it("cambia y queda en la auditoría sin usuario; una vez ARCHIVADO, el gestor ya no lo toca", async () => {
    expect(await fijarEstado(gestor, e.a.id, "MOROSO", "pago rechazado", reg)).toBe(true);
    expect(await fijarEstado(gestor, e.a.id, "MOROSO", "otra vez", reg)).toBe(false);
    expect((await dueno.tenant.findUniqueOrThrow({ where: { id: e.a.id } })).estado).toBe("MOROSO");
    expect((await dueno.tenant.findUniqueOrThrow({ where: { id: e.b.id } })).estado).toBe("ACTIVO");
    const fila = await dueno.auditoria.findFirstOrThrow({ where: { tenantId: e.a.id } });
    expect(fila).toMatchObject({ usuarioId: null, accion: "banda.estado_cambiado", detalle: { de: "ACTIVO", a: "MOROSO", motivo: "pago rechazado", por: "gestor" } });

    // El gestor archiva (último escalón de la cuota impaga); desarchivar es del staff.
    expect(await fijarEstado(gestor, e.b.id, "ARCHIVADO", "90 días de mora", reg)).toBe(true);
    expect(await fijarEstado(gestor, e.b.id, "ACTIVO", "pagó", reg)).toBe(false);
    expect((await dueno.tenant.findUniqueOrThrow({ where: { id: e.b.id } })).estado).toBe("ARCHIVADO");
  });
});

describe("módulos", () => {
  it("deja prendidos exactamente los pedidos (más el gestor) y respeta dependencias", async () => {
    expect(await fijarModulos(gestor, e.a.id, ["base", "extra"], reg)).toEqual({ prendidos: ["base", "extra", "gestor"], apagados: [] });
    expect(await fijarModulos(gestor, e.a.id, ["base"], reg)).toEqual({ prendidos: [], apagados: ["extra"] });
    await expect(fijarModulos(gestor, e.a.id, ["extra"], reg)).rejects.toThrow(/necesita base/);
    await expect(fijarModulos(gestor, e.a.id, ["no-existe"], reg)).rejects.toThrow(/No existen/);
    // Un módulo que no está en el build no se apaga (su fila queda).
    await dueno.moduloTenant.create({ data: { tenantId: e.a.id, moduloId: "viejo" } });
    await fijarModulos(gestor, e.a.id, [], reg);
    expect((await dueno.moduloTenant.findMany({ where: { tenantId: e.a.id } })).map((m) => m.moduloId).sort()).toEqual(["gestor", "viejo"]);
    expect(await dueno.moduloTenant.count({ where: { tenantId: e.b.id } })).toBe(0);
  });
});

describe("límites", () => {
  it("fijar un tope más bajo hace que el módulo ajuste; subirlo o sacarlo, no", async () => {
    usados.set(e.a.id, 7);
    expect(await fijarLimites(gestor, e.a.id, { topes: { "contador.cosas": 5 }, almacenamiento: BigInt(1000) }, reg)).toEqual({ "contador.cosas": 2 });
    expect(ajustes).toEqual([{ tenantId: e.a.id, maximo: 5 }]);
    expect(await limiteDe(contador, e.a.id, "cosas", reg)).toBe(5);
    expect((await dueno.tenant.findUniqueOrThrow({ where: { id: e.a.id } })).limiteAlmacenamiento).toBe(BigInt(1000));
    await fijarLimites(gestor, e.a.id, { topes: { "contador.cosas": 9 } }, reg);
    await fijarLimites(gestor, e.a.id, { topes: { "contador.cosas": null }, almacenamiento: null }, reg);
    expect(ajustes).toHaveLength(1);
    expect(await limiteDe(contador, e.a.id, "cosas", reg)).toBeNull();
    expect((await dueno.tenant.findUniqueOrThrow({ where: { id: e.a.id } })).limiteAlmacenamiento).toBeNull();
    await expect(fijarLimites(gestor, e.a.id, { topes: { "contador.otro": 1 } }, reg)).rejects.toThrow(/No existe el límite/);
    await expect(fijarLimites(gestor, e.a.id, { topes: { "contador.cosas": -1 } }, reg)).rejects.toThrow(/Tope inválido/);
  });

  it("exigirLimite: con pedidos a la vez, nunca pasa el tope; el mensaje dice cómo ampliar", async () => {
    await fijarLimites(gestor, e.a.id, { topes: { "contador.cosas": 3 } }, reg);
    const intento = () =>
      conTenant(e.a.id, async (tx) => {
        await exigirLimite(tx, contador, e.a.id, "cosas", async () => (usados.get(e.a.id) ?? 0) + 1, reg);
        await new Promise((r) => setTimeout(r, 20)); // ventana para que otro se cuele si no hubiera bloqueo
        usados.set(e.a.id, (usados.get(e.a.id) ?? 0) + 1);
      });
    const r = await Promise.allSettled(Array.from({ length: 6 }, intento));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(3);
    expect(usados.get(e.a.id)).toBe(3);
    const error = (r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason;
    expect(error).toBeInstanceOf(ErrorLimite);
    expect(error.message).toBe("Tu plan permite hasta 3 cosas publicadas y ya llegaste. Lo que ya está publicado sigue igual. Para 4 contador.cosas, cambiá de plan.");
    // La otra banda no tiene tope.
    await conTenant(e.b.id, (tx) => exigirLimite(tx, contador, e.b.id, "cosas", async () => 99, reg));
    await expect(conTenant(e.a.id, (tx) => exigirLimite(tx, base, e.a.id, "cosas", async () => 1, reg))).rejects.toThrow(/no declara el límite/);
  });

  it("uso de los límites de los módulos prendidos", async () => {
    usados.set(e.a.id, 2);
    await fijarLimites(gestor, e.a.id, { topes: { "contador.cosas": 4 } }, reg);
    expect(await usoDeLimites(e.a.id, reg)).toEqual([]);
    await fijarModulos(gestor, e.a.id, ["contador"], reg);
    expect(await usoDeLimites(e.a.id, reg)).toEqual([{ id: "contador.cosas", etiqueta: "cosas publicadas", usados: 2, maximo: 4 }]);
  });
});

describe("alta de una banda", () => {
  it("prende el gestor y le avisa", async () => {
    await bandaCreada(e.b.id, "autogestion", undefined, reg);
    expect(altas).toContainEqual({ tenantId: e.b.id, origen: "autogestion" });
    expect((await dueno.moduloTenant.findMany({ where: { tenantId: e.b.id } })).map((m) => m.moduloId)).toEqual(["gestor"]);
  });
});

describe("avisos de plataforma y tareas", () => {
  it("el aviso llega al gestor sin banda; lo que no declara, 404", async () => {
    const pedir = (path: string, moduloId = "gestor") =>
      atenderAvisoPlataforma(new Request("http://app.x/avisos", { method: "POST", body: '{"type":"x"}' }), { moduloId, path }, reg);
    expect((await pedir("/cuota/mercadopago")).status).toBe(200);
    expect(avisosRecibidos).toEqual([{ params: { pasarela: "mercadopago" }, cuerpo: { type: "x" } }]);
    expect((await pedir("/otra")).status).toBe(404);
    expect((await pedir("/cuota/mercadopago", "base")).status).toBe(404);
  });

  it("una tarea corre cuando le toca", async () => {
    const t0 = new Date("2026-11-01T00:00:00Z");
    expect(await correrTareas(t0, reg)).toEqual(["gestor.vencimientos"]);
    expect(await correrTareas(new Date(t0.getTime() + 30_000), reg)).toEqual([]);
    expect(await correrTareas(new Date(t0.getTime() + 61_000), reg)).toEqual(["gestor.vencimientos"]);
    expect(tareas).toHaveLength(2);
  });
});
