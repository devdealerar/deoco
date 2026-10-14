import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./cliente";

export type TxTenant = Prisma.TransactionClient;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Transacciones abiertas por conTenant: su banda y lo que corre al confirmarse. */
const abiertas = new WeakMap<TxTenant, { tenantId: string; alConfirmar: (() => void)[] }>();

/**
 * Corre `fn` dentro de una transacción con `app.tenant_id` fijado.
 * Toda consulta de datos de banda pasa por acá: RLS filtra por esa variable.
 * La variable es local a la transacción (set_config(..., true)), así que no
 * se filtra a otro pedido que reuse la misma conexión del pool.
 */
export async function conTenant<T>(tenantId: string, fn: (tx: TxTenant) => Promise<T>): Promise<T> {
  return transaccionDeBanda(tenantId, (tx) => tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`, fn);
}

/**
 * SOLO PARA EL NÚCLEO. Transacción "de una banda" (la reconocen `emitir({ tx })`, `alConfirmar`,
 * `urlFirmada({ tx })`) con lo que `preparar` fije: conTenant fija la banda entera; una cuenta
 * externa en una banda fija solo su acceso acotado (`conCuentaExternaEnBanda`).
 */
export async function transaccionDeBanda<T>(
  tenantId: string,
  preparar: (tx: TxTenant) => Promise<unknown>,
  fn: (tx: TxTenant) => Promise<T>,
): Promise<T> {
  if (!UUID.test(tenantId)) throw new Error(`tenantId inválido: ${tenantId}`);
  const alConfirmar: (() => void)[] = [];
  const resultado = await prisma.$transaction(async (tx) => {
    await preparar(tx);
    abiertas.set(tx, { tenantId, alConfirmar });
    return fn(tx);
  });
  // Recién acá la transacción está confirmada. Si falló, $transaction tiró y esto no corre.
  for (const tarea of alConfirmar) tarea();
  return resultado;
}

/** Banda de una transacción abierta por conTenant; undefined si `tx` no es una. */
export function tenantDeTransaccion(tx: TxTenant): string | undefined {
  return abiertas.get(tx)?.tenantId;
}

/**
 * Programa `tarea` para cuando la transacción se confirme. Si se revierte, no corre.
 * La usa el bus de eventos para no entregar un evento que nunca se guardó.
 */
export function alConfirmar(tx: TxTenant, tarea: () => void) {
  const abierta = abiertas.get(tx);
  if (!abierta) throw new Error("alConfirmar necesita una transacción abierta por conTenant");
  abierta.alConfirmar.push(tarea);
}
