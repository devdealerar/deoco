// Organizador de lanzamiento (3.2, etapa 2): una campaña por lanzamiento. Al crearla se arman el
// cronograma (los hitos de la plantilla, cada uno a su distancia de la fecha) y las piezas (una por
// formato). Casos de borde ratificados (3.2 lanzamiento d1):
// - se mueve la fecha → todos los hitos se recalculan manteniendo las distancias;
// - faltan menos de 30 días → los vencidos se muestran atrasados, no se ocultan;
// - un hito vence sin cumplirse → atrasado, y aparece en el inicio del panel;
// - una pieza no cumple la medida → se acepta, marcada "no conforme"; no bloquea;
// - cambian las medidas → las edita el staff (back office), sin tocar código;
// - la campaña se cancela → se archiva sin borrar; los archivos siguen.
import sharp from "sharp";
import { guardarArchivo } from "@/nucleo/archivos";
import { prisma } from "@/nucleo/db/cliente";
import { conTenant } from "@/nucleo/db/con-tenant";
import { diaArgentino } from "@/nucleo/fechas";

export class ErrorLanzamiento extends Error {}

export const TIPOS: Record<string, string> = { single: "Single", ep: "EP", album: "Álbum", video: "Video", otro: "Otro" };

const DIA = 86_400_000;
/** El día (YYYY-MM-DD) a las 00:00 de Argentina. */
export const diaDeLanzamiento = (dia: string) => new Date(`${dia}T00:00:00.000-03:00`);
const venceEn = (fecha: Date, dias: number) => new Date(fecha.getTime() + dias * DIA + (DIA - 1)); // al final de ese día

export type EstadoHito = "hecho" | "atrasado" | "esta-semana" | "pendiente";

export function estadoDeHito(h: { vence: Date; hechoEn: Date | null }, ahora = new Date()): EstadoHito {
  if (h.hechoEn) return "hecho";
  if (h.vence < ahora) return "atrasado";
  if (h.vence.getTime() - ahora.getTime() < 7 * DIA) return "esta-semana";
  return "pendiente";
}

/**
 * ¿La pieza cumple la medida? Misma proporción (con 1 % de margen) y al menos el tamaño pedido:
 * una imagen más grande en la misma proporción la achica la plataforma sin perder nada.
 */
export function cumpleMedida(pedido: { ancho: number; alto: number }, real: { ancho: number; alto: number }): boolean {
  const proporcion = Math.abs(real.ancho / real.alto - pedido.ancho / pedido.alto) / (pedido.ancho / pedido.alto);
  return proporcion <= 0.01 && real.ancho >= pedido.ancho && real.alto >= pedido.alto;
}

function leerDia(dia: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || Number.isNaN(diaDeLanzamiento(dia).getTime())) throw new ErrorLanzamiento("Elegí la fecha del lanzamiento.");
  return diaDeLanzamiento(dia);
}

/** Arma la campaña: hitos de la plantilla y piezas de los formatos activos (copias: no cambian si cambia la plantilla). */
export async function crearCampania(tenantId: string, usuarioId: string, d: { titulo: string; tipo: string; fecha: string }): Promise<string> {
  const titulo = d.titulo.trim().slice(0, 120);
  if (!titulo) throw new ErrorLanzamiento("Poné el nombre del lanzamiento.");
  const tipo = TIPOS[d.tipo] ? d.tipo : "otro";
  const fecha = leerDia(d.fecha);
  return conTenant(tenantId, async (tx) => {
    const [tareas, formatos] = await Promise.all([
      tx.lanzamientoTareaBase.findMany({ where: { activa: true }, orderBy: [{ dias: "asc" }, { orden: "asc" }] }),
      tx.lanzamientoFormato.findMany({ where: { activo: true }, orderBy: { orden: "asc" } }),
    ]);
    const c = await tx.lanzamientoCampania.create({ data: { tenantId, titulo, tipo, fecha, creadoPor: usuarioId } });
    const claves = new Set(tareas.map((t) => t.clave));
    await tx.lanzamientoHito.createMany({
      data: tareas.map((t, i) => ({
        tenantId,
        campaniaId: c.id,
        clave: t.clave,
        titulo: t.titulo,
        descripcion: t.descripcion,
        dias: t.dias,
        // Una dependencia que ya no está en la plantilla no se copia.
        dependeDe: t.dependeDe.filter((x) => claves.has(x)),
        vence: venceEn(fecha, t.dias),
        orden: i,
      })),
    });
    await tx.lanzamientoPieza.createMany({
      data: formatos.map((f, i) => ({ tenantId, campaniaId: c.id, formatoId: f.id, plataforma: f.plataforma, pieza: f.pieza, ancho: f.ancho, alto: f.alto, orden: i })),
    });
    await tx.auditoria.create({ data: { usuarioId, tenantId, accion: "lanzamiento.campania_creada", detalle: { campaniaId: c.id, titulo, fecha: d.fecha } } });
    return c.id;
  });
}

