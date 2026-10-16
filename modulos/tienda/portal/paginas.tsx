import Link from "next/link";
import { notFound } from "next/navigation";
import type { PropsRutaExterna } from "@/nucleo/modulos/contrato";
import { Campo, Casilla, Formulario, Insignia, Pestanas, Tabla, Tarjeta } from "@/ui";
import { formatearPesos } from "@/nucleo/dinero";
import { cuentaCorriente, type EstadoOrden, ordenDelProveedor, ordenesDelProveedor } from "../proveedor";
import { despacharAccion, saldarAccion } from "./acciones";

const FECHA = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });
const DIA = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });
const BASE = "/portal/tienda";

function EstadoOrdenInsignia({ estado }: { estado: EstadoOrden }) {
  return estado === "DESPACHADO" ? <Insignia color="exito">Despachada</Insignia> : <Insignia color="advertencia">A producir</Insignia>;
}

/** Proveedor · Órdenes de producción de todas las bandas. */
export async function PortalOrdenes({ usuarioId, consulta }: PropsRutaExterna) {
  const filtro = consulta.get("estado");
  const estado: EstadoOrden | undefined = filtro === "despachadas" ? "DESPACHADO" : filtro === "todas" ? undefined : "EN_PRODUCCION";
  const ordenes = await ordenesDelProveedor(usuarioId, { estado });
  const pestanas = [
    ["", "A producir"],
    ["despachadas", "Despachadas"],
    ["todas", "Todas"],
  ] as const;
  const actual = filtro === "despachadas" || filtro === "todas" ? filtro : "";
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-display-xs font-semibold text-primary">Órdenes de producción</h1>
        <p className="mt-1 text-md text-tertiary">Lo que te encargaron las bandas en Deoco. Abrí una para ver qué producir, el archivo y adónde enviarla.</p>
      </header>
      <Pestanas
        etiqueta="Filtro"
        pestanas={pestanas.map(([valor, etiqueta]) => ({ href: valor ? `${BASE}?estado=${valor}` : BASE, texto: etiqueta, actual: actual === valor }))}
      />
      {ordenes.length === 0 ? (
        <Tarjeta titulo={estado === "EN_PRODUCCION" ? "No hay nada para producir" : "No hay órdenes"}>
          <p className="text-tertiary">Cuando una banda venda algo que hacés vos, la orden aparece acá y te llega por mail.</p>
        </Tarjeta>
      ) : (
        <Tabla
          titulo="Órdenes"
          columnas={[
            { id: "orden", etiqueta: "Orden" },
            { id: "banda", etiqueta: "Banda" },
            { id: "unidades", etiqueta: "Unidades" },
            { id: "estado", etiqueta: "Estado" },
          ]}
          filas={ordenes.map((o) => ({
            id: o.id,
            celdas: [
              <div key="o" data-orden={o.pedido}>
                <Link href={`${BASE}/ordenes/${o.id}`} className="font-semibold text-primary underline">
                  #{o.pedido}
                </Link>
                <div className="text-sm text-tertiary">{FECHA.format(o.creadoEn)}</div>
              </div>,
              <span key="b">{o.banda}</span>,
              <span key="u" className="tabular-nums">
                {o.unidades}
              </span>,
              <div key="e" className="flex flex-col gap-1" data-estado={o.estado}>
                <EstadoOrdenInsignia estado={o.estado} />
                {o.seguimiento && <span className="text-xs text-tertiary">Seguimiento: {o.seguimiento}</span>}
              </div>,
            ],
          }))}
        />
      )}
    </div>
  );
}

