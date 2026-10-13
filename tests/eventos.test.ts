import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/nucleo/db/cliente";
import { crearBus, type FalloEvento } from "@/nucleo/eventos/bus";
import { problemaNombreEvento } from "@/nucleo/eventos/nombre";
import type { Evento, Modulo } from "@/nucleo/modulos/contrato";
import { prenderModulo } from "@/nucleo/modulos/encendido";
import { crearRegistro } from "@/nucleo/modulos/registro";
import { dueno, escenarioAcceso } from "./apoyo";

let e: Awaited<ReturnType<typeof escenarioAcceso>>;

// Tres módulos falsos: la tienda emite, proveedor y avisos escuchan.
// Ninguno conoce a los otros: el núcleo los conecta por el nombre del evento.
const recibidos: { modulo: string; evento: Evento }[] = [];
let avisosFalla = false;
let demoraProveedor = 0;

const mod = (id: string, extra: Partial<Modulo>): Modulo => ({ id, nombre: id, permisos: [], ...extra });
const reg = crearRegistro([
  mod("tienda", { eventosEmite: ["pedido.pagado"] }),
  mod("proveedor", {
    eventosEscucha: [
      {
        evento: "pedido.pagado",
        manejador: async (ev) => {
          if (demoraProveedor) await new Promise((r) => setTimeout(r, Math.random() * demoraProveedor));
          recibidos.push({ modulo: "proveedor", evento: ev });
        },
      },
    ],
  }),
  mod("avisos", {
    eventosEscucha: [
      {
        evento: "pedido.pagado",
        manejador: async (ev) => {
          (ev.payload as { tocado?: boolean }).tocado = true; // no debe afectar a otros
          if (avisosFalla) throw new Error("el servidor de mail no responde");
          recibidos.push({ modulo: "avisos", evento: ev });
        },
      },
    ],
  }),
]);
const bus = crearBus(() => reg);

beforeAll(async () => {
  e = await escenarioAcceso();
});
beforeEach(async () => {
  recibidos.length = 0;
  avisosFalla = false;
  demoraProveedor = 0;
  await dueno.evento.deleteMany();
  await dueno.moduloTenant.deleteMany();
  for (const id of ["tienda", "proveedor", "avisos"]) await prenderModulo(e.staff.id, e.a.id, id, reg);
});
afterAll(async () => {
  await prisma.$disconnect();
  await dueno.$disconnect();
});

const fila = (id: string) => dueno.evento.findUniqueOrThrow({ where: { id } });

describe("prueba 1: emitir guarda la fila", () => {
  it("con tenant, nombre, fecha, payload y quién lo disparó", async () => {
    const antes = new Date();
    const { id } = await bus.emitir("pedido.pagado", e.a.id, { pedido: 7, total: 1500 }, e.multi.id);
    const f = await fila(id);
    expect(f).toMatchObject({
      nombre: "pedido.pagado",
      tenantId: e.a.id,
      usuarioId: e.multi.id,
      payload: { pedido: 7, total: 1500 },
    });
    expect(f.fecha.getTime()).toBeGreaterThanOrEqual(antes.getTime() - 1000);
    await bus.esperar();
    expect((await fila(id)).estado).toBe("PROCESADO");
  });

  it("la fila queda bajo RLS: la banda B no la ve", async () => {
    await bus.emitir("pedido.pagado", e.a.id, {});
    await bus.esperar();
    const { conTenant } = await import("@/nucleo/db/con-tenant");
    expect(await conTenant(e.b.id, (tx) => tx.evento.count())).toBe(0);
    expect(await conTenant(e.a.id, (tx) => tx.evento.count())).toBe(1);
  });
});

