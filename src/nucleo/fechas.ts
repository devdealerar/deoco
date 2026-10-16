// Fechas: siempre hora de Argentina (UTC−3, sin horario de verano).

export const ZONA = "America/Argentina/Buenos_Aires";
export const FECHA_LARGA = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: ZONA });
export const FECHA_CORTA = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: ZONA });
export const HORA = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: ZONA });

/** "2026-11-20T21:30" (campo datetime-local, hora argentina) → Date. null si no es válida. */
export function leerFechaHora(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date → "2026-11-20T21:30" en hora argentina (para precargar un datetime-local). */
export function fechaHoraParaCampo(d: Date): string {
  return new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 16);
}

/** Date (o ISO) → "2026-11-20" (día en Argentina). */
export function diaArgentino(d: Date | string): string {
  return new Date(new Date(d).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

/**
 * El mes calendario (hora argentina, UTC-3 todo el año) que contiene `d`: [desde, hasta).
 * Para los topes por mes ("eventos por mes", "entradas por mes").
 */
export function mesArgentino(d: Date): { desde: Date; hasta: Date; clave: string } {
  const clave = diaArgentino(d).slice(0, 7);
  const [y, m] = clave.split("-").map(Number);
  const desde = new Date(Date.UTC(y, m - 1, 1, 3));
  const hasta = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1, 3));
  return { desde, hasta, clave };
}
