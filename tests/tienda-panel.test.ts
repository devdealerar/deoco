import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { conStaffComo } from "@/nucleo/acceso/staff";
import { conTenant } from "@/nucleo/db/con-tenant";
import { prisma } from "@/nucleo/db/cliente";
import { actualizarProductoBase, type ComoStaff, crearProductoBase, crearProveedor, leerOpciones } from "../modulos/tienda/catalogo";
import {
  actualizarProducto,
  crearProducto,
  margen,
  productosPublicados,
  publicarProducto,
  subirDiseno,
} from "../modulos/tienda/productos";
import { dueno, escenarioAcceso } from "./apoyo";

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
let comoStaff: ComoStaff;
let remera: Awaited<ReturnType<typeof crearProductoBase>>;
let poster: Awaited<ReturnType<typeof crearProductoBase>>;

const png = (ancho: number, alto: number, dpi?: number) => {
  const s = sharp({ create: { width: ancho, height: alto, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  return (dpi ? s.withMetadata({ density: dpi }) : s).png().toBuffer();
};
async function pdf(anchoCm: number, altoCm: number) {
  const doc = await PDFDocument.create();
  doc.addPage([(anchoCm / 2.54) * 72, (altoCm / 2.54) * 72]);
  return Buffer.from(await doc.save());
}

beforeAll(async () => {
  e = await escenarioAcceso();
  comoStaff = (accion, fn) => conStaffComo(e.staff.id, accion, fn);
  await dueno.tiendaProductoBase.deleteMany();
  await dueno.tiendaProveedor.deleteMany();
  await crearProveedor(comoStaff, { nombre: "Estampados Sur", email: "ordenes@sur.com", contacto: "", formatos: ["png", "pdf"] });
  const base = {
    descripcion: "",
    costoProduccion: 900000,
    costoEnvio: 350000,
    proveedorId: null,
    impresionDpi: 300,
  };
  remera = await crearProductoBase(comoStaff, {
    ...base,
    nombre: "Remera",
    opciones: leerOpciones("Talle: S, M, L, XL\nColor: Negro, Blanco"),
    impresionAnchoPx: 4200,
    impresionAltoPx: 4800,
    impresionFormatos: ["png"],
  });
  poster = await crearProductoBase(comoStaff, {
    ...base,
    nombre: "Poster",
    opciones: [],
    costoProduccion: 450000,
    costoEnvio: 300000,
    impresionAnchoPx: 3508,
    impresionAltoPx: 4961,
    impresionFormatos: ["pdf", "png"],
  });
});
beforeEach(async () => {
  await dueno.tiendaPedidoItem.deleteMany();
  await dueno.tiendaPedido.deleteMany();
  await dueno.tiendaProducto.deleteMany();
  await dueno.tiendaDiseno.deleteMany();
  await dueno.archivo.deleteMany({ where: { moduloId: "tienda" } });
  await dueno.tiendaProductoBase.updateMany({ data: { activo: true } });
});
afterAll(async () => {
  await prisma.$disconnect();
  await dueno.$disconnect();
});

const disenoBueno = async (tenantId = e.a.id) =>
  subirDiseno(tenantId, "Logo gira", { nombre: "logo.png", datos: await png(4200, 4800, 300) }, remera.id);

describe("prueba 1: un diseño que no cumple, con el motivo exacto", () => {
  it("PNG chico: dice cuánto necesita y cuánto subió; no se guarda nada", async () => {
    await expect(subirDiseno(e.a.id, "chico", { nombre: "chico.png", datos: await png(800, 800, 300) }, remera.id)).rejects.toThrow(
      "Para Remera necesita 4200×4800 px, subiste 800×800 px.",
    );
    expect(await dueno.tiendaDiseno.count()).toBe(0);
    expect(await dueno.archivo.count({ where: { moduloId: "tienda" } })).toBe(0);
  });

  it("resolución: baja o sin declarar", async () => {
    await expect(subirDiseno(e.a.id, "x", { nombre: "x.png", datos: await png(4200, 4800, 150) }, remera.id)).rejects.toThrow(
      "Necesita 300 dpi, el archivo tiene 150 dpi.",
    );
    await expect(subirDiseno(e.a.id, "x", { nombre: "x.png", datos: await png(4200, 4800) }, remera.id)).rejects.toThrow(
      "El PNG no indica su resolución: exportalo a 300 dpi.",
    );
  });

  it("formato: PDF donde solo va PNG; SVG o JPG nunca", async () => {
    await expect(subirDiseno(e.a.id, "x", { nombre: "x.pdf", datos: await pdf(40, 50) }, remera.id)).rejects.toThrow(
      "Remera acepta PNG, subiste PDF.",
    );
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    await expect(subirDiseno(e.a.id, "x", { nombre: "x.svg", datos: svg })).rejects.toThrow(/no es PNG ni PDF/);
    const jpg = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).jpeg().toBuffer();
    await expect(subirDiseno(e.a.id, "x", { nombre: "x.jpg", datos: jpg })).rejects.toThrow(/no es PNG ni PDF/);
  });

  it("PDF: el tamaño de página, en centímetros", async () => {
    await expect(subirDiseno(e.a.id, "x", { nombre: "a4.pdf", datos: await pdf(21, 29.7) }, poster.id)).rejects.toThrow(
      "Para Poster la página tiene que medir al menos 29,7×42 cm (3508×4961 px a 300 dpi); tu PDF mide 21×29,7 cm.",
    );
    const d = await subirDiseno(e.a.id, "Poster A3", { nombre: "a3.pdf", datos: await pdf(29.7, 42) }, poster.id);
    expect(d).toMatchObject({ formato: "pdf", conVistaPrevia: false });
  });

  it("el que cumple se guarda con lo medido, privado, con vista previa; sirve para varios productos", async () => {
    const d = await subirDiseno(e.a.id, "Logo gira", { nombre: "logo.png", datos: await png(4200, 5000, 300) }, remera.id);
    expect(d).toMatchObject({ formato: "png", anchoPx: 4200, altoPx: 5000, dpi: 300, conVistaPrevia: true });
    const archivo = await dueno.archivo.findUniqueOrThrow({ where: { id: d.archivoId } });
    expect(archivo).toMatchObject({ moduloId: "tienda", publico: false, variantes: ["web"] });
    // Mismo diseño, dos productos (remera y poster aceptan PNG; 4200×5000 alcanza para los dos).
    await crearProducto(e.a.id, remera.id, { disenoId: d.id, nombre: "Remera", descripcion: "", precio: 2500000, variantes: remera.opciones as never });
    await crearProducto(e.a.id, poster.id, { disenoId: d.id, nombre: "Poster", descripcion: "", precio: 1500000, variantes: [] });
    expect(await conTenant(e.a.id, (tx) => tx.tiendaProducto.count({ where: { disenoId: d.id } }))).toBe(2);
  });
});

describe("prueba 2: borrador y publicado", () => {
  it("nuevo queda en borrador y no está en la tienda; publicado sí; de vuelta a borrador, no", async () => {
    const d = await disenoBueno();
    const foto = await sharp({ create: { width: 1000, height: 1000, channels: 3, background: "#123" } }).jpeg().toBuffer();
    const p = await crearProducto(
      e.a.id,
      remera.id,
      { disenoId: d.id, nombre: "Remera gira", descripcion: "", precio: 2500000, variantes: remera.opciones as never },
      { nombre: "foto.jpg", datos: foto },
    );
    expect(p.publicado).toBe(false);
    expect(await productosPublicados(e.a.id)).toEqual([]);
    const fotoArchivo = () => dueno.archivo.findUniqueOrThrow({ where: { id: p.fotoArchivoId! } });
    expect((await fotoArchivo()).publico).toBe(false);

    await publicarProducto(e.a.id, p.id, true);
    expect((await productosPublicados(e.a.id)).map((x) => x.nombre)).toEqual(["Remera gira"]);
    expect((await fotoArchivo()).publico).toBe(true); // la foto se ve con el producto
    expect(await productosPublicados(e.b.id)).toEqual([]); // otra banda no lo ve

    await publicarProducto(e.a.id, p.id, false);
    expect(await productosPublicados(e.a.id)).toEqual([]);
    expect((await fotoArchivo()).publico).toBe(false);
  });

  it("variantes: ofrece un subconjunto, en el orden del base; nunca algo que el base no tiene", async () => {
    const d = await disenoBueno();
    const datos = (variantes: { nombre: string; valores: string[] }[]) => ({ disenoId: d.id, nombre: "R", descripcion: "", precio: 1, variantes });
    const p = await crearProducto(
      e.a.id,
      remera.id,
      datos([
        { nombre: "Talle", valores: ["L", "S", "M"] },
        { nombre: "Color", valores: ["Negro"] },
      ]),
    );
    expect(p.variantes).toEqual([
      { nombre: "Talle", valores: ["S", "M", "L"] },
      { nombre: "Color", valores: ["Negro"] },
    ]);
    await expect(crearProducto(e.a.id, remera.id, datos([{ nombre: "Talle", valores: ["XXL"] }, { nombre: "Color", valores: ["Negro"] }]))).rejects.toThrow(
      'Talle: "XXL" no es una opción de este producto.',
    );
    await expect(crearProducto(e.a.id, remera.id, datos([{ nombre: "Talle", valores: ["S"] }]))).rejects.toThrow(
      "Elegí al menos un color para ofrecer.",
    );
  });

  it("un diseño de otra banda, o que no sirve para ese producto base, no se puede usar", async () => {
    const deB = await disenoBueno(e.b.id);
    const datos = (disenoId: string) => ({ disenoId, nombre: "R", descripcion: "", precio: 1000, variantes: remera.opciones as never });
    await expect(crearProducto(e.a.id, remera.id, datos(deB.id))).rejects.toThrow("Ese diseño no existe.");
    const a3 = await subirDiseno(e.a.id, "A3", { nombre: "a3.pdf", datos: await pdf(29.7, 42) }); // sin revisar al subir
    await expect(crearProducto(e.a.id, remera.id, datos(a3.id))).rejects.toThrow('El diseño "A3" no sirve: Remera acepta PNG, subiste PDF.');
  });
});

describe("pruebas 3 y 4: margen", () => {
  it("prueba 5 (parte 5): precio − costo de producción, sin restar el envío (lo paga el fan aparte)", () => {
    expect(margen(2500000, { costoProduccion: 900000 })).toEqual({
      precio: 2500000,
      costoProduccion: 900000,
      margen: 1600000,
      porcentaje: 64,
      negativo: false,
    });
    // Aunque se le pase el producto base entero (con su envío), el envío no entra.
    expect(margen(2000000, { costoProduccion: 900000, costoEnvio: 350000 } as { costoProduccion: number }).margen).toBe(1100000);
    expect(margen(1999900, { costoProduccion: 900000 }).porcentaje).toBe(55);
  });

  it("negativo: se avisa (negativo: true) y se guarda igual", async () => {
    const d = await disenoBueno();
    const p = await crearProducto(e.a.id, remera.id, { disenoId: d.id, nombre: "A pérdida", descripcion: "", precio: 800000, variantes: remera.opciones as never });
    expect(margen(p.precio, remera)).toMatchObject({ margen: -100000, porcentaje: -12.5, negativo: true });
    const otra = await actualizarProducto(e.a.id, p.id, { disenoId: d.id, nombre: "A pérdida", descripcion: "", precio: 500000, variantes: remera.opciones as never });
    expect(otra.precio).toBe(500000);
  });

  it("el margen usa los costos vigentes del producto base", async () => {
    await actualizarProductoBase(comoStaff, remera.id, {
      ...remera,
      opciones: remera.opciones as never,
      costoProduccion: 1000000,
      activo: true,
    });
    const vigente = await dueno.tiendaProductoBase.findUniqueOrThrow({ where: { id: remera.id } });
    expect(margen(2500000, vigente).margen).toBe(1500000);
    await actualizarProductoBase(comoStaff, remera.id, { ...remera, opciones: remera.opciones as never, activo: true });
  });
});

describe("prueba 5: producto base desactivado", () => {
  it("no sirve para un producto nuevo; el que ya existía se edita y se publica igual", async () => {
    const d = await disenoBueno();
    const datos = { disenoId: d.id, nombre: "Remera", descripcion: "", precio: 2500000, variantes: remera.opciones as never };
    const existente = await crearProducto(e.a.id, remera.id, datos);
    await dueno.tiendaProductoBase.update({ where: { id: remera.id }, data: { activo: false } });
    await expect(crearProducto(e.a.id, remera.id, datos)).rejects.toThrow("Remera ya no está disponible para productos nuevos.");
    await actualizarProducto(e.a.id, existente.id, { ...datos, precio: 2700000 });
    await publicarProducto(e.a.id, existente.id, true);
    expect((await productosPublicados(e.a.id)).map((p) => p.precio)).toEqual([2700000]);
  });
});
