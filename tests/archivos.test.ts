import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  borrarArchivos,
  ErrorArchivo,
  guardarArchivo,
  marcarPublicos,
  servirArchivo,
  urlArchivo,
  usoAlmacenamiento,
} from "@/nucleo/archivos";
import { almacen } from "@/nucleo/archivos/almacen";
import { detectarTipo } from "@/nucleo/archivos/tipos";
import { prisma } from "@/nucleo/db/cliente";
import { conTenant } from "@/nucleo/db/con-tenant";
import { esperarEventos } from "@/nucleo/eventos/bus";
import { dosBandas, dueno } from "./apoyo";

let a: { id: string };
let b: { id: string };

const foto = (ancho: number, alto: number) =>
  sharp({ create: { width: ancho, height: alto, channels: 3, background: "#c0392b" } }).jpeg({ quality: 95 }).toBuffer();
const png = () => sharp({ create: { width: 64, height: 64, channels: 4, background: "#0000" } }).png().toBuffer();
const SVG = Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const PDF = Buffer.from("%PDF-1.4\n%fake rider\n");
const opciones = { moduloId: "sitio", tipos: ["jpeg", "png", "webp", "svg", "pdf"] as const };

beforeAll(async () => {
  ({ a, b } = await dosBandas());
});
beforeEach(async () => {
  await dueno.archivo.deleteMany();
  await dueno.tenant.updateMany({ data: { limiteAlmacenamiento: null } });
});
afterAll(async () => {
  await prisma.$disconnect();
  await dueno.$disconnect();
});

const guardar = (tenantId: string, nombre: string, datos: Buffer, extra: object = {}) =>
  guardarArchivo(tenantId, { nombre, datos }, { ...opciones, tipos: [...opciones.tipos], ...extra });

describe("detección por contenido", () => {
  it("reconoce cada formato por sus bytes, no por el nombre", async () => {
    expect(detectarTipo(await foto(4, 4))).toBe("jpeg");
    expect(detectarTipo(await png())).toBe("png");
    expect(detectarTipo(await sharp(await png()).webp().toBuffer())).toBe("webp");
    expect(detectarTipo(PDF)).toBe("pdf");
    expect(detectarTipo(SVG)).toBe("svg");
    expect(detectarTipo(Buffer.from("hola"))).toBeNull();
  });

  it("rechaza un formato que el módulo no acepta, aunque la extensión mienta", async () => {
    await expect(
      guardarArchivo(a.id, { nombre: "logo.png", datos: PDF }, { moduloId: "sitio", tipos: ["png", "webp"] }),
    ).rejects.toThrow('"logo.png" no es un formato aceptado acá (PNG, WEBP).');
  });

  it("rechaza archivos más grandes que el máximo del módulo", async () => {
    await expect(guardar(a.id, "rider.pdf", PDF, { maxBytes: 10 })).rejects.toThrow(/pesa .* el máximo es/);
  });
});

describe("versiones livianas", () => {
  it("una foto de 4000px genera la versión web reducida en WebP; el original queda intacto", async () => {
    const original = await foto(4000, 3000);
    const g = await guardar(a.id, "show.jpg", original, { variantes: [{ nombre: "web", ancho: 1600 }] });
    expect(g.variantes).toEqual(["web"]);

    const res = await servirArchivo(a.id, g.id, { soloPublicos: false, variante: "web" });
    const web = Buffer.from(await res.arrayBuffer());
    expect(res.headers.get("content-type")).toBe("image/webp");
    const meta = await sharp(web).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 1600, 1200]);
    expect(web.length).toBeLessThan(original.length);

    const orig = Buffer.from(await (await servirArchivo(a.id, g.id, { soloPublicos: false })).arrayBuffer());
    expect(orig.equals(original)).toBe(true);
  });

  it("no agranda imágenes chicas, y no genera versiones de un PDF ni de un SVG", async () => {
    const chica = await guardar(a.id, "chica.jpg", await foto(300, 200), { variantes: [{ nombre: "web", ancho: 1600 }] });
    const meta = await sharp(Buffer.from(await (await servirArchivo(a.id, chica.id, { soloPublicos: false, variante: "web" })).arrayBuffer())).metadata();
    expect(meta.width).toBe(300);
    const pdf = await guardar(a.id, "rider.pdf", PDF, { variantes: [{ nombre: "web", ancho: 1600 }] });
    expect(pdf.variantes).toEqual([]);
  });
});

