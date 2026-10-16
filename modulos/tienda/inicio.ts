// Bloque del inicio del panel (consulta "tienda.inicio"): ventas del mes, lo que falta despachar,
// la deuda con proveedores y lo que impide vender.
import { conTenant } from "@/nucleo/db/con-tenant";
import { formatearPesos } from "@/nucleo/dinero";
import { diaArgentino } from "@/nucleo/fechas";
import { pasarelaLista } from "@/nucleo/pagos";
import tienda from "./index";

/** El primer instante del mes en Argentina (UTC−3). */
export const inicioDelMes = (ahora: Date) => new Date(`${diaArgentino(ahora).slice(0, 7)}-01T03:00:00Z`);

export async function inicioTienda(tenantId: string) {
  const desde = inicioDelMes(new Date());
  const [r, { lista }] = await Promise.all([
    conTenant(tenantId, async (tx) => ({
      mes: await tx.tiendaPedido.aggregate({ where: { pagadoEn: { gte: desde }, estado: { in: ["PAGADO", "DESPACHADO"] } }, _count: true, _sum: { total: true } }),
      despachar: await tx.tiendaPedido.count({ where: { estado: "PAGADO" } }),
      revisar: await tx.tiendaPedido.count({ where: { estado: "EN_REVISION" } }),
      deuda: await tx.tiendaDeuda.aggregate({ where: { saldadaEn: null }, _sum: { total: true } }),
      publicados: await tx.tiendaProducto.count({ where: { publicado: true } }),
      sinProveedor: await tx.tiendaProducto.count({ where: { sinOfertaDesde: { not: null } } }),
      aRevisar: await tx.tiendaProducto.count({ where: { revisarDesde: { not: null } } }),
    })),
    pasarelaLista(tienda, tenantId),
  ]);
  const pendientes = [];
  if (!lista) pendientes.push({ texto: "Conectá tu cuenta de cobro para poder vender.", href: "/credenciales" });
  if (r.revisar) pendientes.push({ texto: `${r.revisar} ${r.revisar === 1 ? "pago para revisar" : "pagos para revisar"} en la tienda.`, href: "/tienda/pedidos" });
  if (r.sinProveedor) pendientes.push({ texto: `${r.sinProveedor} ${r.sinProveedor === 1 ? "producto quedó" : "productos quedaron"} sin proveedor: elegí otro para volver a venderlos.`, href: "/tienda" });
  if (r.aRevisar) pendientes.push({ texto: `${r.aRevisar} ${r.aRevisar === 1 ? "producto dejó" : "productos dejaron"} de venderse porque cambió su producto base: revisá el arte o las variantes.`, href: "/tienda" });
  if (!r.publicados) pendientes.push({ texto: "Todavía no publicaste productos en la tienda.", href: "/tienda" });
  return {
    titulo: "Tienda",
    datos: [
      { etiqueta: "Pedidos del mes", valor: String(r.mes._count) },
      { etiqueta: "Vendido en el mes", valor: formatearPesos(r.mes._sum.total ?? 0) },
      { etiqueta: "En producción, sin despachar", valor: String(r.despachar) },
      { etiqueta: "Deuda con proveedores", valor: formatearPesos(r.deuda._sum.total ?? 0) },
    ],
    pendientes,
  };
}
