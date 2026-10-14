import { conTenant } from "@/nucleo/db/con-tenant";
import type { PropsRutaPanel } from "@/nucleo/modulos/contrato";
import { Insignia, Tabla, Tarjeta } from "@/ui";
import { describirVariante } from "../comun";
import { formatearPesos } from "@/nucleo/dinero";
import { ESTADO_PANEL } from "../estados";
import { deudaDeBanda } from "../pagos";
import { pasarelaDe } from "@/nucleo/pagos";
import { cobrosDuplicados } from "@/nucleo/pagos/registro";
import tienda from "../index";
import { Encabezado, puedeEditar as puedeEditarEn } from "./comun";

const FECHA = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

/** Panel · Pedidos: los de la banda y en qué anda cada uno. */
export async function PedidosTienda({ tenantId, slug }: PropsRutaPanel) {
  const [filas, puedeEditar] = [
    await conTenant(tenantId, (tx) =>
      tx.tiendaPedido.findMany({ orderBy: { creadoEn: "desc" }, take: 200, include: { items: true, ordenes: { include: { proveedor: { select: { nombre: true } } } } } }),
    ),
    await puedeEditarEn(slug),
  ];
  // Pagos duplicados: los registra el núcleo (uno por cobro de más), por pedido.
  const duplicados = await cobrosDuplicados(tienda, tenantId, filas.map((p) => p.id));
  const pedidos = filas.map((p) => ({ ...p, pagosExtra: duplicados.filter((d) => d.referencia === p.id) }));
  return (
    <div className="flex flex-col gap-6">
      <Encabezado slug={slug} actual="/pedidos" puedeEditar={puedeEditar} />
      {pedidos.some((p) => p.pagosExtra.length > 0) && (
        <p role="alert" data-aviso-duplicados className="rounded-xl bg-error-primary p-4 text-md text-error-primary ring-1 ring-error_subtle ring-inset">
          <strong>Hay pagos duplicados.</strong> Un fan pagó dos veces el mismo pedido. Devolvé el pago extra desde tu cuenta de la
          pasarela. Deoco no devuelve nada: solo te avisa.
        </p>
      )}
      {pedidos.some((p) => p.estado === "EN_REVISION") && (
        <p role="alert" className="rounded-xl bg-error-primary p-4 text-md text-error-primary ring-1 ring-error_subtle ring-inset">
          Hay pagos a revisar: la pasarela aprobó un monto que no coincide con el pedido. Revisalo en tu cuenta de la pasarela antes
          de despachar.
        </p>
      )}
      <Tabla
        titulo="Pedidos"
        columnas={[
          { id: "pedido", etiqueta: "Pedido" },
          { id: "fan", etiqueta: "Fan" },
          { id: "total", etiqueta: "Total" },
          { id: "estado", etiqueta: "Estado" },
        ]}
        filas={pedidos.map((p) => ({
          id: p.id,
          celdas: [
            <div key="p" data-pedido={p.id}>
              <div className="font-medium text-primary">{FECHA.format(p.creadoEn)}</div>
              <div className="text-sm text-tertiary">
                {p.items.map((i) => `${i.nombreProducto} × ${i.cantidad}${Object.keys(i.variante as object).length ? ` (${describirVariante(i.variante as Record<string, string>)})` : ""}`).join(", ")}
              </div>
            </div>,
            <div key="f" className="text-sm">
              <div className="text-primary">{p.nombre}</div>
              <div className="text-tertiary">
                {p.ciudad}, {p.provincia}
              </div>
            </div>,
            <span key="t" className="tabular-nums">
              {formatearPesos(p.total)}
            </span>,
            <div key="e" className="flex flex-col gap-1" data-estado={p.estado}>
              <Insignia color={ESTADO_PANEL[p.estado].color}>{ESTADO_PANEL[p.estado].texto}</Insignia>
              {p.observacion && <span className="text-xs text-error-primary">{p.observacion}</span>}
              {p.ordenes.length > 1 &&
                p.ordenes.map((o) => (
                  <span key={o.id} className="text-xs text-tertiary" data-orden={o.estado}>
                    {o.proveedor.nombre}: {o.estado === "DESPACHADO" ? "despachado" : "en producción"}
                    {o.seguimiento && ` · seguimiento ${o.seguimiento}`}
                  </span>
                ))}
              {p.ordenes.length === 1 && p.ordenes[0].seguimiento && (
                <span className="text-xs text-tertiary" data-seguimiento>
                  Seguimiento: {p.ordenes[0].seguimiento}
                </span>
              )}
              {p.pagosExtra.map((x) => (
                <span key={x.cobroId} className="text-xs font-semibold text-error-primary" data-pago-duplicado={x.cobroId}>
                  Pago duplicado: {x.moneda === "ARS" ? formatearPesos(x.monto) : `${x.moneda} ${(x.monto / 100).toFixed(2)}`}{" "}
                  {`(pago ${x.cobroId} en ${pasarelaDe(x.pasarela)?.nombre ?? x.pasarela}).`} Tenés que devolverlo desde tu pasarela.{" "}
                  {pasarelaDe(x.pasarela)?.comoDevolver}
                </span>
              ))}
            </div>,
          ],
        }))}
      />
    </div>
  );
}

/** Panel · Deuda: lo que la banda le debe a cada proveedor por los pedidos pagados. */
export async function DeudaTienda({ tenantId, slug }: PropsRutaPanel) {
  const [deudas, puedeEditar] = [await deudaDeBanda(tenantId), await puedeEditarEn(slug)];
  return (
    <div className="flex flex-col gap-6">
      <Encabezado slug={slug} actual="/deuda" puedeEditar={puedeEditar} />
      <Tarjeta
        titulo="Deuda con proveedores"
        descripcion="Por cada pedido pagado: la producción y el envío que hace el proveedor. Se la pagás vos al proveedor; Deoco solo lleva la cuenta, no cobra ni mueve esa plata. La marca saldada el proveedor, desde su panel, cuando recibe el pago."
      >
        {deudas.length === 0 ? (
          <p className="text-tertiary">Todavía no hay pedidos pagados.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-secondary">
            {deudas.map((d) => (
              <li key={d.proveedorId} className="flex flex-wrap items-baseline justify-between gap-4 py-3" data-deuda={d.proveedor}>
                <div>
                  <div className="font-semibold text-primary">{d.proveedor}</div>
                  <div className="text-sm text-tertiary">{d.email}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold tabular-nums" data-pendiente>
                    {formatearPesos(d.pendiente)}
                  </div>
                  <div className="text-sm text-tertiary">
                    {d.pedidosPendientes} pedido(s) sin saldar{d.saldado > 0 && ` · ${formatearPesos(d.saldado)} saldado`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}
