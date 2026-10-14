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
