// Shows y tipos de entrada (panel de la banda) y lo que se ve de ellos (sitio y consulta).
import { borrarArchivos, ErrorArchivo, guardarArchivo, marcarPublicos } from "@/nucleo/archivos";
import { cache } from "react";
import { exigirLimite } from "@/nucleo/cuenta";
import { conTenant, type TxTenant } from "@/nucleo/db/con-tenant";
import { mesArgentino } from "@/nucleo/fechas";

export class ErrorTicketera extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const esUuid = (x: string) => UUID.test(x);

export type DatosEvento = { nombre: string; fecha: Date; lugar: string; ciudad: string; direccion: string; descripcion: string };
export type DatosTipo = { nombre: string; precio: number; cupo: number; ventaDesde: Date | null; ventaHasta: Date | null };

function validarEvento(d: DatosEvento): DatosEvento {
  const t = (v: string) => v.trim().replace(/\s+/g, " ");
  const r = { ...d, nombre: t(d.nombre), lugar: t(d.lugar), ciudad: t(d.ciudad), direccion: t(d.direccion), descripcion: d.descripcion.trim() };
  if (!r.nombre || r.nombre.length > 120) throw new ErrorTicketera("El nombre del show es obligatorio (hasta 120 caracteres).");
  if (!r.lugar || r.lugar.length > 120) throw new ErrorTicketera("Falta el lugar (hasta 120 caracteres).");
  if (!r.ciudad || r.ciudad.length > 80) throw new ErrorTicketera("Falta la ciudad (hasta 80 caracteres).");
  if (r.direccion.length > 200) throw new ErrorTicketera("La dirección es muy larga (hasta 200 caracteres).");
  if (r.descripcion.length > 2000) throw new ErrorTicketera("La descripción es muy larga (hasta 2000 caracteres).");
  if (Number.isNaN(r.fecha.getTime())) throw new ErrorTicketera("Falta la fecha y hora del show.");
  return r;
}

function validarTipo(d: DatosTipo): DatosTipo {
  const nombre = d.nombre.trim().replace(/\s+/g, " ");
  if (!nombre || nombre.length > 60) throw new ErrorTicketera("El tipo de entrada necesita un nombre (hasta 60 caracteres).");
  if (!Number.isInteger(d.precio) || d.precio <= 0) throw new ErrorTicketera("El precio tiene que ser mayor a cero.");
  if (!Number.isInteger(d.cupo) || d.cupo < 1 || d.cupo > 100000) throw new ErrorTicketera("El cupo va de 1 a 100.000.");
  if (d.ventaDesde && d.ventaHasta && d.ventaDesde >= d.ventaHasta) throw new ErrorTicketera("La fecha de inicio de la venta tiene que ser anterior a la de cierre.");
  return { ...d, nombre };
}

export type DatosFrenos = { reservaMinutos: number | null; maxPorCompra: number | null; maxPorPersona: number | null; reservasPorEmail: number | null; reservasPorIp: number | null };

const RANGO_FRENOS: Record<keyof DatosFrenos, [number, number, string]> = {
  reservaMinutos: [5, 30, "La reserva dura de 5 a 30 minutos."],
  maxPorCompra: [1, 20, "Por compra, de 1 a 20 entradas."],
  maxPorPersona: [1, 100, "Por persona, de 1 a 100 entradas."],
  reservasPorEmail: [1, 5, "Reservas abiertas por email: de 1 a 5."],
  reservasPorIp: [1, 50, "Reservas abiertas por conexión: de 1 a 50."],
};

/**
 * Los frenos contra el acaparamiento de un show (vacío = los de la plataforma). Acotados acá y
 * en la base (CHECK): una banda grande sube los números, pero ningún show queda sin freno.
 */
