import type { Prisma } from "@/generated/prisma/client";
import type { TxAdmin } from "./db";

/**
 * Registra una acción del back office. Va en la MISMA transacción que la acción: si la
 * acción se revierte, no queda registro; si queda la acción, queda su registro.
 */
export async function auditar(
  tx: TxAdmin,
  fila: { usuarioId: string; tenantId?: string | null; accion: string; detalle?: Prisma.InputJsonValue },
) {
  await tx.auditoria.create({
    data: { usuarioId: fila.usuarioId, tenantId: fila.tenantId ?? null, accion: fila.accion, detalle: fila.detalle ?? {} },
  });
}
