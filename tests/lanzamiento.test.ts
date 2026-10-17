import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { conStaffComo } from "@/nucleo/acceso/staff";
import { prisma } from "@/nucleo/db/cliente";
import { conTenant } from "@/nucleo/db/con-tenant";
import { diaArgentino } from "@/nucleo/fechas";
import {
  atrasados,
  campania,
  cancelarCampania,
  crearCampania,
  cumpleMedida,
  estadoDeHito,
  guardarFormato,
  guardarTarea,
  marcarHito,
  moverFecha,
  subirPieza,
} from "../modulos/lanzamiento/campanias";
import { inicioLanzamiento } from "../modulos/lanzamiento/inicio";
import { dueno, escenarioAcceso, sembrarComercial } from "./apoyo";

// Organizador de lanzamiento (3.2, etapa 2). Casos de borde ratificados (lanzamiento d1).

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
const DIA = 86_400_000;
const enDias = (n: number) => diaArgentino(new Date(Date.now() + n * DIA));
const imagen = (ancho: number, alto: number) => sharp({ create: { width: ancho, height: alto, channels: 3, background: "#123456" } }).png().toBuffer();

beforeAll(async () => {
  e = await escenarioAcceso();
});
beforeEach(async () => {
  await dueno.$executeRawUnsafe(`TRUNCATE "lanzamiento_campania" CASCADE`);
  await sembrarComercial(); // la plantilla y las medidas de arranque
  await dueno.moduloTenant.createMany({ data: [{ tenantId: e.a.id, moduloId: "lanzamiento" }], skipDuplicates: true });
});
afterAll(async () => {
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("campaña", () => {
  it("se arma sola: unas veinte tareas con dependencias y una pieza por formato", async () => {
    const id = await crearCampania(e.a.id, e.multi.id, { titulo: "Nuevo single", tipo: "single", fecha: enDias(60) });
    const c = (await campania(e.a.id, id))!;
    expect(c.hitos.length).toBeGreaterThanOrEqual(18);
    expect(c.piezas.length).toBeGreaterThanOrEqual(10);
    const distribuidora = c.hitos.find((h) => h.clave === "distribuidora")!;
    expect(distribuidora.dependeDe).toEqual(["master", "arte", "metadatos"]);
    // Cada hito vence a su distancia de la fecha (al final de ese día).
    expect(diaArgentino(distribuidora.vence)).toBe(diaArgentino(new Date(c.fecha.getTime() - 35 * DIA)));
    // Interna: ninguna ruta pública.
    const { registro } = await import("@/nucleo/modulos");
    expect(registro().modulo("lanzamiento")!.rutasPublicas ?? []).toEqual([]);
  });

  it("mover la fecha recalcula todos los hitos manteniendo las distancias", async () => {
    const id = await crearCampania(e.a.id, e.multi.id, { titulo: "EP", tipo: "ep", fecha: enDias(60) });
    const antes = (await campania(e.a.id, id))!;
    await marcarHito(e.a.id, e.multi.id, antes.hitos[0].id, true);
    expect(await moverFecha(e.a.id, e.multi.id, id, enDias(74))).toBe(14);
    const despues = (await campania(e.a.id, id))!;
    for (const h of despues.hitos) {
      const viejo = antes.hitos.find((x) => x.id === h.id)!;
      expect(h.vence.getTime() - viejo.vence.getTime()).toBe(14 * DIA);
    }
    expect(despues.hitos.find((h) => h.id === antes.hitos[0].id)!.hechoEn).not.toBeNull(); // lo hecho, hecho
  });

  it("con menos de 30 días, lo vencido se muestra atrasado (no se oculta) y va al inicio", async () => {
    const id = await crearCampania(e.a.id, e.multi.id, { titulo: "Ya casi", tipo: "single", fecha: enDias(10) });
    const c = (await campania(e.a.id, id))!;
    const vencidos = c.hitos.filter((h) => estadoDeHito(h) === "atrasado");
    expect(vencidos.length).toBeGreaterThan(5);
    expect(c.hitos.length).toBe((await campania(e.a.id, id))!.hitos.length); // nada oculto
    expect((await atrasados(e.a.id)).length).toBe(vencidos.length);
    const bloque = (await inicioLanzamiento(e.a.id))!;
    expect(bloque.pendientes).toHaveLength(1); // uno por campaña, con cuántos: no se corta en silencio
    expect(bloque.pendientes[0].texto).toContain(`${vencidos.length} hitos atrasados`);
    // Hecho, deja de estar atrasado.
    await marcarHito(e.a.id, e.multi.id, vencidos[0].id, true);
    expect((await atrasados(e.a.id)).length).toBe(vencidos.length - 1);
  });

  it("una pieza fuera de medida se acepta, marcada no conforme; no bloquea", async () => {
    const id = await crearCampania(e.a.id, e.multi.id, { titulo: "Álbum", tipo: "album", fecha: enDias(90) });
    const tapa = (await campania(e.a.id, id))!.piezas.find((p) => p.formatoId === "tapa")!;
    expect(await subirPieza(e.a.id, tapa.id, { nombre: "tapa.png", datos: await imagen(1000, 800) }, "lanzamiento")).toMatchObject({ conforme: false, ancho: 1000, alto: 800 });
    const marcada = (await campania(e.a.id, id))!.piezas.find((p) => p.id === tapa.id)!;
    expect(marcada).toMatchObject({ conforme: false, anchoReal: 1000, altoReal: 800 });
    expect(marcada.archivoId).not.toBeNull();
    expect(await subirPieza(e.a.id, tapa.id, { nombre: "tapa.png", datos: await imagen(3000, 3000) }, "lanzamiento")).toMatchObject({ conforme: true });
    expect(cumpleMedida({ ancho: 1080, alto: 1350 }, { ancho: 2160, alto: 2700 })).toBe(true); // más grande, misma proporción
    expect(cumpleMedida({ ancho: 1080, alto: 1350 }, { ancho: 1080, alto: 1080 })).toBe(false);
  });

  it("cancelada se archiva sin borrar: hitos, piezas y archivos quedan; no se cambia más", async () => {
    const id = await crearCampania(e.a.id, e.multi.id, { titulo: "Se cayó", tipo: "single", fecha: enDias(40) });
    const pieza = (await campania(e.a.id, id))!.piezas[0];
    await subirPieza(e.a.id, pieza.id, { nombre: "p.png", datos: await imagen(pieza.ancho, pieza.alto) }, "lanzamiento");
    await cancelarCampania(e.a.id, e.multi.id, id);
    const c = (await campania(e.a.id, id))!;
    expect(c.estado).toBe("CANCELADA");
    expect(c.hitos.length).toBeGreaterThan(0);
    const archivoId = c.piezas.find((p) => p.id === pieza.id)!.archivoId!;
    expect(await conTenant(e.a.id, (tx) => tx.archivo.count({ where: { id: archivoId } }))).toBe(1);
    await expect(moverFecha(e.a.id, e.multi.id, id, enDias(50))).rejects.toThrow(/cancelada/);
    // Y no aparece en el inicio.
    expect((await atrasados(e.a.id)).length).toBe(0);
  });

  it("la banda solo ve las suyas", async () => {
    await crearCampania(e.a.id, e.multi.id, { titulo: "De A", tipo: "single", fecha: enDias(30) });
    expect(await conTenant(e.b.id, (tx) => tx.lanzamientoCampania.count())).toBe(0);
  });
});

describe("plantilla y medidas (back office, sin tocar código)", () => {
  it("el staff cambia una medida y rige para las campañas nuevas; las armadas no cambian", async () => {
    const vieja = await crearCampania(e.a.id, e.multi.id, { titulo: "Antes", tipo: "single", fecha: enDias(60) });
    await conStaffComo(e.staff.id, "lanzamiento.formato_guardado", (tx) => guardarFormato(tx, "ig-post", { plataforma: "Instagram", pieza: "Posteo vertical", ancho: 1080, alto: 1440, notas: "3:4", orden: 2, activo: true }));
    await conStaffComo(e.staff.id, "lanzamiento.tarea_guardada", (tx) => guardarTarea(tx, "tiktok", { titulo: "Video para TikTok", descripcion: "", dias: -5, dependeDe: ["video"], orden: 30, activa: true }));
    await expect(conStaffComo(e.staff.id, "lanzamiento.tarea_guardada", (tx) => guardarTarea(tx, "otra", { titulo: "Otra", descripcion: "", dias: 0, dependeDe: ["no-existe"], orden: 0, activa: true }))).rejects.toThrow(/No existen/);
    const nueva = await crearCampania(e.a.id, e.multi.id, { titulo: "Después", tipo: "single", fecha: enDias(60) });
    const ig = async (id: string) => (await campania(e.a.id, id))!.piezas.find((p) => p.formatoId === "ig-post")!;
    expect((await ig(vieja)).alto).toBe(1350);
    expect((await ig(nueva)).alto).toBe(1440);
    expect((await campania(e.a.id, nueva))!.hitos.some((h) => h.clave === "tiktok")).toBe(true);
    // La banda no escribe la plantilla.
    await expect(conTenant(e.a.id, (tx) => tx.lanzamientoFormato.update({ where: { id: "tapa" }, data: { ancho: 1 } }))).rejects.toThrow();
  });
});
