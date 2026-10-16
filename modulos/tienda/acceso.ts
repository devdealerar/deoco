import { conTenant } from "@/nucleo/db/con-tenant";
import { tokenCoincide } from "@/nucleo/publico/token";

/** ¿Ese token es el del pedido de esta banda? (se compara su hash, en tiempo constante). */
export async function tieneAcceso(tenantId: string, pedidoId: string, token: string | null): Promise<boolean> {
  if (!token || !/^[0-9a-f-]{36}$/i.test(pedidoId)) return false;
  const p = await conTenant(tenantId, (tx) => tx.tiendaPedido.findUnique({ where: { id: pedidoId }, select: { tokenHash: true } }));
  return !!p && tokenCoincide(token, p.tokenHash);
}
