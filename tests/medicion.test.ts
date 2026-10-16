import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guardarArchivo } from "@/nucleo/archivos";
import { prisma } from "@/nucleo/db/cliente";
import { medicionDeBanda } from "@/nucleo/cuenta/medicion";
import { crearRegistro, ErrorRegistro } from "@/nucleo/modulos/registro";
import { dueno, escenarioAcceso } from "./apoyo";

// Medición de uso por banda (para poner topes buenos después): lo que cuenta cada módulo
// (`mediciones` en su contrato) y los archivos, que cuenta el núcleo. Se ve en /admin.

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c636000010000050001a5f645400000000049454e44ae426082", "hex");

beforeAll(async () => {
  e = await escenarioAcceso();
});
afterAll(async () => {
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("medición de uso", () => {
  it("productos, shows, entradas, imágenes y archivos de cada banda, sin mezclar bandas", async () => {
    const t = e.a.id;
    const prov = await dueno.tiendaProveedor.create({ data: { nombre: "Prov", email: "prov@x.com", formatos: ["png"] } });
    const base = await dueno.tiendaProductoBase.create({ data: { nombre: "Remera", impresionFormatos: ["png"], impresionDpi: 300, impresionAnchoPx: 1, impresionAltoPx: 1 } });
    const archivo = await guardarArchivo(t, { nombre: "d.png", datos: PNG }, { moduloId: "tienda", recurso: "diseno", tipos: ["png"] });
    const d = await dueno.tiendaDiseno.create({ data: { tenantId: t, nombre: "D", archivoId: archivo.id, archivoNombre: "d.png", formato: "png" } });
    await dueno.tiendaProducto.createMany({
      data: [true, false, false].map((publicado, i) => ({ tenantId: t, productoBaseId: base.id, proveedorId: prov.id, disenoId: d.id, nombre: `P${i}`, precio: 1, publicado })),
    });
    const futuro = new Date(Date.now() + 60_000); // este mes: "shows publicados este mes"
    await dueno.ticketeraEvento.createMany({
      data: [
        { tenantId: t, nombre: "S1", fecha: futuro, lugar: "L", ciudad: "C", publicado: true, publicadoEn: new Date() },
        { tenantId: t, nombre: "S2", fecha: futuro, lugar: "L", ciudad: "C" },
      ],
    });
    await dueno.sitioSlide.create({ data: { tenantId: t, archivoId: archivo.id, orden: 0 } });

    const m = await medicionDeBanda(t);
    const valor = (clave: string) => m.find((x) => x.clave === clave)?.valor;
    expect(valor("tienda.productos")).toBe(3);
    expect(valor("tienda.productos-publicados")).toBe(1);
    expect(valor("ticketera.shows")).toBe(2);
    expect(valor("ticketera.shows-publicados")).toBe(1);
    expect(valor("ticketera.entradas-vendidas")).toBe(0);
    expect(valor("sitio.imagenes")).toBe(1);
    expect(valor("nucleo.archivos")).toBe(1);
    expect(valor("nucleo.almacenamiento")).toBeGreaterThan(0);
    // La otra banda, en cero.
    expect((await medicionDeBanda(e.b.id)).filter((x) => x.valor !== 0)).toEqual([]);
  });

  it("el contrato: clave del propio módulo, sin repetir", () => {
    const medir = async () => 0;
    expect(() => crearRegistro([{ id: "uno", nombre: "Uno", permisos: [], mediciones: [{ clave: "uno.cosas", etiqueta: "Cosas", medir }] }])).not.toThrow();
    expect(() => crearRegistro([{ id: "uno", nombre: "Uno", permisos: [], mediciones: [{ clave: "otro.cosas", etiqueta: "Cosas", medir }] }])).toThrow(ErrorRegistro);
    expect(() => crearRegistro([{ id: "uno", nombre: "Uno", permisos: [], mediciones: [{ clave: "uno.cosas", etiqueta: "A", medir }, { clave: "uno.cosas", etiqueta: "B", medir }] }])).toThrow(/repetida/);
  });
});
