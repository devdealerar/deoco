// Dinero: centavos (Int) por dentro, pesos argentinos por fuera. (Copia chica de lo de la
// tienda: un módulo no importa código de otro.)

const enteros = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const conCentavos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

export function formatearPesos(centavos: number): string {
  const abs = Math.abs(centavos);
  const texto = (abs % 100 ? conCentavos : enteros).format(abs / 100);
  return centavos < 0 ? `-${texto}` : texto;
}

/** "12500", "12.500", "12.500,50", "$ 12.500" → centavos; null si no es un monto válido. */
export function leerPesos(texto: string): number | null {
  const limpio = texto.replace(/\$|\s/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(limpio)) return null;
  const [e, d = ""] = limpio.replace(/\./g, "").split(",");
  return Number(e) * 100 + Number(d.padEnd(2, "0"));
}

export function pesosParaCampo(centavos: number): string {
  const e = Math.trunc(centavos / 100);
  const r = centavos % 100;
  return r ? `${e},${String(r).padStart(2, "0")}` : String(e);
}

// ---------- Fechas: siempre hora de Argentina (UTC−3, sin horario de verano) ----------

const ZONA = "America/Argentina/Buenos_Aires";
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

/** Date → "2026-11-20" (día en Argentina). */
export function diaArgentino(d: Date): string {
  return new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}
