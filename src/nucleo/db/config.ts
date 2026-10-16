// Tamaño del pool de conexiones y tiempos de las transacciones. Pensado para una sola instancia
// contra un Postgres con max_connections = 100 (el de Easypanel) y picos de cientos de fans a la
// vez (apertura de venta de entradas):
//
// - 40 conexiones para la app (DEOCO_DB_CONEXIONES). Deja lugar para el back office (5), las
//   migraciones, una consola y las reservadas del superusuario, sin rozar el límite.
//   Una compra son transacciones de ~10-30 ms: 40 conexiones despachan miles por segundo.
// - Esperar conexión hasta 10 s (antes, 2 s): en un pico la cola se vacía en poco tiempo; es
//   mejor que el fan espere unos segundos a que reciba un error.
// - Una transacción puede durar hasta 15 s (antes, 5 s): margen para un manejador lento sin
//   cortar a mitad. Las de un pedido duran milisegundos.
// - Conectar a la base: hasta 10 s; una conexión ociosa se cierra a los 30 s.
type Entorno = Record<string, string | undefined>;

const entero = (v: string | undefined, porDefecto: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : porDefecto;
};

export function configPool(env: Entorno = process.env, porDefecto = 40) {
  return {
    max: entero(env.DEOCO_DB_CONEXIONES, porDefecto, 1, 500),
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  };
}

export const OPCIONES_TRANSACCION = { maxWait: 10_000, timeout: 15_000 } as const;

/**
 * Compartimentos por banda: cuántas transacciones a la vez puede tener UNA banda (por defecto, un
 * cuarto del pool, mínimo 2). Así la apertura de venta de una banda nunca se lleva todas las
 * conexiones: las demás bandas siguen atendiendo. Lo que pasa del tope espera su turno (hasta
 * `esperaMs`) en la cola de su banda, no en la de todos.
 */
export function configPorBanda(env: Entorno = process.env) {
  const pool = configPool(env).max;
  return {
    max: entero(env.DEOCO_DB_CONEXIONES_POR_BANDA, Math.max(2, Math.floor(pool / 4)), 1, pool),
    esperaMs: 10_000,
  };
}