export async function guardarFrenos(tenantId: string, id: string, d: DatosFrenos) {
  for (const [k, [min, max, mensaje]] of Object.entries(RANGO_FRENOS) as [keyof DatosFrenos, [number, number, string]][]) {
    const v = d[k];
    if (v !== null && (!Number.isInteger(v) || v < min || v > max)) throw new ErrorTicketera(mensaje);
  }
  if (d.maxPorCompra && d.maxPorPersona && d.maxPorPersona < d.maxPorCompra) throw new ErrorTicketera("Por persona no puede ser menos que por compra.");
  await conTenant(tenantId, async (tx) => {
    if (!(await tx.ticketeraEvento.findUnique({ where: { id }, select: { id: true } }))) throw new ErrorTicketera("Ese show no existe.");
    await tx.ticketeraEvento.update({ where: { id }, data: d });
  });
}

export async function crearEvento(tenantId: string, datos: DatosEvento): Promise<string> {
  const d = validarEvento(datos);
  const { id } = await conTenant(tenantId, (tx) => tx.ticketeraEvento.create({ data: { tenantId, ...d }, select: { id: true } }));
  return id;
}

export async function actualizarEvento(tenantId: string, id: string, datos: DatosEvento) {
  const d = validarEvento(datos);
  await conTenant(tenantId, async (tx) => {
    const antes = await tx.ticketeraEvento.findUnique({ where: { id }, select: { publicado: true, fecha: true } });
    if (!antes) throw new ErrorTicketera("Ese show no existe.");
    // Un show publicado que cambia de mes cuenta para el tope del mes nuevo.
    if (antes.publicado && mesArgentino(antes.fecha).clave !== mesArgentino(d.fecha).clave) await exigirTopeDeShows(tx, tenantId, id, d.fecha);
    await tx.ticketeraEvento.update({ where: { id }, data: d });
  });
}

/**
 * Límite de la cuenta: cuántos shows publicados puede tener la banda con fecha en un mismo mes
 * calendario (3.2: "eventos por mes"). Un complemento suelto suma para ese mes.
 */
export const LIMITE_SHOWS = "shows-por-mes";

/** Los shows publicados con fecha en el mes de `en`. */
const delMes = (en: Date) => {
  const { desde, hasta } = mesArgentino(en);
  return { publicado: true, fecha: { gte: desde, lt: hasta } };
};

/** Lo que mide la cuenta: shows publicados este mes. */
export const contarShowsPublicados = (tenantId: string) => conTenant(tenantId, (tx) => tx.ticketeraEvento.count({ where: delMes(new Date()) }));

/** Antes de publicar (o mover de mes) el show `id` con fecha `fecha`: el tope de ese mes. */
async function exigirTopeDeShows(tx: TxTenant, tenantId: string, id: string, fecha: Date) {
  await exigirLimite(
    tx,
    (await import("./index")).default,
    tenantId,
    LIMITE_SHOWS,
    async () => (await tx.ticketeraEvento.count({ where: { ...delMes(fecha), NOT: { id } } })) + 1,
    undefined,
    { en: fecha },
  );
}

/** Límite que solo mide (3.2 núcleo d5): entradas vendidas en el mes. Nunca corta una venta. */
export const LIMITE_ENTRADAS = "entradas-por-mes";

export const contarEntradasDelMes = (tenantId: string, ahora = new Date()) => {
  const { desde, hasta } = mesArgentino(ahora);
  return conTenant(tenantId, async (tx) => (await tx.ticketeraCompra.aggregate({ where: { estado: "PAGADA", pagadaEn: { gte: desde, lt: hasta } }, _sum: { cantidad: true } }))._sum.cantidad ?? 0);
};

/**
 * El tope bajó (la banda bajó de plan): no se despublica ningún show. Un show publicado y por
 * venir está a la venta, y nunca se corta una venta abierta por una cuota (3.2, núcleo d5): se
 * permite el excedente. El tope frena publicar uno nuevo (exigirTopeDeShows). Devuelve 0.
 */