describe("prueba 2: el suscripto recibe el evento y corre", () => {
  it("proveedor y avisos lo reciben, con los datos del evento", async () => {
    const { id } = await bus.emitir("pedido.pagado", e.a.id, { pedido: 1 }, e.multi.id);
    await bus.esperar();
    expect(recibidos.map((r) => r.modulo).sort()).toEqual(["avisos", "proveedor"]);
    expect(recibidos[0].evento).toMatchObject({ id, nombre: "pedido.pagado", tenantId: e.a.id, usuarioId: e.multi.id });
  });

  it("cada suscripto recibe su propia copia del payload", async () => {
    await bus.emitir("pedido.pagado", e.a.id, { pedido: 1 });
    await bus.esperar();
    const proveedor = recibidos.find((r) => r.modulo === "proveedor")!;
    expect(proveedor.evento.payload).toEqual({ pedido: 1 });
  });
});

describe("el evento nunca bloquea a quien emite", () => {
  it("emitir vuelve antes de que los suscriptos terminen", async () => {
    let liberar!: () => void;
    const traba = new Promise<void>((r) => (liberar = r));
    let terminado = false;
    const lento = crearRegistro([
      mod("tienda", { eventosEmite: ["pedido.pagado"] }),
      mod("proveedor", {
        eventosEscucha: [{ evento: "pedido.pagado", manejador: async () => { await traba; terminado = true; } }],
      }),
    ]);
    const busLento = crearBus(() => lento);
    const { id } = await busLento.emitir("pedido.pagado", e.a.id, {});
    expect(terminado).toBe(false); // emitir ya volvió
    expect((await fila(id)).estado).toBe("PENDIENTE");
    liberar();
    await busLento.esperar();
    expect(terminado).toBe(true);
  });
});

describe("prueba 3: un suscripto que falla no frena a los demás", () => {
  it("proveedor corre igual, quien emite no se entera, y el fallo queda anotado", async () => {
    avisosFalla = true;
    const { id } = await bus.emitir("pedido.pagado", e.a.id, { pedido: 2 });
    await bus.esperar();
    expect(recibidos.map((r) => r.modulo)).toEqual(["proveedor"]);
    const f = await fila(id);
    expect(f.estado).toBe("FALLIDO");
    expect(f.intentos).toBe(1);
    expect(f.fallos).toEqual([
      { intento: 1, moduloId: "avisos", error: "el servidor de mail no responde", fecha: expect.any(String) },
    ]);
  });

  it("un evento fallido no frena los siguientes de la banda", async () => {
    avisosFalla = true;
    await bus.emitir("pedido.pagado", e.a.id, { n: 1 });
    avisosFalla = false;
    await bus.esperar();
    const { id } = await bus.emitir("pedido.pagado", e.a.id, { n: 2 });
    await bus.esperar();
    expect((await fila(id)).estado).toBe("PROCESADO");
  });
});

describe("prueba 4: módulo apagado en una banda", () => {
  it("proveedor apagado en A no recibe los de A, pero sí los de B donde está prendido", async () => {
    await dueno.moduloTenant.deleteMany({ where: { tenantId: e.a.id, moduloId: "proveedor" } });
    await prenderModulo(e.staff.id, e.b.id, "proveedor", reg);

    await bus.emitir("pedido.pagado", e.a.id, { banda: "A" });
    await bus.esperar();
    expect(recibidos.filter((r) => r.modulo === "proveedor")).toEqual([]);

    await bus.emitir("pedido.pagado", e.b.id, { banda: "B" });
    await bus.esperar();
    const proveedor = recibidos.filter((r) => r.modulo === "proveedor");
    expect(proveedor.map((r) => r.evento.tenantId)).toEqual([e.b.id]);
  });
});

