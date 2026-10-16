// Lo que la tienda tiene abierto en una banda y un cambio de plan no puede cortar (3.2, núcleo
// d5): pedidos que todavía se pueden pagar, pagos en revisión y pedidos pagados que el
// proveedor no despachó. Con algo de esto, el módulo no se apaga: queda como excedente.
import { conTenant } from "@/nucleo/db/con-tenant";
import { DIAS_PEDIDO_PENDIENTE } from "./pedidos";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export async function tiendaEnCurso(tenantId: string, ahora = new Date()): Promise<string[]> {
  const desde = new Date(ahora.getTime() - DIAS_PEDIDO_PENDIENTE * 86_400_000);
  // Los pagos en revisión están en los pagos para devolver de la banda: los cuenta el núcleo.
  const [pendientes, sinDespachar] = await conTenant(tenantId, (tx) =>
    Promise.all([
      tx.tiendaPedido.count({ where: { estado: "PENDIENTE", creadoEn: { gt: desde } } }),
      tx.tiendaPedido.count({ where: { estado: "PAGADO", ordenes: { some: { estado: "EN_PRODUCCION" } } } }),
    ]),
  );
  const abierto: string[] = [];
  if (pendientes) abierto.push(plural(pendientes, "pedido esperando el pago", "pedidos esperando el pago"));
  if (sinDespachar) abierto.push(plural(sinDespachar, "pedido pagado sin despachar", "pedidos pagados sin despachar"));
  return abierto;
}
