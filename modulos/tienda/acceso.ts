import { conTenant } from "@/nucleo/db/con-tenant";
import { emailDelFan } from "@/nucleo/publico/fan";
import { tokenCoincide } from "@/nucleo/publico/token";

/** ¿Ese token es el del pedido de esta banda? (se compara su hash, en tiempo constante). */
export async function tieneAcceso(tenantId: string, pedidoId: string, token: string | null): Promise<boolean> {
  if (!token || !/^[0-9a-f-]{36}$/i.test(pedidoId)) return false;
  const p = await conTenant(tenantId, (tx) => tx.tiendaPedido.findUnique({ where: { id: pedidoId }, select: { tokenHash: true } }));
  return !!p && tokenCoincide(token, p.tokenHash);
}

/**
 * En el sitio: el token del pedido (cookie de este navegador) o la sesión del área del fan (D5)
 * con el mismo email del pedido.
 */
export async function tieneAccesoEnElSitio(tenantId: string, pedidoId: string, token: string | null): Promise<boolean> {
  if (await tieneAcceso(tenantId, pedidoId, token)) return true;
  if (!/^[0-9a-f-]{36}$/i.test(pedidoId)) return false;
  const email = await emailDelFan(tenantId);
  if (!email) return false;
  const p = await conTenant(tenantId, (tx) => tx.tiendaPedido.findUnique({ where: { id: pedidoId }, select: { email: true } }));
  return !!p && p.email.toLowerCase() === email;
}
