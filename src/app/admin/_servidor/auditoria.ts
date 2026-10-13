import type { Prisma } from "@/generated/prisma/client";
// Sirve tanto en una transacción de la conexión de administración como en una de
// conTenant (app, bajo RLS: ahí solo filas de esa banda).
type Tx = Prisma.TransactionClient;

/**
 * Registra una acción del back office. Va en la MISMA transacción que la acción: si la
 * acción se revierte, no queda registro; si queda la acción, queda su registro.
 */
export async function auditar(
  tx: Tx,
  fila: { usuarioId: string; tenantId?: string | null; accion: string; detalle?: Prisma.InputJsonValue },
) {
  await tx.auditoria.create({
    data: { usuarioId: fila.usuarioId, tenantId: fila.tenantId ?? null, accion: fila.accion, detalle: fila.detalle ?? {} },
  });
}
