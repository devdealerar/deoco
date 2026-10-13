import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { consultar } from "@/nucleo/consultas";
import { conTenant } from "@/nucleo/db/con-tenant";
import { prisma } from "@/nucleo/db/cliente";
import type { Modulo } from "@/nucleo/modulos/contrato";
import { crearRegistro } from "@/nucleo/modulos/registro";
import { dosBandas, dueno } from "./apoyo";

let a: { id: string };
let b: { id: string };

type Fecha = { nombre: string; fecha: string };
const respuestas: unknown[] = [];

// "Ticketera" de mentira: responde con el nombre de la banda que pregunta (lee bajo RLS).
const ticketera: Modulo = {
  id: "ticketera-falsa",
  nombre: "Ticketera",
  permisos: [],
  consultas: [
    {
      nombre: "proximas-fechas",
      responder: async (tenantId, params) => {
        const banda = await conTenant(tenantId, (tx) => tx.tenant.findFirstOrThrow({ select: { nombre: true } }));
        const r = [{ nombre: `Show de ${banda.nombre}`, fecha: "2026-11-20T23:00:00.000Z", limite: params.limite }];
        respuestas.push(r);
        return r;
      },
    },
    { nombre: "rota", responder: async () => Promise.reject(new Error("se rompió la base")) },
    { nombre: "lenta", responder: () => new Promise((ok) => setTimeout(() => ok([{ nombre: "tarde", fecha: "x" }]), 500)) },
  ],
};
const sitio: Modulo = { id: "sitio-falso", nombre: "Sitio", permisos: [] };
const reg = crearRegistro([ticketera, sitio]);

// Lo que haría el sitio: valida la forma y no confía en nada más.
const interpretar = (r: unknown): Fecha[] => {
  if (!Array.isArray(r)) throw new Error("no es una lista");
  return r.map((x) => {
    if (typeof x?.nombre !== "string" || typeof x?.fecha !== "string") throw new Error("forma inesperada");
    return { nombre: x.nombre, fecha: x.fecha };
  });
};
const fechas = (tenantId: string, id = "ticketera-falsa.proximas-fechas", esperaMs?: number) =>
  consultar<Fecha[]>(tenantId, id, { limite: 5 }, { vacio: [], interpretar, esperaMs }, reg);

beforeAll(async () => {
  ({ a, b } = await dosBandas());
});
beforeEach(async () => {
  respuestas.length = 0;
  await dueno.moduloTenant.deleteMany();
  await dueno.moduloTenant.createMany({
    data: [
      { tenantId: a.id, moduloId: "ticketera-falsa" },
      { tenantId: a.id, moduloId: "sitio-falso" },
      { tenantId: b.id, moduloId: "sitio-falso" },
    ],
  });
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await dueno.moduloTenant.deleteMany();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("consultar(): un módulo le pide datos a otro por id", () => {
  it("responde con los datos de la banda que pregunta, validados por quien pregunta", async () => {
    expect(await fechas(a.id)).toEqual([{ nombre: "Show de Banda A", fecha: "2026-11-20T23:00:00.000Z" }]);
  });

  it("si el módulo que responde está apagado para la banda, vuelve vacío y ni lo llama", async () => {
    expect(await fechas(b.id)).toEqual([]);
    expect(respuestas).toHaveLength(0);
  });

  it("si no existe (módulo que no está en este build, o nombre mal escrito), vacío", async () => {
    expect(await fechas(a.id, "ticketera.proximas-fechas")).toEqual([]);
    expect(await fechas(a.id, "ticketera-falsa.otra")).toEqual([]);
    expect(await fechas(a.id, "cualquier cosa")).toEqual([]);
  });

  it("si falla, tarda o responde otra forma, vacío: nunca rompe a quien pregunta", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await fechas(a.id, "ticketera-falsa.rota")).toEqual([]);
    expect(await fechas(a.id, "ticketera-falsa.lenta", 100)).toEqual([]);
    expect(
      await consultar(a.id, "ticketera-falsa.proximas-fechas", {}, { vacio: "nada", interpretar: () => { throw new Error("x"); } }, reg),
    ).toBe("nada");
    expect(error.mock.calls.map((c) => c[0])).toEqual([
      expect.stringMatching(/ticketera-falsa\.rota .*se rompió la base/),
      expect.stringMatching(/ticketera-falsa\.lenta .*no respondió en 100 ms/),
      expect.stringMatching(/ticketera-falsa\.proximas-fechas/),
    ]);
  });

  it("quien pregunta recibe una copia: no comparte objetos con quien responde", async () => {
    const r = await consultar(a.id, "ticketera-falsa.proximas-fechas", { limite: 1 }, { vacio: null, interpretar: (x) => x as Fecha[] }, reg);
    r![0].nombre = "cambiado";
    expect((respuestas[0] as Fecha[])[0].nombre).toBe("Show de Banda A");
  });
});

describe("contrato", () => {
  const base = { nombre: "x", permisos: [] };
  const responder = async () => null;
  it.each([
    [[{ nombre: "Proximas", responder }], /nombre inválido/],
    [[{ nombre: "a", responder }, { nombre: "a", responder }], /repetida/],
    [[{ nombre: "a" }], /falta responder/],
  ])("el registro rechaza consultas mal declaradas (%#)", (consultas, error) => {
    expect(() => crearRegistro([{ ...base, id: "m", consultas } as Modulo])).toThrow(error);
  });
});