async function campaniaActiva(tx: Parameters<Parameters<typeof conTenant>[1]>[0], tenantId: string, id: string) {
  const c = await tx.lanzamientoCampania.findUnique({ where: { tenantId_id: { tenantId, id } } });
  if (!c) throw new ErrorLanzamiento("Esa campaña no existe.");
  if (c.estado === "CANCELADA") throw new ErrorLanzamiento("La campaña está cancelada (archivada): no se cambia.");
  return c;
}

/** Mueve la fecha: cada hito se corre lo mismo (las distancias quedan). Lo hecho, hecho. */
export async function moverFecha(tenantId: string, usuarioId: string, id: string, dia: string): Promise<number> {
  const fecha = leerDia(dia);
  return conTenant(tenantId, async (tx) => {
    const c = await campaniaActiva(tx, tenantId, id);
    await tx.lanzamientoCampania.update({ where: { id }, data: { fecha } });
    const hitos = await tx.lanzamientoHito.findMany({ where: { campaniaId: id } });
    for (const h of hitos) await tx.lanzamientoHito.update({ where: { id: h.id }, data: { vence: venceEn(fecha, h.dias) } });
    const corrimiento = Math.round((fecha.getTime() - c.fecha.getTime()) / DIA);
    await tx.auditoria.create({ data: { usuarioId, tenantId, accion: "lanzamiento.fecha_movida", detalle: { campaniaId: id, de: diaArgentino(c.fecha), a: dia, dias: corrimiento } } });
    return corrimiento;
  });
}

/** Marca un hito hecho (o lo desmarca). No se bloquea por sus dependencias: se avisan. */
export async function marcarHito(tenantId: string, usuarioId: string, hitoId: string, hecho: boolean, ahora = new Date()): Promise<void> {
  await conTenant(tenantId, async (tx) => {
    const h = await tx.lanzamientoHito.findUnique({ where: { id: hitoId } });
    if (!h) throw new ErrorLanzamiento("Ese hito no existe.");
    await campaniaActiva(tx, tenantId, h.campaniaId);
    await tx.lanzamientoHito.update({ where: { id: h.id }, data: hecho ? { hechoEn: ahora, hechoPor: usuarioId } : { hechoEn: null, hechoPor: null } });
  });
}

/** Sube una pieza: se guarda siempre; si no cumple la medida, queda "no conforme". */
export async function subirPieza(tenantId: string, piezaId: string, archivo: { nombre: string; datos: Buffer }, moduloId: string): Promise<{ conforme: boolean; ancho: number; alto: number }> {
  const p = await conTenant(tenantId, (tx) => tx.lanzamientoPieza.findUnique({ where: { id: piezaId }, include: { campania: { select: { estado: true } } } }));
  if (!p) throw new ErrorLanzamiento("Esa pieza no existe.");
  if (p.campania.estado === "CANCELADA") throw new ErrorLanzamiento("La campaña está cancelada (archivada): no se cambia.");
  const meta = await sharp(archivo.datos).metadata().catch(() => null);
  if (!meta?.width || !meta.height) throw new ErrorLanzamiento("No se pudo leer la imagen (JPG, PNG o WebP).");
  const guardado = await guardarArchivo(tenantId, archivo, { moduloId, recurso: "pieza", tipos: ["jpeg", "png", "webp"], variantes: [{ nombre: "web", ancho: 640 }] });
  const conforme = cumpleMedida(p, { ancho: meta.width, alto: meta.height });
  await conTenant(tenantId, (tx) =>
    tx.lanzamientoPieza.update({ where: { id: p.id }, data: { archivoId: guardado.id, archivoNombre: guardado.nombre, anchoReal: meta.width, altoReal: meta.height, conforme, subidaEn: new Date() } }),
  );
  return { conforme, ancho: meta.width, alto: meta.height };
}

/** Cancelar: se archiva (no se borra nada: hitos, piezas y archivos quedan para consultar). */
export async function cancelarCampania(tenantId: string, usuarioId: string, id: string): Promise<void> {
  await conTenant(tenantId, async (tx) => {
    await campaniaActiva(tx, tenantId, id);
    await tx.lanzamientoCampania.update({ where: { id }, data: { estado: "CANCELADA", canceladaEn: new Date() } });
    await tx.auditoria.create({ data: { usuarioId, tenantId, accion: "lanzamiento.campania_cancelada", detalle: { campaniaId: id } } });
  });
}

export async function terminarCampania(tenantId: string, usuarioId: string, id: string): Promise<void> {
  await conTenant(tenantId, async (tx) => {
    await campaniaActiva(tx, tenantId, id);
    await tx.lanzamientoCampania.update({ where: { id }, data: { estado: "TERMINADA" } });
    await tx.auditoria.create({ data: { usuarioId, tenantId, accion: "lanzamiento.campania_terminada", detalle: { campaniaId: id } } });
  });
}

