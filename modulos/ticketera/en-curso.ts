// Lo que la ticketera tiene abierto en una banda y un cambio de plan no puede cortar (3.2,
// núcleo d5): shows con entradas vendidas que no terminaron y reservas que todavía se pueden
// pagar. (Los pagos para devolver los suma el núcleo.) Con algo de esto, el módulo no
// se apaga: queda como excedente hasta que se cierre.
import { conTenant } from "@/nucleo/db/con-tenant";
import { showsConEntradasPorDelante } from "./puerta";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export async function ticketeraEnCurso(tenantId: string, ahora = new Date()): Promise<string[]> {
  const shows = (await showsConEntradasPorDelante(tenantId, ahora)).length;
  // Los pagos en revisión están en los pagos para devolver de la banda: los cuenta el núcleo.
  const reservas = await conTenant(tenantId, (tx) => tx.ticketeraCompra.count({ where: { estado: "RESERVADA", venceEn: { gt: ahora } } }));
  const abierto: string[] = [];
  if (shows) abierto.push(plural(shows, "show con entradas vendidas que no terminó", "shows con entradas vendidas que no terminaron"));
  if (reservas) abierto.push(plural(reservas, "compra esperando el pago", "compras esperando el pago"));
  return abierto;
}
