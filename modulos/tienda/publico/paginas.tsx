/* eslint-disable @next/next/no-img-element -- fotos propias ya optimizadas (versión web) */
import Link from "next/link";
import { accesoRecordado } from "@/nucleo/publico/acceso";
import { CanjearLink } from "@/nucleo/publico/canjear-link";
import { AvisoDeDatos } from "@/nucleo/publico/legal/pie";
import { tieneAcceso } from "../acceso";
import { canjearPedidoAccion } from "./acciones";
import { cache } from "react";
import { notFound } from "next/navigation";
import { conTenant } from "@/nucleo/db/con-tenant";
import { consultar } from "@/nucleo/consultas";
import type { MetadatosPagina, PropsRutaPublica } from "@/nucleo/modulos/contrato";
import type { Opcion } from "../catalogo";
import { formatearPesos } from "@/nucleo/dinero";
import tienda from "../index";
import { pasarelaLista } from "@/nucleo/pagos";
import { describirVariante } from "../comun";
import { conOferta, productosPublicados } from "../productos";
import { Agregar } from "./agregar";
import { Carrito } from "./carrito";
import { Checkout } from "./checkout";
import { estadoParaFan } from "../estados";
import { c } from "@/nucleo/publico/estilo";
import { fotoDeProducto, urlFoto } from "./foto";
import { Pagar } from "./pagar";
import { Refrescar } from "@/nucleo/publico/refrescar";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const textoDeSuscripcion = (r: unknown) => {
  const t = (r as { texto?: unknown } | null)?.texto;
  return typeof t === "string" && t ? t : null;
};

function Pagina({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className={`mx-auto flex max-w-5xl flex-col gap-8 px-5 py-12 ${c.texto}`}>
      <h1 className="text-3xl font-black tracking-tight uppercase">{titulo}</h1>
      {children}
    </div>
  );
}

function NoDisponible() {
  return (
    <p role="note" className={c.aviso} data-tienda-no-disponible>
      La tienda no está recibiendo pedidos en este momento. Volvé pronto.
    </p>
  );
}

