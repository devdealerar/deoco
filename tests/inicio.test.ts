import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/nucleo/db/cliente";
import { bloquesDeInicio, interpretarBloque } from "@/nucleo/inicio";
import type { Modulo } from "@/nucleo/modulos/contrato";
import { crearRegistro } from "@/nucleo/modulos/registro";
import { alCrearBanda } from "../modulos/comercial/cuenta";
import { crearEvento, crearTipo, publicarEvento } from "../modulos/ticketera/eventos";
import { dosBandas, dueno } from "./apoyo";

// Inicio del panel: un bloque por módulo prendido con la consulta "inicio".

let e: Awaited<ReturnType<typeof dosBandas>>;
const todos = async () => true;

beforeAll(async () => {
  e = await dosBandas();
});
beforeEach(async () => {
  await dueno.moduloTenant.deleteMany();
  await dueno.comercialCuenta.deleteMany();
  await dueno.ticketeraEvento.deleteMany();
});
afterAll(async () => {
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("el núcleo arma los bloques", () => {
  const bloque = (titulo: string, pendientes: { texto: string; href?: string }[] = []) => ({ titulo, datos: [{ etiqueta: "x", valor: "1" }], pendientes });
  const gestor: Modulo = {
    id: "gestor", nombre: "Gestor", permisos: [],
    gestionaCuenta: { alCrearBanda: async () => {}, pantallaPago: () => null, comoAmpliar: async () => null },
    consultas: [{ nombre: "inicio", responder: async () => bloque("Cuenta") }],
  };
  const a: Modulo = {
    id: "aaa", nombre: "A", permisos: [{ clave: "aaa.cosa.ver", rolesPorDefecto: ["TITULAR"] }],
    rutasPanel: [{ ruta: "/aaa", permiso: "aaa.cosa.ver", componente: () => null }],
    navegacion: [{ etiqueta: "A", href: "/aaa", permiso: "aaa.cosa.ver", orden: 50 }],
    consultas: [{ nombre: "inicio", responder: async () => bloque("A", [{ texto: "Conectá el cobro", href: "/credenciales" }]) }],
  };
  const b: Modulo = {
    id: "bbb", nombre: "B", permisos: [{ clave: "bbb.cosa.ver", rolesPorDefecto: ["TITULAR"] }],
    rutasPanel: [{ ruta: "/bbb", permiso: "bbb.cosa.ver", componente: () => null }],
    navegacion: [{ etiqueta: "B", href: "/bbb", permiso: "bbb.cosa.ver", orden: 10 }],
    consultas: [{ nombre: "inicio", responder: async () => bloque("B", [{ texto: "Conectá el cobro", href: "//afuera" }]) }],
  };
  const roto: Modulo = { id: "roto", nombre: "Roto", permisos: [], consultas: [{ nombre: "inicio", responder: async () => ({ titulo: 3 }) }] };
  const sinInicio: Modulo = { id: "sin", nombre: "Sin", permisos: [] };
  const reg = crearRegistro([gestor, a, b, roto, sinInicio]);
  const prender = (ids: string[]) => dueno.moduloTenant.createMany({ data: ids.map((moduloId) => ({ tenantId: e.a.id, moduloId })) });

  it("en el orden del menú, el gestor primero; apagado o mal formado → sin bloque; pendientes una vez", async () => {
    await prender(["gestor", "aaa", "bbb", "roto", "sin"]);
    const r = await bloquesDeInicio(e.a.id, todos, reg);
    expect(r.map((x) => x.titulo)).toEqual(["Cuenta", "B", "A"]);
    // El pendiente repetido sale una vez (el de B, que va primero; su href a otro sitio no pasa).
    expect(r.flatMap((x) => x.pendientes)).toEqual([{ texto: "Conectá el cobro", href: undefined }]);
    await dueno.moduloTenant.deleteMany({ where: { moduloId: "bbb" } });
    expect((await bloquesDeInicio(e.a.id, todos, reg)).map((x) => x.titulo)).toEqual(["Cuenta", "A"]);
  });

  it("cada bloque lo ve quien puede: el del gestor, solo si así lo decide la página (titular)", async () => {
    await prender(["gestor", "aaa", "bbb"]);
    const r = await bloquesDeInicio(e.a.id, async (id, esGestor) => !esGestor && id === "aaa", reg);
    expect(r.map((x) => x.titulo)).toEqual(["A"]);
  });

  it("interpretarBloque recorta y valida", () => {
    expect(interpretarBloque(null)).toBeNull();
    expect(() => interpretarBloque({ titulo: "" })).toThrow();
    expect(interpretarBloque({ titulo: "T", datos: Array.from({ length: 20 }, (_, i) => ({ etiqueta: `e${i}`, valor: "v" })) })!.datos).toHaveLength(8);
  });
});

describe("con los módulos de verdad", () => {
  it("cuenta, sitio, tienda y entradas; con la ticketera apagada no hay bloque de entradas", async () => {
    await alCrearBanda(e.a.id); // prueba de Escenario: sitio, tienda y ticketera
    const show = await crearEvento(e.a.id, { nombre: "Gira", fecha: new Date(Date.now() + 5 * 86_400_000), lugar: "Club", ciudad: "Rosario", direccion: "", descripcion: "" });
    await crearTipo(e.a.id, show, { nombre: "General", precio: 100000, cupo: 120, ventaDesde: null, ventaHasta: null });
    await publicarEvento(e.a.id, show, true);

    const r = await bloquesDeInicio(e.a.id, todos);
    expect(r.map((x) => x.titulo)).toEqual(["Tu cuenta", "Sitio", "Tienda", "Entradas"]);
    const dato = (titulo: string, etiqueta: string) => r.find((x) => x.titulo === titulo)!.datos.find((d) => d.etiqueta === etiqueta)?.valor;
    expect(dato("Tu cuenta", "Plan")).toBe("Escenario (prueba)");
    expect(dato("Tienda", "Pedidos del mes")).toBe("0");
    expect(dato("Entradas", "Próximo show")).toMatch(/^Gira · /);
    expect(dato("Entradas", "Disponibles")).toBe("120");
    const pendientes = r.flatMap((x) => x.pendientes.map((p) => p.texto));
    expect(pendientes).toContain("Tu sitio todavía no está publicado: armalo y publicalo.");
    expect(pendientes.filter((p) => p.startsWith("Conectá tu cuenta de cobro"))).toHaveLength(1);
    expect(pendientes.some((p) => p.startsWith("Elegí tu plan antes del"))).toBe(true);

    await dueno.moduloTenant.deleteMany({ where: { tenantId: e.a.id, moduloId: "ticketera" } });
    expect((await bloquesDeInicio(e.a.id, todos)).map((x) => x.titulo)).not.toContain("Entradas");
  });
});