describe("prueba 8: SVG", () => {
  it("se sirve como descarga y sin poder ejecutar nada, nunca para renderizar", async () => {
    const g = await guardar(a.id, "logo.svg", SVG);
    const res = await servirArchivo(a.id, g.id, { soloPublicos: false });
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(res.headers.get("content-disposition")).toBe("attachment; filename*=UTF-8''logo.svg");
    expect(res.headers.get("content-security-policy")).toMatch(/sandbox/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("una imagen se muestra en línea, salvo que se pida descargar", async () => {
    const g = await guardar(a.id, "foto.jpg", await foto(10, 10));
    expect((await servirArchivo(a.id, g.id, { soloPublicos: false })).headers.get("content-disposition")).toBeNull();
    expect((await servirArchivo(a.id, g.id, { soloPublicos: false, descargar: true })).headers.get("content-disposition")).toMatch(/^attachment/);
  });
});

describe("prueba 9: cuota", () => {
  it("pasada la cuota, la subida se rechaza con un mensaje claro y no deja nada", async () => {
    const datos = await foto(800, 600);
    await dueno.tenant.update({ where: { id: a.id }, data: { limiteAlmacenamiento: BigInt(datos.length * 2 + 10) } });
    await guardar(a.id, "uno.jpg", datos);
    await guardar(a.id, "dos.jpg", datos);
    const error = await guardar(a.id, "tres.jpg", datos).catch((e) => e);
    expect(error).toBeInstanceOf(ErrorArchivo);
    expect(error.message).toMatch(/^No hay espacio para "tres.jpg" \(.+\): la banda ya usa .+ de .+\. Borrá archivos que no uses( o escribinos para tener más espacio\.|\. .+)$/);
    expect(await dueno.archivo.count({ where: { tenantId: a.id } })).toBe(2);
  });

  it("las versiones livianas cuentan para la cuota; la cuota es por banda", async () => {
    const g = await guardar(a.id, "show.jpg", await foto(2000, 1500), { variantes: [{ nombre: "web", ancho: 800 }] });
    const { usado } = await usoAlmacenamiento(a.id);
    const fila = await dueno.archivo.findUniqueOrThrow({ where: { id: g.id } });
    expect(usado).toBe(fila.bytes);
    expect((await usoAlmacenamiento(b.id)).usado).toBe(BigInt(0));
  });

  it("borrar libera el espacio, y los bytes se borran al confirmar", async () => {
    const g = await guardar(a.id, "uno.jpg", await foto(100, 100));
    await conTenant(a.id, (tx) => borrarArchivos(tx, a.id, [g.id]));
    await esperarEventos();
    expect((await usoAlmacenamiento(a.id)).usado).toBe(BigInt(0));
    await new Promise((r) => setTimeout(r, 50));
    expect(await almacen().leer(`${a.id}/${g.id}`)).toBeNull();
  });
});

describe("prueba 6 (núcleo): un archivo de la banda A no se sirve con la banda B", () => {
  it("404 con el tenant de B, aunque se conozca el id", async () => {
    const g = await guardar(a.id, "foto.jpg", await foto(10, 10));
    await conTenant(a.id, (tx) => marcarPublicos(tx, [g.id], true));
    expect((await servirArchivo(a.id, g.id, { soloPublicos: true })).status).toBe(200);
    expect((await servirArchivo(b.id, g.id, { soloPublicos: true })).status).toBe(404);
    expect((await servirArchivo(b.id, g.id, { soloPublicos: false })).status).toBe(404);
  });

  it("el sitio público solo sirve los archivos marcados como públicos", async () => {
    const g = await guardar(a.id, "borrador.jpg", await foto(10, 10));
    expect((await servirArchivo(a.id, g.id, { soloPublicos: true })).status).toBe(404);
    expect((await servirArchivo(a.id, g.id, { soloPublicos: false })).status).toBe(200);
  });

  it("urlArchivo arma las rutas del sitio y del panel", () => {
    const ref = { id: "123", nombre: "Rider técnico.pdf" };
    expect(urlArchivo(ref)).toBe("/archivos/123/Rider%20t%C3%A9cnico.pdf");
    expect(urlArchivo(ref, { variante: "web", panelSlug: "banda-a" })).toBe("/b/banda-a/archivos/123/Rider%20t%C3%A9cnico.pdf?v=web");
    expect(urlArchivo(ref, { descargar: true })).toBe("/archivos/123/Rider%20t%C3%A9cnico.pdf?descargar=1");
  });
});
