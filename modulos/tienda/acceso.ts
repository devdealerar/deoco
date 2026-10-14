import { timingSafeEqual } from "node:crypto";
import { conTenant } from "@/nucleo/db/con-tenant";

/** ¿Ese token es el del pedido de esta banda? (comparación en tiempo constante). */
export async function tieneAcceso(tenantId: string, pedidoId: string, token: string | null): Promise<boolean> {
  if (!token || !/^[0-9a-f-]{36}$/i.test(pedidoId)) return false;
  const p = await conTenant(tenantId, (tx) => tx.tiendaPedido.findUnique({ where: { id: pedidoId }, select: { token: true } }));
  if (!p) return false;
  const a = Buffer.from(p.token);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