export async function ajustarShowsPublicados(_tenantId: string, _maximo: number): Promise<number> {
  return 0;
}

/** Foto del show (JPG/PNG/WebP). Pública solo mientras el show esté publicado. */
export async function cambiarFoto(tenantId: string, id: string, archivo: { nombre: string; datos: Buffer }) {
  const evento = await conTenant(tenantId, (tx) => tx.ticketeraEvento.findUnique({ where: { id } }));
  if (!evento) throw new ErrorTicketera("Ese show no existe.");
  const foto = await guardarArchivo(tenantId, archivo, { moduloId: "ticketera", recurso: "foto-show", tipos: ["jpeg", "png", "webp"], variantes: [{ nombre: "web", ancho: 1600 }] }).catch((e) => {
    if (e instanceof ErrorArchivo) throw new ErrorTicketera(e.message);
    throw e;
  });
  await conTenant(tenantId, async (tx) => {
    await tx.ticketeraEvento.update({ where: { id }, data: { fotoArchivoId: foto.id, fotoNombre: foto.nombre } });
    await marcarPublicos(tx, [foto.id], evento.publicado);
    if (evento.fotoArchivoId) await borrarArchivos(tx, tenantId, [evento.fotoArchivoId]);
  });
}

/** Publicar exige al menos un tipo de entrada. Despublicar no toca lo vendido. */
export async function publicarEvento(tenantId: string, id: string, publicado: boolean) {
  await conTenant(tenantId, async (tx) => {
    const e = await tx.ticketeraEvento.findUnique({ where: { id }, include: { _count: { select: { tipos: true } } } });
    if (!e) throw new ErrorTicketera("Ese show no existe.");
    if (publicado && e._count.tipos === 0) throw new ErrorTicketera("Antes de publicar, cargá al menos un tipo de entrada.");
    if (publicado && !e.publicado && e.fecha >= desdeAhora()) await exigirTopeDeShows(tx, tenantId, id, e.fecha);
    await tx.ticketeraEvento.update({ where: { id }, data: { publicado, publicadoEn: publicado ? (e.publicadoEn ?? new Date()) : null } });
    if (e.fotoArchivoId) await marcarPublicos(tx, [e.fotoArchivoId], publicado);
  });
}

/** Solo si no vendió nada (si no, despublicalo). */
export async function borrarEvento(tenantId: string, id: string) {
  await conTenant(tenantId, async (tx) => {
    const e = await tx.ticketeraEvento.findUnique({ where: { id }, include: { _count: { select: { compras: true } } } });
    if (!e) throw new ErrorTicketera("Ese show no existe.");
    if (e._count.compras > 0) throw new ErrorTicketera("Ese show ya tiene compras: no se puede borrar. Despublicalo.");
    await tx.ticketeraEvento.delete({ where: { id } });
    if (e.fotoArchivoId) await borrarArchivos(tx, tenantId, [e.fotoArchivoId]);
  });
}

export async function crearTipo(tenantId: string, eventoId: string, datos: DatosTipo) {
  const d = validarTipo(datos);
  await conTenant(tenantId, async (tx) => {
    if (!(await tx.ticketeraEvento.findUnique({ where: { id: eventoId } }))) throw new ErrorTicketera("Ese show no existe.");
    await tx.ticketeraTipo.create({ data: { tenantId, eventoId, ...d } });
  });
}

/** El cupo no puede quedar por debajo de lo vendido y reservado (lo garantiza la base). */
export async function actualizarTipo(tenantId: string, tipoId: string, datos: DatosTipo) {
  const d = validarTipo(datos);
  await conTenant(tenantId, async (tx) => {
    const [t] = await tx.$queryRaw<{ ocupadas: number }[]>`SELECT ocupadas FROM ticketera_tipo WHERE id = ${tipoId}::uuid FOR UPDATE`;
    if (!t) throw new ErrorTicketera("Ese tipo de entrada no existe.");
    if (d.cupo < t.ocupadas) throw new ErrorTicketera(`El cupo no puede ser menor a lo vendido y reservado (${t.ocupadas}).`);
    await tx.ticketeraTipo.update({ where: { id: tipoId }, data: d });
  });
}

