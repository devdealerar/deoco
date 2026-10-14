import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { limpiarCorreos, plazosDeCorreo } from "@/nucleo/correo/limpieza";
import { prisma } from "@/nucleo/db/cliente";
import { dosBandas, dueno } from "./apoyo";

// Limpieza de correos enviados: adjuntos a los 7 días, cuerpo a los 90, fila al año. Lo
// pendiente o fallido no se toca nunca.

const DIA = 86_400_000;
const ahora = new Date("2027-06-01T12:00:00Z");
const hace = (dias: number) => new Date(ahora.getTime() - dias * DIA);
let e: Awaited<ReturnType<typeof dosBandas>>;

beforeAll(async () => {
  e = await dosBandas();
});
afterAll(async () => {
  await prisma.$disconnect();
  await dueno.$disconnect();
});

const correo = (asunto: string, estado: "ENVIADO" | "FALLIDO" | "PENDIENTE", dias: number, tenantId = e.a.id) =>
  dueno.correo.create({
    data: {
      tenantId, moduloId: "tienda", para: "fan@x.com", nombreRemitente: "Banda", asunto, html: "<p>hola</p>", texto: "hola", estado,
      adjuntos: [{ nombre: "qr.png", tipo: "image/png", cid: "qr", base64: "AAAA" }],
      creadoEn: hace(dias), enviadoEn: estado === "ENVIADO" ? hace(dias) : null,
    },
  });

describe("limpieza de correos", () => {
  it("adjuntos a los 7 días, cuerpo a los 90, fila al año; nunca lo pendiente o fallido", async () => {
    await correo("nuevo", "ENVIADO", 2);
    await correo("semana", "ENVIADO", 10, e.b.id);
    await correo("trimestre", "ENVIADO", 100);
    await correo("viejo", "ENVIADO", 400);
    await correo("fallido viejo", "FALLIDO", 400);
    await correo("pendiente viejo", "PENDIENTE", 400);

    // Cada paso cuenta lo que tocó (el viejo pasa por los tres antes de borrarse).
    expect(await limpiarCorreos(ahora)).toEqual({ adjuntos: 3, cuerpos: 2, borrados: 1 });
    const filas = Object.fromEntries((await dueno.correo.findMany()).map((c) => [c.asunto, c]));
    expect(Object.keys(filas).sort()).toEqual(["fallido viejo", "nuevo", "pendiente viejo", "semana", "trimestre"]);
    expect(filas.nuevo).toMatchObject({ html: "<p>hola</p>", adjuntos: [{ nombre: "qr.png" }] });
    expect(filas.semana).toMatchObject({ html: "<p>hola</p>", adjuntos: [] });
    expect(filas.trimestre).toMatchObject({ html: "", texto: "", adjuntos: [], para: "fan@x.com", asunto: "trimestre" });
    for (const k of ["fallido viejo", "pendiente viejo"]) expect(filas[k]).toMatchObject({ html: "<p>hola</p>", adjuntos: [{ nombre: "qr.png" }] });
    // Otra pasada: nada más que hacer.
    expect(await limpiarCorreos(ahora)).toEqual({ adjuntos: 0, cuerpos: 0, borrados: 0 });
  });

  it("en tandas", async () => {
    await dueno.correo.deleteMany();
    for (let i = 0; i < 7; i++) await correo(`c${i}`, "ENVIADO", 10);
    expect((await limpiarCorreos(ahora, plazosDeCorreo({}), 3)).adjuntos).toBe(7);
  });

  it("plazos configurables; los inválidos, por defecto; nunca uno menor que el anterior", () => {
    expect(plazosDeCorreo({})).toEqual({ adjuntos: 7, cuerpo: 90, borrar: 365 });
    expect(plazosDeCorreo({ DEOCO_CORREO_DIAS_ADJUNTOS: "3", DEOCO_CORREO_DIAS_CUERPO: "30", DEOCO_CORREO_DIAS_BORRAR: "180" })).toEqual({ adjuntos: 3, cuerpo: 30, borrar: 180 });
    expect(plazosDeCorreo({ DEOCO_CORREO_DIAS_ADJUNTOS: "0", DEOCO_CORREO_DIAS_CUERPO: "x" })).toEqual({ adjuntos: 7, cuerpo: 90, borrar: 365 });
    expect(plazosDeCorreo({ DEOCO_CORREO_DIAS_ADJUNTOS: "100", DEOCO_CORREO_DIAS_CUERPO: "30", DEOCO_CORREO_DIAS_BORRAR: "50" })).toEqual({ adjuntos: 100, cuerpo: 100, borrar: 100 });
  });
});
