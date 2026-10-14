// La dirección del sitio público de una banda, para links absolutos (mails, vista previa, la
// vuelta de la pasarela). Una sola forma de armarla.
import { headers } from "next/headers";
import { conTenant, type TxTenant } from "@/nucleo/db/con-tenant";
import { origenDeDominio } from "@/nucleo/tenant/hosts";

/**
 * El sitio de la banda por su dominio principal (`https://labanda.com`); null si no tiene.
 * `tx`: una transacción de conTenant de esa banda, si ya hay una abierta.
 */
export async function origenDeBanda(tenantId: string, opciones: { tx?: TxTenant } = {}): Promise<string | null> {
  const leer = (tx: TxTenant) => tx.dominio.findFirst({ where: { esPrincipal: true }, select: { dominio: true } });
  const d = opciones.tx ? await leer(opciones.tx) : await conTenant(tenantId, leer);
  return d ? origenDeDominio(d.dominio) : null;
}

/**
 * El sitio tal como lo pidió el fan (protocolo y host del pedido). En el sitio público es el
 * dominio principal: cualquier otro redirige a él antes de llegar acá.
 */
export async function origenDelPedido(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${proto}://${h.get("host")}`;
}
