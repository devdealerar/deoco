// Ningún error técnico llega al público. Lo que un módulo no esperaba (la base saturada, la
// pasarela que no responde, un bug) se loguea con su detalle y al fan le llega una frase.

/** ¿El error es de carga (pool lleno, base saturada, demora)? Entonces "probá de nuevo" sirve. */
export function esSaturacion(e: unknown): boolean {
  const codigo = String((e as { code?: unknown })?.code ?? "");
  const mensaje = e instanceof Error ? e.message : String(e);
  // Prisma: P2024 (sin conexión libre a tiempo), P2028 (no pudo abrir la transacción a tiempo),
  // P1001/P1017 (la base no responde). Postgres: 53300 (demasiadas conexiones), 57P03, 40001
  // (serialización), 40P01 (deadlock), 55P03 (bloqueo). Y los tiempos de espera de red.
  return (
    ["P2024", "P2028", "P1001", "P1008", "P1017", "53300", "57P03", "40001", "40P01", "55P03"].includes(codigo) ||
    /timed out|timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|too many clients|Unable to start a transaction/i.test(mensaje)
  );
}

export const MENSAJE_SATURACION = "Hay mucha gente comprando en este momento. Probá de nuevo en unos segundos.";
export const MENSAJE_FALLA = "No pudimos completar lo que pediste. Probá de nuevo en unos segundos.";

/** La frase para el público ante un error inesperado. Loguea el detalle (nunca al público). */
export function mensajeParaElPublico(e: unknown, donde: string): string {
  const saturado = esSaturacion(e);
  console.error(`[publico] ${donde}${saturado ? " (saturación)" : ""}: ${e instanceof Error ? e.message : String(e)}`);
  return saturado ? MENSAJE_SATURACION : MENSAJE_FALLA;
}
