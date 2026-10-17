import Link from "next/link";
import { conTenant } from "@/nucleo/db/con-tenant";
import { formatearPesos } from "@/nucleo/dinero";
import { FECHA_CORTA } from "@/nucleo/fechas";
import { c } from "@/nucleo/publico/estilo";
import { estadoParaFan } from "../estados";

// Área del fan (D5): los pedidos de la tienda de ese email (verificado por el link del mail).

const pedidosDe = (tenantId: string, email: string) =>
  conTenant(tenantId, (tx) =>
    tx.tiendaPedido.findMany({
      where: { email: { equals: email, mode: "insensitive" }, estado: { not: "CANCELADO" } },
      include: { items: { select: { nombreProducto: true, cantidad: true } } },
      orderBy: { creadoEn: "desc" },
      take: 50,
    }),
  );

export async function tieneTienda(tenantId: string, email: string): Promise<boolean> {
  return (await conTenant(tenantId, (tx) => tx.tiendaPedido.count({ where: { email: { equals: email, mode: "insensitive" } } }))) > 0;
}

export async function PedidosDelFan({ tenantId, email }: { tenantId: string; email: string }) {
  const pedidos = await pedidosDe(tenantId, email);
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-black">Pedidos de la tienda</h2>
      {pedidos.length === 0 ? (
        <p className={c.suave}>No hay pedidos.</p>
      ) : (
        <ul className={`divide-y border-y ${c.linea}`} data-pedidos-fan>
          {pedidos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-4 py-4" data-pedido-fan={p.id} data-estado={p.estado}>
              <div className="min-w-0 flex-1">
                <div className="font-bold">{estadoParaFan(p).titulo}</div>
                <div className={`text-sm ${c.suave}`}>
                  {FECHA_CORTA.format(p.creadoEn)} · {p.items.map((i) => `${i.cantidad} × ${i.nombreProducto}`).join(", ")} · {formatearPesos(p.total)}
                </div>
              </div>
              <Link href={`/tienda/pedido/${p.id}`} className={c.botonSuave}>
                Ver el pedido
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