/** Proveedor · Una orden: qué producir, archivo, adónde enviar, contacto de la banda. Sin montos de venta. */
export async function PortalOrden({ usuarioId, params }: PropsRutaExterna) {
  const o = await ordenDelProveedor(usuarioId, params.id);
  if (!o) notFound();
  return (
    <div className="flex flex-col gap-6" data-orden-detalle={o.pedido}>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-display-xs font-semibold text-primary">
          Orden #{o.pedido} · {o.banda}
        </h1>
        <EstadoOrdenInsignia estado={o.estado} />
        <Link href={BASE} className="ml-auto text-sm font-semibold text-tertiary underline">
          Todas las órdenes
        </Link>
      </header>
      <Tarjeta titulo="Producir" descripcion={`Pagada el ${FECHA.format(o.creadoEn)}.`}>
        <ul className="flex flex-col divide-y divide-secondary">
          {o.renglones.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 py-3" data-renglon={r.productoBase}>
              <div className="text-lg font-semibold text-primary">
                {r.cantidad} × {r.productoBase}
                {r.variante && <span className="font-normal text-secondary"> · {r.variante}</span>}
                {r.fueraDeCatalogo && (
                  <span className="ml-2 font-normal text-warning-primary" data-fuera-de-catalogo>
                    (pedido de antes de que se quitara esa variante del catálogo: producilo tal cual se compró)
                  </span>
                )}
              </div>
              <div className="text-sm text-tertiary">Producto de la banda: {r.producto}</div>
              <div className="text-sm">
                Archivo de impresión:{" "}
                <a href={r.archivo.url} className="font-semibold underline" data-link-impresion>
                  {r.archivo.nombre}
                </a>{" "}
                <span className="text-tertiary">({r.especificacion})</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-sm text-tertiary">
          El link del archivo se arma nuevo cada vez que abrís esta orden y vale 3 días. Si el del mail venció, usá este.
        </p>
      </Tarjeta>
      <div className="grid gap-6 md:grid-cols-2">
        <Tarjeta titulo="Enviar a">
          <address className="not-italic" data-envio>
            {o.envio.nombre}
            <br />
            {o.envio.direccion}
            <br />
            {o.envio.ciudad}, {o.envio.provincia} ({o.envio.codigoPostal})
            <br />
            Tel.: {o.envio.telefono}
          </address>
        </Tarjeta>
        <Tarjeta titulo="Contacto de la banda">
          <p data-contacto>
            {o.contacto.nombre}
            {o.contacto.email && (
              <>
                <br />
                <a href={`mailto:${o.contacto.email}`} className="underline">
                  {o.contacto.email}
                </a>
              </>
            )}
            {o.contacto.telefono && (
              <>
                <br />
                Tel.: {o.contacto.telefono}
              </>
            )}
          </p>
        </Tarjeta>
      </div>
      {o.estado === "EN_PRODUCCION" ? (
        <Tarjeta titulo="Despachar" descripcion="Cuando la mandes, marcala despachada: le llega un mail al comprador con el número de seguimiento.">
          <Formulario accion={despacharAccion.bind(null, o.id)} puedeEditar etiqueta="Marcar despachada">
            <Campo name="seguimiento" etiqueta="Número de seguimiento (opcional)" maxLength={80} />
          </Formulario>
        </Tarjeta>
      ) : (
        <Tarjeta titulo="Despachada">
          <p data-despachada>
            {o.despachadoEn && `El ${FECHA.format(o.despachadoEn)}. `}
            {o.seguimiento ? `Seguimiento: ${o.seguimiento}.` : "Sin número de seguimiento."}
          </p>
        </Tarjeta>
      )}
    </div>
  );
}

/** Proveedor · Cuenta corriente con cada banda. El proveedor marca lo que cobró; la banda lo ve. */
export async function PortalCuenta({ usuarioId }: PropsRutaExterna) {
  const cuentas = await cuentaCorriente(usuarioId);
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-display-xs font-semibold text-primary">Cuenta corriente</h1>
        <p className="mt-1 text-md text-tertiary">
          Lo que te debe cada banda por producción y envío. Te pagan ellas, directo: Deoco no cobra ni mueve esa plata. Cuando cobres,
          marcalo acá; la banda lo ve en su panel.
        </p>
      </header>
      {cuentas.length === 0 && (
        <Tarjeta titulo="Sin movimientos">
          <p className="text-tertiary">Todavía no hay órdenes pagadas.</p>
        </Tarjeta>
      )}
      {cuentas.map((c) => {
        const pendientes = c.deudas.filter((d) => !d.saldadaEn);
        return (
          <Tarjeta
            key={c.tenantId}
            data-cuenta={c.banda}
            titulo={c.banda}
            acciones={
              <div className="text-right">
                <div className="text-lg font-semibold tabular-nums" data-pendiente>
                  {formatearPesos(c.pendiente)}
                </div>
                <div className="text-sm text-tertiary">pendiente{c.saldado > 0 && ` · ${formatearPesos(c.saldado)} saldado`}</div>
              </div>
            }
          >
            {pendientes.length > 0 && (
              <Formulario accion={saldarAccion.bind(null, c.tenantId)} puedeEditar etiqueta="Marcar saldadas">
                <ul className="flex flex-col gap-2">
                  {pendientes.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2" data-deuda={d.pedido}>
                      <Casilla name={`deuda-${d.id}`} etiqueta={`Orden #${d.pedido} · ${DIA.format(d.creadoEn)}`} />
                      <span className="text-sm tabular-nums text-secondary">
                        {formatearPesos(d.produccion)} + envío {formatearPesos(d.envio)} = <strong>{formatearPesos(d.total)}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
                <Campo name="nota" etiqueta="Nota (opcional)" ayuda='Por ejemplo: "transferencia del 3/11".' maxLength={300} />
              </Formulario>
            )}
            {c.deudas.some((d) => d.saldadaEn) && (
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-tertiary">Saldadas</summary>
                <ul className="mt-2 flex flex-col gap-1 text-sm text-tertiary">
                  {c.deudas
                    .filter((d) => d.saldadaEn)
                    .map((d) => (
                      <li key={d.id} data-saldada={d.pedido}>
                        Orden #{d.pedido}: {formatearPesos(d.total)} · saldada el {DIA.format(d.saldadaEn!)}
                        {d.nota && ` (${d.nota})`}
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </Tarjeta>
        );
      })}
    </div>
  );
}
