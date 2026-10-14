import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listarBandas } from "@/app/admin/_servidor/bandas";
import { dbAdmin } from "@/app/admin/_servidor/db";
import { listarFallidos, nombresConFallidos } from "@/app/admin/_servidor/eventos";
import { POR_PAGINA } from "@/app/admin/_servidor/listado";
import { listarUsuarios } from "@/app/admin/_servidor/usuarios";
import { prisma } from "@/nucleo/db/cliente";
import { dueno, escenarioAcceso } from "./apoyo";

// Listados del back office: la página, el filtro y el orden los resuelve la base. Con
// muchas filas, cada pedido trae solo las 50 de la página.

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
const LOTES = 118;
const ESTADOS = ["ACTIVO", "MOROSO", "SUSPENDIDO", "ARCHIVADO"] as const;
const lote = (i: number) => `Lote ${String(i).padStart(3, "0")}`;
const desdeAntes = (min: number) => new Date(Date.UTC(2025, 0, 1, 0, min));

beforeAll(async () => {
  e = await escenarioAcceso();
  await dueno.tenant.createMany({
    data: [
      ...Array.from({ length: LOTES }, (_, i) => ({
        nombre: lote(i + 1),
        slug: `lote-${String(i + 1).padStart(3, "0")}`,
        estado: ESTADOS[i % 4],
        creadoEn: desdeAntes(i),
      })),
      { nombre: "100%_real", slug: "cien-real", creadoEn: desdeAntes(500) },
    ],
  });
  const id = async (slug: string) => (await dueno.tenant.findUniqueOrThrow({ where: { slug } })).id;
  const archivo = async (slug: string, bytes: number) =>
    dueno.archivo.create({ data: { tenantId: await id(slug), moduloId: "sitio", nombre: "x.png", tipo: "png", bytes } });
  await archivo("lote-010", 4000);
  await archivo("lote-010", 5000);
  await archivo("lote-005", 5000);
  await archivo("banda-a", 100);

  await dueno.usuario.createMany({
    data: Array.from({ length: 60 }, (_, i) => ({
      email: `persona-${String(i).padStart(2, "0")}@x.com`,
      nombre: `Persona ${String(i).padStart(2, "0")}`,
      hashContrasena: "x",
      creadoEn: desdeAntes(i),
    })),
  });
  await dueno.usuario.create({ data: { email: "rara@x.com", nombre: "Con 100%_de nombre", hashContrasena: "x", creadoEn: desdeAntes(999) } });

  const fallo = (tenantId: string, nombre: string, min: number) => ({
    tenantId,
    nombre,
    payload: {},
    estado: "FALLIDO" as const,
    intentos: 1,
    fecha: desdeAntes(min),
    fallos: [{ intento: 1, moduloId: "prueba", error: "no respondió", fecha: desdeAntes(min).toISOString() }],
  });
  await dueno.evento.createMany({
    data: [
      ...Array.from({ length: 55 }, (_, i) => fallo(e.a.id, i % 2 ? "pedido.pagado" : "entrada.emitida", i)),
      ...Array.from({ length: 7 }, (_, i) => fallo(e.b.id, "pedido.pagado", 100 + i)),
      { tenantId: e.a.id, nombre: "sitio.publicado", payload: {}, estado: "PROCESADO" },
    ],
  });
});
afterAll(async () => {
  await prisma.$disconnect();
  await dbAdmin().$disconnect();
  await dueno.$disconnect();
});

