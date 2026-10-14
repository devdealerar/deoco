// Bloque del inicio del panel (consulta "ticketera.inicio"): el próximo show y cómo va la venta.
import { conTenant } from "@/nucleo/db/con-tenant";
import { FECHA_CORTA } from "@/nucleo/fechas";
import { pasarelaLista } from "@/nucleo/pagos";
import ticketera from "./index";

export async function inicioTicketera(tenantId: string) {
  const [r, { lista }] = await Promise.all([
    conTenant(tenantId, async (tx) => {
      const proximo = await tx.ticketeraEvento.findFirst({
        where: { publicado: true, fecha: { gte: new Date() } },
        orderBy: { fecha: "asc" },
        include: { tipos: { select: { cupo: true, ocupadas: true } } },
      });
      const vendidas = proximo ? await tx.ticketeraEntrada.count({ where: { eventoId: proximo.id } }) : 0;
      const revisar = await tx.ticketeraCompra.count({ where: { estado: "EN_REVISION" } });
      return { proximo, vendidas, revisar };
    }),
    pasarelaLista(ticketera, tenantId),
  ]);
  const pendientes = [];
  if (!lista) pendientes.push({ texto: "Conectá tu cuenta de cobro para poder vender.", href: "/credenciales" });
  if (r.revisar) pendientes.push({ texto: `${r.revisar} ${r.revisar === 1 ? "compra de entradas para revisar" : "compras de entradas para revisar"}.`, href: "/entradas" });
  if (!r.proximo) return { titulo: "Entradas", datos: [{ etiqueta: "Próximo show", valor: "Ninguno publicado" }], pendientes };
  const cupo = r.proximo.tipos.reduce((s, t) => s + t.cupo, 0);
  const ocupadas = r.proximo.tipos.reduce((s, t) => s + t.ocupadas, 0);
  return {
    titulo: "Entradas",
    datos: [
      { etiqueta: "Próximo show", valor: `${r.proximo.nombre} · ${FECHA_CORTA.format(r.proximo.fecha)}` },
      { etiqueta: "Vendidas", valor: String(r.vendidas) },
      { etiqueta: "Disponibles", valor: String(Math.max(0, cupo - ocupadas)) },
    ],
    pendientes,
  };
}