export async function borrarTipo(tenantId: string, tipoId: string) {
  await conTenant(tenantId, async (tx) => {
    const t = await tx.ticketeraTipo.findUnique({ where: { id: tipoId }, include: { _count: { select: { compras: true } } } });
    if (!t) throw new ErrorTicketera("Ese tipo de entrada no existe.");
    if (t._count.compras > 0) throw new ErrorTicketera("Ese tipo ya tiene compras: no se puede borrar.");
    await tx.ticketeraTipo.delete({ where: { id: tipoId } });
    const quedan = await tx.ticketeraTipo.count({ where: { eventoId: t.eventoId } });
    if (quedan === 0) await tx.ticketeraEvento.update({ where: { id: t.eventoId }, data: { publicado: false } });
  });
}

// ---------- Lo que se ve ----------

export type TipoConVenta = {
  id: string;
  nombre: string;
  precio: number;
  cupo: number;
  vendidas: number;
  reservadas: number;
  disponibles: number;
  ventaDesde: Date | null;
  ventaHasta: Date | null;
  /** "abierta" | "antes" | "despues" | "agotada" */
  venta: EstadoVenta;
};
export type EstadoVenta = "abierta" | "antes" | "despues" | "agotada";

/** Vendidas, reservadas vigentes y disponibles de cada tipo de esos shows. */
async function tiposConVenta(tx: TxTenant, eventoIds: string[], ahora: Date) {
  const tipos = await tx.ticketeraTipo.findMany({ where: { eventoId: { in: eventoIds } }, orderBy: [{ precio: "asc" }, { creadoEn: "asc" }] });
  const sumas = await tx.ticketeraCompra.groupBy({
    by: ["tipoId", "estado"],
    where: { eventoId: { in: eventoIds }, OR: [{ estado: "PAGADA" }, { estado: "RESERVADA", venceEn: { gt: ahora } }] },
    _sum: { cantidad: true },
  });
  const suma = (tipoId: string, estado: string) => sumas.find((s) => s.tipoId === tipoId && s.estado === estado)?._sum.cantidad ?? 0;
  return tipos.map((t) => {
    const vendidas = suma(t.id, "PAGADA");
    const reservadas = suma(t.id, "RESERVADA");
    const disponibles = Math.max(0, t.cupo - vendidas - reservadas);
    const venta: EstadoVenta =
      t.ventaDesde && ahora < t.ventaDesde ? "antes" : t.ventaHasta && ahora > t.ventaHasta ? "despues" : disponibles === 0 ? "agotada" : "abierta";
    return { eventoId: t.eventoId, id: t.id, nombre: t.nombre, precio: t.precio, cupo: t.cupo, vendidas, reservadas, disponibles, ventaDesde: t.ventaDesde, ventaHasta: t.ventaHasta, venta };
  });
}

export type EventoVista = {
  id: string;
  nombre: string;
  fecha: Date;
  lugar: string;
  ciudad: string;
  direccion: string;
  descripcion: string;
  foto: { id: string; nombre: string } | null;
  publicado: boolean;
  /** Frenos propios del show (null = los de la plataforma). */
  frenos: { reservaMinutos: number | null; maxPorCompra: number | null; maxPorPersona: number | null; reservasPorEmail: number | null; reservasPorIp: number | null };
  tipos: TipoConVenta[];
};

