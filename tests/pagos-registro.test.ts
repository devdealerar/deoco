import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CobroConsultado } from "@/nucleo/pagos";
import { type CosaACobrar, cobrosDuplicados, registrarCobro } from "@/nucleo/pagos/registro";
import { prisma } from "@/nucleo/db/cliente";
import { esperarEventos } from "@/nucleo/eventos/bus";
import type { Modulo } from "@/nucleo/modulos/contrato";
import { crearRegistro } from "@/nucleo/modulos/registro";
import { dueno, escenarioAcceso } from "./apoyo";

// La regla del registro de un pago, una sola vez para todo módulo que cobra (la tienda y la
// ticketera la usan; sus pruebas recorren lo suyo). Acá, con un módulo falso y su "cosa" en
// memoria: lo que decide el núcleo, sin nada de pedidos ni entradas.

const falso: Modulo = {
  id: "cobrador",
  nombre: "Cobrador",
  permisos: [],
  cobros: true,
  avisos: [{ ruta: "/pago/[pasarela]", manejador: async () => ({ cuerpo: "" }) }],
};
const reg = crearRegistro([falso]);

type Fila = { estado: "abierta" | "pagada" | "en-revision"; total: number; cobroId: string | null; observacion?: string; entregada: number; motivo?: string };
let filas: Map<string, Fila>;
const cosa: CosaACobrar = {
  nombre: "la cosa",
  buscar: async (_, id) => filas.get(id) ?? null,
  anotarEstado: async () => {},
  antesDePagar: async (_, id) => filas.get(id)!.motivo ?? null,
  aRevision: async (_, id, c) => void Object.assign(filas.get(id)!, { estado: "en-revision", cobroId: c.cobroId, observacion: c.observacion }),
  marcarPagada: async (_, id, c) => {
    const f = filas.get(id)!;
    if (f.estado !== "abierta") return false;
    Object.assign(f, { estado: "pagada", cobroId: c.cobroId });
    return true;
  },
  alPagarse: async (_, id) => void filas.get(id)!.entregada++,
  evento: (id) => ({ nombre: "prueba.verificada", payload: { id } }),
};

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const cobro = (cobroId: string, referencia: string, extra: Partial<CobroConsultado> = {}): CobroConsultado => ({
  cobroId, referencia, estado: "aprobado", estadoPasarela: "approved", monto: 150000, moneda: "ARS", ...extra,
});

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
beforeAll(async () => {
  e = await escenarioAcceso();
});
beforeEach(async () => {
  await esperarEventos();
  await dueno.cobroDuplicado.deleteMany();
  await dueno.evento.deleteMany();
  filas = new Map([
    [A, { estado: "abierta", total: 150000, cobroId: null, entregada: 0 }],
    [B, { estado: "abierta", total: 150000, cobroId: null, entregada: 0 }],
  ]);
});
afterAll(async () => {
  await esperarEventos();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

const registrar = (c: CobroConsultado, tenantId = e.a.id) => registrarCobro(falso, tenantId, "mercadopago", c, cosa, reg);

describe("registrarCobro: la misma regla para todo módulo que cobra", () => {
  it("pagado una vez; repetido, nada; otro cobro aprobado, duplicado en la tabla del núcleo (una fila)", async () => {
    expect(await registrar(cobro("1", A, { estado: "pendiente", estadoPasarela: "in_process" }))).toBe("no-aprobado");
    expect(await registrar(cobro("1", A))).toBe("pagado");
    expect(await registrar(cobro("1", A))).toBe("ya-pagado");
    expect(await registrar(cobro("2", A, { estado: "rechazado", estadoPasarela: "rejected" }))).toBe("ya-pagado");
    expect(await registrar(cobro("3", A))).toBe("duplicado");
    expect(await registrar(cobro("3", A))).toBe("duplicado");
    expect(filas.get(A)).toMatchObject({ estado: "pagada", cobroId: "1", entregada: 1 });
    expect(await cobrosDuplicados(falso, e.a.id, undefined, reg)).toMatchObject([{ referencia: A, cobroId: "3", monto: 150000, moneda: "ARS", pasarela: "mercadopago" }]);
    expect(await dueno.evento.count({ where: { nombre: "prueba.verificada" } })).toBe(1);
  });

  it("monto o moneda distintos → en revisión con la observación; un cobro más, duplicado", async () => {
    expect(await registrar(cobro("4", A, { monto: 100 }))).toBe("en-revision");
    expect(filas.get(A)!.observacion).toBe("La pasarela aprobó ARS 1.00 (cobro 4) y la cosa es de ARS 1500.00.");
    expect(await registrar(cobro("4", A, { monto: 100 }))).toBe("en-revision");
    expect(await registrar(cobro("5", B, { moneda: "USD" }))).toBe("en-revision");
    expect(await registrar(cobro("6", A))).toBe("duplicado");
    expect(filas.get(A)!.entregada + filas.get(B)!.entregada).toBe(0);
    expect(await dueno.evento.count()).toBe(0);
  });

  it("el módulo puede frenar la entrega (antesDePagar): a revisión con su motivo", async () => {
    filas.get(A)!.motivo = "No queda lugar.";
    expect(await registrar(cobro("7", A))).toBe("en-revision");
    expect(filas.get(A)).toMatchObject({ estado: "en-revision", observacion: "No queda lugar.", entregada: 0 });
  });

  it("referencia que no es un id o no es de la banda: ajeno; un módulo que no cobra, no", async () => {
    expect(await registrar(cobro("8", "no-es-un-id"))).toBe("ajeno");
    expect(await registrar(cobro("8", "33333333-3333-4333-8333-333333333333"))).toBe("ajeno");
    const otro = crearRegistro([{ ...falso, cobros: false, avisos: [] }]);
    await expect(registrarCobro(otro.modulo("cobrador")!, e.a.id, "mercadopago", cobro("9", A), cosa, otro)).rejects.toThrow(/no es un módulo que cobra/);
  });

  it("los duplicados son de la banda (RLS): B no ve los de A", async () => {
    await registrar(cobro("10", A));
    await registrar(cobro("11", A));
    expect(await cobrosDuplicados(falso, e.a.id, [A], reg)).toHaveLength(1);
    expect(await cobrosDuplicados(falso, e.b.id, [A], reg)).toHaveLength(0);
  });
});