describe("prueba 5: reprocesar un evento fallido", () => {
  it("lo vuelve a entregar a quien falló, y solo a quien falló", async () => {
    avisosFalla = true;
    const { id } = await bus.emitir("pedido.pagado", e.a.id, { pedido: 3 });
    await bus.esperar();
    expect(recibidos.map((r) => r.modulo)).toEqual(["proveedor"]);

    avisosFalla = false; // se arregló el mail
    await bus.reprocesar(e.a.id, id);
    expect(recibidos.map((r) => r.modulo)).toEqual(["proveedor", "avisos"]);
    const f = await fila(id);
    expect(f.estado).toBe("PROCESADO");
    expect(f.intentos).toBe(2);
    expect((f.fallos as FalloEvento[]).map((x) => x.intento)).toEqual([1]); // el historial se conserva
  });

  it("un evento que no falló no se reprocesa", async () => {
    const { id } = await bus.emitir("pedido.pagado", e.a.id, {});
    await bus.esperar();
    await expect(bus.reprocesar(e.a.id, id)).rejects.toThrow(/no está fallido \(está PROCESADO\)/);
  });

  it("un evento de otra banda no se encuentra", async () => {
    avisosFalla = true;
    const { id } = await bus.emitir("pedido.pagado", e.a.id, {});
    await bus.esperar();
    await expect(bus.reprocesar(e.b.id, id)).rejects.toThrow(/No existe el evento/);
  });
});

describe("orden de emisión por banda", () => {
  it("con manejadores de duración variable, se entregan en el orden en que se emitieron", async () => {
    demoraProveedor = 20;
    for (let n = 1; n <= 8; n++) await bus.emitir("pedido.pagado", e.a.id, { n });
    await bus.esperar();
    const orden = recibidos.filter((r) => r.modulo === "proveedor").map((r) => (r.evento.payload as { n: number }).n);
    expect(orden).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("emisiones concurrentes también salen en orden de secuencia", async () => {
    demoraProveedor = 10;
    const ids = await Promise.all([1, 2, 3, 4, 5].map((n) => bus.emitir("pedido.pagado", e.a.id, { n })));
    await bus.esperar();
    const porSecuencia = await dueno.evento.findMany({ where: { id: { in: ids.map((i) => i.id) } }, orderBy: { secuencia: "asc" } });
    const entregados = recibidos.filter((r) => r.modulo === "proveedor").map((r) => r.evento.id);
    expect(entregados).toEqual(porSecuencia.map((f) => f.id));
  });
});

describe("prueba 6: nombres de evento", () => {
  it.each(["pedido.pagar", "pedido.paga", "PedidoPagado", "pedido", "pedido.pagado.ayer", "Pedido.pagado", "pedido.Pagado"])(
    "rechaza %s",
    async (nombre) => {
      expect(problemaNombreEvento(nombre)).not.toBeNull();
      await expect(bus.emitir(nombre, e.a.id, {})).rejects.toThrow(/Nombre de evento inválido/);
    },
  );

  it.each(["pedido.pagado", "entrada.validada", "pedido.devuelto", "foto.impresa", "show.hecho", "entradas.vendidas", "pedido.recibido"])(
    "acepta %s",
    (nombre) => {
      expect(problemaNombreEvento(nombre)).toBeNull();
    },
  );

  it("un evento bien formado que ningún módulo declara emitir se rechaza", async () => {
    await expect(bus.emitir("entrada.validada", e.a.id, {})).rejects.toThrow(/Ningún módulo declara emitir/);
    expect(await dueno.evento.count()).toBe(0);
  });

  it("el registro rechaza nombres mal formados y suscripciones dobles al arrancar", () => {
    expect(() => crearRegistro([mod("x", { eventosEmite: ["pedido.pagar"] })])).toThrow(/eventosEmite: .*pasado/);
    const m = async () => {};
    expect(() => crearRegistro([mod("x", { eventosEscucha: [{ evento: "Mal", manejador: m }] })])).toThrow(/eventosEscucha/);
    expect(() =>
      crearRegistro([
        mod("x", {
          eventosEscucha: [
            { evento: "pedido.pagado", manejador: m },
            { evento: "pedido.pagado", manejador: m },
          ],
        }),
      ]),
    ).toThrow(/dos veces/);
  });
});