/** /tienda: productos publicados de la banda. */
export async function CatalogoPublico({ tenantId }: PropsRutaPublica) {
  const [productos, { lista }] = [await productosPublicados(tenantId), await pasarelaLista(tienda, tenantId)];
  return (
    <Pagina titulo="Tienda">
      {!lista && <NoDisponible />}
      {productos.length === 0 ? (
        <p className={c.suave}>Todavía no hay productos.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-6 md:grid-cols-3">
          {productos.map((p) => {
            const foto = urlFoto(fotoDeProducto(p));
            return (
              <li key={p.id} data-producto={p.nombre}>
                <Link href={`/tienda/${p.id}`} className="group flex flex-col gap-3">
                  {foto ? (
                    <img src={foto} alt={p.nombre} loading="lazy" className={`aspect-square w-full rounded-xl object-cover ${c.superficie}`} />
                  ) : (
                    <div className={`aspect-square w-full rounded-xl ${c.superficie}`} />
                  )}
                  <div>
                    <div className="font-bold group-hover:underline">{p.nombre}</div>
                    <div className={`tabular-nums ${c.suave}`} data-precio>
                      {formatearPesos(p.precio)}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Pagina>
  );
}

/** Una lectura por pedido (la piden los metadatos y la ficha). Solo lectura pública. */
const publicado = cache(async (tenantId: string, id: string) => {
  if (!UUID.test(id)) return null;
  const p = await conTenant(tenantId, (tx) => tx.tiendaProducto.findFirst({ where: { id, publicado: true }, include: { productoBase: true } }));
  return p ? ((await conOferta([p]))[0] ?? null) : null;
});

/** /tienda/<id>: ficha. Borrador o de otra banda: no existe. */
export async function FichaProducto({ tenantId, params }: PropsRutaPublica) {
  const p = await publicado(tenantId, params.producto);
  if (!p) notFound();
  const { lista } = await pasarelaLista(tienda, tenantId);
  const fotos = [
    p.fotoArchivoId && p.fotoNombre ? urlFoto({ id: p.fotoArchivoId, nombre: p.fotoNombre, plataforma: false }) : null,
    p.productoBase.fotoArchivoId && p.productoBase.fotoNombre
      ? urlFoto({ id: p.productoBase.fotoArchivoId, nombre: p.productoBase.fotoNombre, plataforma: true })
      : null,
  ].filter((x): x is string => !!x);
  return (
    <div className={`mx-auto grid max-w-5xl gap-10 px-5 py-12 md:grid-cols-2 ${c.texto}`}>
      <div className="flex flex-col gap-3">
        {fotos.length ? (
          fotos.map((f) => <img key={f} src={f} alt={p.nombre} className={`aspect-square w-full rounded-xl object-cover ${c.superficie}`} />)
        ) : (
          <div className={`aspect-square w-full rounded-xl ${c.superficie}`} />
        )}
      </div>
      <div className="flex flex-col gap-6">
        <Link href="/tienda" className={`text-sm font-bold ${c.suave}`}>
          ← Tienda
        </Link>
        <h1 className="text-3xl font-black tracking-tight">{p.nombre}</h1>
        <div className="text-2xl font-bold tabular-nums" data-precio>
          {formatearPesos(p.precio)} <span className={`text-sm font-normal ${c.suave}`}>+ envío {formatearPesos(p.oferta.costoEnvio)}</span>
        </div>
        {p.descripcion && <p className={`whitespace-pre-line ${c.suave}`}>{p.descripcion}</p>}
        {!lista && <NoDisponible />}
        <Agregar producto={{ id: p.id, nombre: p.nombre, precio: p.precio, variantes: p.variantes as Opcion[] }} disponible={lista} />
      </div>
    </div>
  );
}

export async function metadatosFicha({ tenantId, params }: PropsRutaPublica): Promise<MetadatosPagina> {
  const p = await publicado(tenantId, params.producto);
  if (!p) return {};
  return { titulo: p.nombre, descripcion: p.descripcion || undefined, imagen: urlFoto(fotoDeProducto(p)) ?? undefined };
}

export function CarritoPublico(_: PropsRutaPublica) {
  return (
    <Pagina titulo="Carrito">
      <Carrito />
    </Pagina>
  );
}

export async function CheckoutPublico({ tenantId }: PropsRutaPublica) {
  // La casilla de novedades, si la banda tiene el newsletter (módulo fans).
  const novedades = await consultar(tenantId, "fans.suscripcion", {}, { vacio: null, interpretar: textoDeSuscripcion });
  return (
    <Pagina titulo="Checkout">
      <Checkout novedades={novedades} />
      <div className="mt-6">
        <AvisoDeDatos tenantId={tenantId} />
      </div>
    </Pagina>
  );
}

/**
 * /tienda/pedido/<id>: en qué anda el pedido. El detalle y "pagar", solo con acceso (la cookie del
 * navegador que compró o el link del mail); sin acceso, solo el estado: el id no es un secreto.
 */
export async function PedidoPublico({ tenantId, params, consulta }: PropsRutaPublica) {
  if (!UUID.test(params.id)) notFound();
  const pedido = await conTenant(tenantId, (tx) => tx.tiendaPedido.findUnique({ where: { id: params.id }, include: { items: true } }));
  if (!pedido) notFound();
  const conAcceso = await tieneAcceso(tenantId, pedido.id, await accesoRecordado(`pedido-${pedido.id}`));
  const resultado = consulta.get("resultado");
  const estado = estadoParaFan(pedido, resultado);
  const esperandoAcreditacion = pedido.estado === "PENDIENTE" && (resultado === "exito" || pedido.estadoCobro === "approved");
  const puedePagar = conAcceso && pedido.estado === "PENDIENTE" && !esperandoAcreditacion;
  if (!conAcceso) {
    return (
      <Pagina titulo="Tu pedido">
        <CanjearLink canjear={canjearPedidoAccion.bind(null, pedido.id)} />
        <div className="flex flex-col gap-2" data-estado-pedido={pedido.estado}>
          <p className="text-xl font-black" data-titulo-estado>
            {estado.titulo}
          </p>
          <p className={c.suave}>{estado.detalle}</p>
          <p className={c.suave} data-sin-acceso>
            Para ver el detalle de tu pedido, abrí el link que te mandamos por mail.
          </p>
        </div>
        {esperandoAcreditacion && <Refrescar />}
      </Pagina>
    );
  }
  return (
    <Pagina titulo="Tu pedido">
      <div className="flex flex-col gap-2" data-estado-pedido={pedido.estado}>
        <p className="text-xl font-black" data-titulo-estado>
          {estado.titulo}
        </p>
        <p className={c.suave}>{estado.detalle}</p>
      </div>
      {esperandoAcreditacion && <Refrescar />}
      {puedePagar && <Pagar pedidoId={pedido.id} />}
      <ul className={`divide-y ${c.linea}`}>
        {pedido.items.map((i) => (
          <li key={i.id} className="flex justify-between py-2">
            <span>
              {i.nombreProducto} × {i.cantidad} <span className={c.suave}>{describirVariante(i.variante as Record<string, string>)}</span>
            </span>
            <span className="tabular-nums">{formatearPesos(i.precioUnitario * i.cantidad)}</span>
          </li>
        ))}
      </ul>
      <p className="text-lg font-black tabular-nums" data-total>
        Total {formatearPesos(pedido.total)} <span className={`text-sm font-normal ${c.suave}`}>(envío {formatearPesos(pedido.envio)})</span>
      </p>
    </Pagina>
  );
}