export async function campanias(tenantId: string, ahora = new Date()) {
  return conTenant(tenantId, async (tx) => {
    const lista = await tx.lanzamientoCampania.findMany({ orderBy: { fecha: "desc" }, include: { hitos: { select: { vence: true, hechoEn: true } }, piezas: { select: { archivoId: true, conforme: true } } } });
    return lista.map((c) => ({
      ...c,
      hechos: c.hitos.filter((h) => h.hechoEn).length,
      atrasados: c.estado === "ACTIVA" ? c.hitos.filter((h) => estadoDeHito(h, ahora) === "atrasado").length : 0,
      piezasSubidas: c.piezas.filter((p) => p.archivoId).length,
      noConformes: c.piezas.filter((p) => p.conforme === false).length,
    }));
  });
}

export async function campania(tenantId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return conTenant(tenantId, (tx) =>
    tx.lanzamientoCampania.findUnique({
      where: { tenantId_id: { tenantId, id } },
      include: { hitos: { orderBy: [{ vence: "asc" }, { orden: "asc" }] }, piezas: { orderBy: { orden: "asc" } } },
    }),
  );
}

/** Hitos atrasados de las campañas activas (para el inicio del panel). */
export async function atrasados(tenantId: string, ahora = new Date()) {
  return conTenant(tenantId, (tx) =>
    tx.lanzamientoHito.findMany({
      where: { hechoEn: null, vence: { lt: ahora }, campania: { estado: "ACTIVA" } },
      include: { campania: { select: { id: true, titulo: true } } },
      orderBy: { vence: "asc" },
    }),
  );
}

// ── Back office (staff): la plantilla y las medidas ───────────────────────────────────────────

export type DatosTarea = { titulo: string; descripcion: string; dias: number; dependeDe: string[]; orden: number; activa: boolean };
export type DatosFormato = { plataforma: string; pieza: string; ancho: number; alto: number; notas: string; orden: number; activo: boolean };

type TxStaff = Parameters<Parameters<typeof conTenant>[1]>[0];

/** El staff guarda una tarea de la plantilla (en la transacción de conStaff). Rige para las campañas nuevas. */
export async function guardarTarea(tx: TxStaff, clave: string, d: DatosTarea) {
  if (!/^[a-z0-9-]{2,40}$/.test(clave)) throw new ErrorLanzamiento("La clave va en minúsculas, números y guiones (2 a 40).");
  const titulo = d.titulo.trim().slice(0, 120);
  if (!titulo) throw new ErrorLanzamiento("Falta el título.");
  if (!Number.isInteger(d.dias) || d.dias < -365 || d.dias > 365) throw new ErrorLanzamiento("Los días van de -365 a 365 (negativo: antes del lanzamiento).");
  const dependeDe = [...new Set(d.dependeDe.map((x) => x.trim()).filter(Boolean))];
  if (dependeDe.includes(clave)) throw new ErrorLanzamiento("Una tarea no depende de sí misma.");
  const existentes = new Set((await tx.lanzamientoTareaBase.findMany({ select: { clave: true } })).map((t) => t.clave));
  const faltan = dependeDe.filter((x) => !existentes.has(x));
  if (faltan.length) throw new ErrorLanzamiento(`No existen: ${faltan.join(", ")}.`);
  const datos = { titulo, descripcion: d.descripcion.trim().slice(0, 500), dias: d.dias, dependeDe, orden: d.orden, activa: d.activa };
  return tx.lanzamientoTareaBase.upsert({ where: { clave }, create: { clave, ...datos }, update: datos });
}

/** El staff guarda una medida (3.2: cambian las medidas → se actualizan desde el back office). */
export async function guardarFormato(tx: TxStaff, id: string, d: DatosFormato) {
  if (!/^[a-z0-9-]{2,40}$/.test(id)) throw new ErrorLanzamiento("El id va en minúsculas, números y guiones (2 a 40).");
  const plataforma = d.plataforma.trim().slice(0, 60);
  const pieza = d.pieza.trim().slice(0, 80);
  if (!plataforma || !pieza) throw new ErrorLanzamiento("Faltan la plataforma y la pieza.");
  if (![d.ancho, d.alto].every((n) => Number.isInteger(n) && n >= 16 && n <= 10000)) throw new ErrorLanzamiento("Ancho y alto: píxeles, de 16 a 10000.");
  const datos = { plataforma, pieza, ancho: d.ancho, alto: d.alto, notas: d.notas.trim().slice(0, 300), orden: d.orden, activo: d.activo };
  return tx.lanzamientoFormato.upsert({ where: { id }, create: { id, ...datos }, update: datos });
}

// Las globales las lee cualquiera (sin banda); solo el staff las escribe (conStaff).
export const tareasBase = () => prisma.lanzamientoTareaBase.findMany({ orderBy: [{ dias: "asc" }, { orden: "asc" }] });
export const formatos = () => prisma.lanzamientoFormato.findMany({ orderBy: { orden: "asc" } });