describe("bandas", () => {
  const todas = { orden: { columna: "alta", direccion: "desc" }, pagina: 1 } as const;

  it("50 por página, las más nuevas primero; la página se calcula en la base", async () => {
    const total = await dueno.tenant.count();
    const p1 = await listarBandas(todas);
    expect(p1).toMatchObject({ pagina: 1, paginas: Math.ceil(total / POR_PAGINA), total });
    expect(p1.filas).toHaveLength(POR_PAGINA);
    const vistas = [p1.filas];
    for (let n = 2; n <= p1.paginas; n++) vistas.push((await listarBandas({ ...todas, pagina: n })).filas);
    const fechas = vistas.flat().map((b) => b.creadoEn.getTime());
    expect(fechas).toHaveLength(total);
    expect(new Set(vistas.flat().map((b) => b.id)).size).toBe(total); // ninguna repetida entre páginas
    expect(fechas).toEqual([...fechas].sort((x, y) => y - x));
  });

  it("una página que no existe muestra la última", async () => {
    const r = await listarBandas({ ...todas, pagina: 99 });
    expect(r.pagina).toBe(r.paginas);
    expect(r.filas.length).toBeGreaterThan(0);
  });

  it("filtra por estado y por nombre o slug, sin importar mayúsculas; % y _ se buscan literales", async () => {
    const morosas = await listarBandas({ ...todas, estado: "MOROSO" });
    expect(morosas.total).toBe(await dueno.tenant.count({ where: { estado: "MOROSO" } }));
    expect(new Set(morosas.filas.map((b) => b.estado))).toEqual(new Set(["MOROSO"]));

    expect((await listarBandas({ ...todas, buscar: "LOTE 01" })).total).toBe(10); // 010 a 019
    expect((await listarBandas({ ...todas, buscar: "lote-11" })).filas.map((b) => b.slug).sort()).toEqual([
      "lote-110",
      "lote-111",
      "lote-112",
      "lote-113",
      "lote-114",
      "lote-115",
      "lote-116",
      "lote-117",
      "lote-118",
    ]);
    expect((await listarBandas({ ...todas, buscar: "%_" })).filas.map((b) => b.slug)).toEqual(["cien-real"]);
    expect((await listarBandas({ ...todas, buscar: "lote 01", estado: "ACTIVO" })).filas.map((b) => b.nombre).sort()).toEqual([
      "Lote 013",
      "Lote 017",
    ]);
  });

  it("ordena por espacio usado (suma de sus archivos) y por nombre", async () => {
    const porEspacio = await listarBandas({ ...todas, orden: { columna: "espacio", direccion: "desc" } });
    expect(porEspacio.filas.slice(0, 3).map((b) => [b.slug, b.usado])).toEqual([
      ["lote-010", BigInt(9000)],
      ["lote-005", BigInt(5000)],
      ["banda-a", BigInt(100)],
    ]);
    const nombres = (await listarBandas({ ...todas, orden: { columna: "nombre", direccion: "asc" } })).filas.map((b) => b.nombre);
    expect(nombres.slice(0, 2)).toEqual(["100%_real", "Banda A"]);
  });
});

describe("usuarios", () => {
  const todos = { orden: { columna: "alta", direccion: "desc" }, pagina: 1 } as const;

  it("50 por página, los más nuevos primero", async () => {
    const total = await dueno.usuario.count();
    const p1 = await listarUsuarios(todos);
    expect(p1).toMatchObject({ pagina: 1, total, paginas: Math.ceil(total / POR_PAGINA) });
    expect(p1.filas).toHaveLength(POR_PAGINA);
    const fechas = p1.filas.map((u) => u.creadoEn.getTime());
    expect(fechas).toEqual([...fechas].sort((x, y) => y - x));
  });

  it("busca por nombre o email; solo staff; ordena por nombre", async () => {
    expect((await listarUsuarios({ ...todos, buscar: "PERSONA 0" })).total).toBe(10);
    expect((await listarUsuarios({ ...todos, buscar: "persona-59@" })).filas.map((u) => u.nombre)).toEqual(["Persona 59"]);
    expect((await listarUsuarios({ ...todos, buscar: "%_" })).filas.map((u) => u.email)).toEqual(["rara@x.com"]);
    expect((await listarUsuarios({ ...todos, soloStaff: true })).filas.map((u) => u.email)).toEqual(["staff@deoco.com"]);
    const porNombre = await listarUsuarios({ ...todos, orden: { columna: "nombre", direccion: "desc" } });
    expect(porNombre.filas[0].nombre).toBe("staff@deoco.com");
  });
});

describe("eventos fallidos", () => {
  it("50 por página, los más recientes primero; solo FALLIDOS", async () => {
    const p1 = await listarFallidos({ pagina: 1 });
    expect(p1).toMatchObject({ total: 62, paginas: 2, pagina: 1 });
    expect(p1.filas).toHaveLength(POR_PAGINA);
    expect(p1.filas[0].fecha).toEqual(desdeAntes(106));
    expect((await listarFallidos({ pagina: 2 })).filas).toHaveLength(12);
  });

  it("filtra por banda (nombre o slug) y por nombre de evento", async () => {
    expect((await listarFallidos({ pagina: 1, banda: "banda-b" })).total).toBe(7);
    expect((await listarFallidos({ pagina: 1, banda: "BANDA A" })).total).toBe(55);
    expect((await listarFallidos({ pagina: 1, banda: "banda a", nombre: "pedido.pagado" })).total).toBe(27);
    expect(await nombresConFallidos()).toEqual(["entrada.emitida", "pedido.pagado"]);
  });
});
