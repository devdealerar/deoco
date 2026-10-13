import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./cliente";

export type TxTenant = Prisma.TransactionClient;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Corre `fn` dentro de una transacción con `app.tenant_id` fijado.
 * Toda consulta de datos de banda pasa por acá: RLS filtra por esa variable.
 * La variable es local a la transacción (set_config(..., true)), así que no
 * se filtra a otro pedido que reuse la misma conexión del pool.
 */
export async function conTenant<T>(tenantId: string, fn: (tx: TxTenant) => Promise<T>): Promise<T> {
  if (!UUID.test(tenantId)) throw new Error(`tenantId inválido: ${tenantId}`);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}
