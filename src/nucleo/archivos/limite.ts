// Aparte de index.ts (que carga sharp): lo usa también el arranque.

/**
 * Espacio de una banda sin tope propio (`tenant.limiteAlmacenamiento`), en bytes. Solo un número
 * entero ("5368709120"): con "5GB" el arranque falla con un mensaje claro (`problemaDeLimite`),
 * no cada subida.
 */
export function limitePorDefecto(env: Record<string, string | undefined> = process.env): bigint {
  const v = env.DEOCO_LIMITE_ALMACENAMIENTO?.trim();
  if (!v) return BigInt(1024 ** 3);
  if (!/^[1-9][0-9]*$/.test(v)) throw new Error(problemaDeLimite(env)!);
  return BigInt(v);
}

export function problemaDeLimite(env: Record<string, string | undefined>): string | null {
  const v = env.DEOCO_LIMITE_ALMACENAMIENTO?.trim();
  if (!v || /^[1-9][0-9]*$/.test(v)) return null;
  return `DEOCO_LIMITE_ALMACENAMIENTO tiene que ser un número de bytes (p. ej. 5368709120 para 5 GB), no "${v}".`;
}

/**
 * Lo que se deja libre en el disco de los archivos: una subida que lo invadiría se rechaza
 * ("problema de espacio de nuestro lado"), así llenar el disco con archivos no deja sin lugar a
 * la base si comparten disco. `DEOCO_ARCHIVOS_RESERVA_MB`, por defecto 2048.
 */
export function reservaDeDisco(env: Record<string, string | undefined> = process.env): number {
  const v = env.DEOCO_ARCHIVOS_RESERVA_MB?.trim();
  if (!v) return 2048 * 1024 * 1024;
  if (!/^[0-9]+$/.test(v)) throw new Error(`DEOCO_ARCHIVOS_RESERVA_MB tiene que ser un número de megas, no "${v}".`);
  return Number(v) * 1024 * 1024;
}

export function problemaDeReserva(env: Record<string, string | undefined>): string | null {
  const v = env.DEOCO_ARCHIVOS_RESERVA_MB?.trim();
  return !v || /^[0-9]+$/.test(v) ? null : `DEOCO_ARCHIVOS_RESERVA_MB tiene que ser un número de megas, no "${v}".`;
}
