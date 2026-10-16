import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { guardarArchivo } from "@/nucleo/archivos";
import { prisma } from "@/nucleo/db/cliente";
import { conTenant } from "@/nucleo/db/con-tenant";
import { publicar } from "../modulos/sitio/contenido";
import { dosBandas, dueno } from "./apoyo";

let a: { id: string };

beforeAll(async () => {
  ({ a } = await dosBandas());
});
beforeEach(async () => {
  await dueno.archivo.deleteMany();
  await dueno.sitioPublicacion.deleteMany();
});
afterAll(async () => {
  await prisma.$disconnect();
  await dueno.$disconnect();
});

const subir = async () =>
  guardarArchivo(
    a.id,
    { nombre: "logo.png", datos: await sharp({ create: { width: 8, height: 8, channels: 3, background: "#000" } }).png().toBuffer() },
    { moduloId: "sitio", recurso: "logo", tipos: ["png"] },
  );

describe("publicar no borra una imagen que se está subiendo (C3)", () => {
  it("un archivo recién subido y todavía sin enlazar sobrevive a una publicación en el medio", async () => {
    const nuevo = await subir();
    await conTenant(a.id, (tx) => publicar(tx, a.id, null as never));
    expect(await dueno.archivo.count({ where: { id: nuevo.id } })).toBe(1);
  });

  it("uno que nadie usa desde hace más de una hora se borra al publicar", async () => {
    const viejo = await subir();
    await dueno.archivo.update({ where: { id: viejo.id }, data: { creadoEn: new Date(Date.now() - 2 * 3600_000) } });
    await conTenant(a.id, (tx) => publicar(tx, a.id, null as never));
    expect(await dueno.archivo.count({ where: { id: viejo.id } })).toBe(0);
  });
});