/** Shows de la banda (panel), los próximos primero; con `soloPublicados`, lo que ve el sitio. */
export async function eventos(
  tenantId: string,
  opciones: { soloPublicados?: boolean; desde?: Date; ids?: string[]; ahora?: Date } = {},
): Promise<EventoVista[]> {
  const ahora = opciones.ahora ?? new Date();
  return conTenant(tenantId, async (tx) => {
    const filas = await tx.ticketeraEvento.findMany({
      where: {
        ...(opciones.soloPublicados ? { publicado: true } : {}),
        ...(opciones.desde ? { fecha: { gte: opciones.desde } } : {}),
        ...(opciones.ids ? { id: { in: opciones.ids.filter(esUuid) } } : {}),
      },
      orderBy: { fecha: "asc" },
      take: 200,
    });
    const tipos = await tiposConVenta(tx, filas.map((f) => f.id), ahora);
    return filas.map((f) => ({
      id: f.id,
      nombre: f.nombre,
      fecha: f.fecha,
      lugar: f.lugar,
      ciudad: f.ciudad,
      direccion: f.direccion,
      descripcion: f.descripcion,
      foto: f.fotoArchivoId && f.fotoNombre ? { id: f.fotoArchivoId, nombre: f.fotoNombre } : null,
      publicado: f.publicado,
      frenos: { reservaMinutos: f.reservaMinutos, maxPorCompra: f.maxPorCompra, maxPorPersona: f.maxPorPersona, reservasPorEmail: f.reservasPorEmail, reservasPorIp: f.reservasPorIp },
      tipos: tipos.filter((t) => t.eventoId === f.id),
    }));
  });
}

export async function evento(tenantId: string, id: string, opciones: { soloPublicados?: boolean } = {}) {
  if (!esUuid(id)) return null;
  return (await eventos(tenantId, { ...opciones, ids: [id] }))[0] ?? null;
}

/**
 * Un show publicado, para el sitio: una lectura por pedido (la piden los metadatos y la
 * página). Solo para lectura pública: el panel lee sin caché (después de guardar, lo nuevo).
 */
export const eventoPublicado = cache((tenantId: string, id: string) => evento(tenantId, id, { soloPublicados: true }));

/** Los shows se muestran hasta 6 h después de empezar (la noche del show sigue a la vista). */
export const desdeAhora = (ahora = new Date()) => new Date(ahora.getTime() - 6 * 3600_000);

/**
 * Consulta "ticketera.proximas-fechas" (la usa el sitio). Forma de la respuesta, estable:
 * [{ id, nombre, fecha: ISO, lugar, ciudad, url: "/fechas/<id>", agotado: boolean }]
 * Publicados y por venir, por fecha. `params.limite`: hasta cuántos (20 por defecto, máx. 50).
 */
export async function proximasFechas(tenantId: string, params: Record<string, unknown>) {
  const limite = Math.min(50, Math.max(1, Number(params.limite) || 20));
  const lista = await eventos(tenantId, { soloPublicados: true, desde: desdeAhora() });
  return lista.slice(0, limite).map((e) => ({
    id: e.id,
    nombre: e.nombre,
    fecha: e.fecha.toISOString(),
    lugar: e.lugar,
    ciudad: e.ciudad,
    url: `/fechas/${e.id}`,
    agotado: e.tipos.length > 0 && e.tipos.every((t) => t.venta === "agotada"),
  }));
}

/**
 * Consulta "ticketera.ventas" (para el manager: solo números, D7). `params.desde`/`hasta` ISO.
 * Respuesta: { entradas, total (centavos), compras }.
 */
export async function ventasDelPeriodo(tenantId: string, params: Record<string, unknown>) {
  const desde = new Date(String(params.desde ?? ""));
  const hasta = new Date(String(params.hasta ?? ""));
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) return { entradas: 0, total: 0, compras: 0 };
  const r = await conTenant(tenantId, (tx) => tx.ticketeraCompra.aggregate({ where: { estado: "PAGADA", pagadaEn: { gte: desde, lt: hasta } }, _sum: { cantidad: true, total: true }, _count: { _all: true } }));
  return { entradas: r._sum.cantidad ?? 0, total: r._sum.total ?? 0, compras: r._count._all };
}
