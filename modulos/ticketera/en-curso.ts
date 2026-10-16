// Lo que la ticketera tiene abierto en una banda y un cambio de plan no puede cortar (3.2,
// núcleo d5): shows con entradas vendidas que no terminaron, reservas que todavía se pueden
// pagar y pagos en revisión que la banda tiene que resolver. Con algo de esto, el módulo no
// se apaga: queda como excedente hasta que se cierre.
import { conTenant } from "@/nucleo/db/con-tenant";
import { showsConEntradasPorDelante } from "./puerta";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export async function ticketeraEnCurso(tenantId: string, ahora = new Date()): Promise<string[]> {
  const shows = (await showsConEntradasPorDelante(tenantId, ahora)).length;
  const [reservas, revision] = await conTenant(tenantId, (tx) =>
    Promise.all([
      tx.ticketeraCompra.count({ where: { estado: "RESERVADA", venceEn: { gt: ahora } } }),
      tx.ticketeraCompra.count({ where: { estado: "EN_REVISION" } }),
    ]),
  );
  const abierto: string[] = [];
  if (shows) abierto.push(plural(shows, "show con entradas vendidas que no terminó", "shows con entradas vendidas que no terminaron"));
  if (reservas) abierto.push(plural(reservas, "compra esperando el pago", "compras esperando el pago"));
  if (revision) abierto.push(plural(revision, "pago de entradas en revisión", "pagos de entradas en revisión"));
  return abierto;
}
