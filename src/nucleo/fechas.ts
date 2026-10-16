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

/**
 * Feriados nacionales de Argentina INAMOVIBLES y los de fecha cierta de cada año (Carnaval,
 * Viernes Santo). Los trasladables y los "puentes" NO están a propósito: contar un día hábil como
 * feriado alargaría un plazo legal (un pedido de datos vencería tarde). Con menos feriados el
 * plazo vence antes, nunca después. Revisar cada año contra el decreto de feriados.
 */
const FERIADOS_AR = new Set([
  // 2026 (Pascua: 5 de abril)
  "2026-01-01", "2026-02-16", "2026-02-17", "2026-03-24", "2026-04-02", "2026-04-03", "2026-05-01", "2026-05-25", "2026-06-20", "2026-07-09", "2026-12-08", "2026-12-25",
  // 2027 (Pascua: 28 de marzo)
  "2027-01-01", "2027-02-08", "2027-02-09", "2027-03-24", "2027-03-26", "2027-04-02", "2027-05-01", "2027-05-25", "2027-06-20", "2027-07-09", "2027-12-08", "2027-12-25",
]);

/** ¿Es día hábil en Argentina? (lunes a viernes que no es feriado de FERIADOS_AR) */
export function esDiaHabil(d: Date): boolean {
  const dia = diaArgentino(d);
  const semana = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return semana !== 0 && semana !== 6 && !FERIADOS_AR.has(dia);
}

/** `n` días hábiles después de `d` (para los plazos de la Ley 25.326: 5 días hábiles). Fin del día. */
export function sumarDiasHabiles(d: Date, n: number): Date {
  let x = new Date(d);
  let quedan = n;
  while (quedan > 0) {
    x = new Date(x.getTime() + 86_400_000);
    if (esDiaHabil(x)) quedan--;
  }
  return finDelDiaArgentino(x);
}

/** `n` días corridos después de `d`, al final de ese día (hora argentina). */
export const sumarDiasCorridos = (d: Date, n: number) => finDelDiaArgentino(new Date(d.getTime() + n * 86_400_000));

/** Las 23:59:59 (hora argentina) del día de `d`. */
export function finDelDiaArgentino(d: Date): Date {
  return new Date(new Date(`${diaArgentino(d)}T23:59:59.999-03:00`).getTime());
}
