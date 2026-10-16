/* eslint-disable @next/next/no-img-element -- archivos propios ya optimizados (versión web) */
import Link from "next/link";
import { notFound } from "next/navigation";
import { urlArchivo } from "@/nucleo/archivos";
import type { MetadatosPagina, PropsRutaPublica } from "@/nucleo/modulos/contrato";
import { pasarelaLista } from "@/nucleo/pagos";
import { accesoRecordado } from "@/nucleo/publico/acceso";
import { CanjearLink } from "@/nucleo/publico/canjear-link";
import { compraConToken, estadoDeCompra, MAXIMO_POR_COMPRA } from "../compras";
import { qrSvg } from "../correos";
import { formatearPesos } from "@/nucleo/dinero";
import { FECHA_LARGA } from "@/nucleo/fechas";
import { desdeAhora, eventoPublicado, eventos } from "../eventos";
import ticketera from "../index";
import { canjearEntradasAccion } from "./acciones";
import { Comprar } from "./comprar";
import { formatearCodigo } from "../firma";
import { c } from "@/nucleo/publico/estilo";
import { Refrescar } from "@/nucleo/publico/refrescar";

function Pagina({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className={`mx-auto flex max-w-5xl flex-col gap-8 px-5 py-12 ${c.texto}`}>
      <h1 className="text-3xl font-black tracking-tight uppercase">{titulo}</h1>
      {children}
    </div>
  );
}

const foto = (f: { id: string; nombre: string }) => urlArchivo(f, { variante: "web" });

/** /fechas: los próximos shows publicados. */
export async function FechasPublicas({ tenantId }: PropsRutaPublica) {
  const lista = await eventos(tenantId, { soloPublicados: true, desde: desdeAhora() });
  return (
    <Pagina titulo="Fechas">
      {lista.length === 0 ? (
        <p className={c.suave}>No hay fechas anunciadas por ahora.</p>
      ) : (
        <ul className={`divide-y border-y ${c.linea}`} data-fechas>
          {lista.map((e) => {
            const agotado = e.tipos.every((t) => t.venta === "agotada");
            const desde = Math.min(...e.tipos.map((t) => t.precio));
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-4 py-5" data-fecha={e.nombre}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold uppercase text-[var(--acento,#111)]">{FECHA_LARGA.format(e.fecha)}</div>
                  <div className="text-xl font-black">{e.nombre}</div>
                  <div className={c.suave}>
                    {e.lugar} · {e.ciudad}
                  </div>
                </div>
                <Link href={`/fechas/${e.id}`} className={c.boton}>
                  {agotado ? "Agotado" : `Entradas desde ${formatearPesos(desde)}`}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Pagina>
  );
}

/** /fechas/<id>: el show y la compra. Borrador o de otra banda: no existe. */
export async function EventoPublico({ tenantId, params }: PropsRutaPublica) {
  const e = await eventoPublicado(tenantId, params.id);
  if (!e) notFound();
  const { lista } = await pasarelaLista(ticketera, tenantId);
  const aLaVenta = e.tipos.filter((t) => t.venta === "abierta");
  return (
    <div className={`mx-auto grid max-w-5xl gap-10 px-5 py-12 md:grid-cols-[1fr_1.2fr] ${c.texto}`}>
      <div className="flex flex-col gap-4">
        {e.foto ? <img src={foto(e.foto)} alt={e.nombre} className={`w-full rounded-xl object-cover ${c.superficie}`} /> : null}
        <Link href="/fechas" className={`text-sm font-bold ${c.suave}`}>
          ← Fechas
        </Link>
        <h1 className="text-3xl font-black tracking-tight">{e.nombre}</h1>
        <p className="text-lg font-bold">{FECHA_LARGA.format(e.fecha)}</p>
        <p>
          {e.lugar} · {e.ciudad}
          {e.direccion && <span className={`block ${c.suave}`}>{e.direccion}</span>}
        </p>
        {e.descripcion && <p className={`whitespace-pre-line ${c.suave}`}>{e.descripcion}</p>}
        <ul className="flex flex-col gap-1 text-sm" data-tipos>
          {e.tipos.map((t) => (
            <li key={t.id} className="flex justify-between gap-4" data-tipo={t.nombre}>
              <span className="font-bold">{t.nombre}</span>
              <span className="tabular-nums">
                {formatearPesos(t.precio)}{" "}
                <span className={c.suave}>
                  {t.venta === "agotada" ? "· agotada" : t.venta === "antes" ? "· todavía no está a la venta" : t.venta === "despues" ? "· venta cerrada" : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        {!lista ? (
          <p role="note" className={c.aviso} data-ticketera-no-disponible>
            La venta de entradas no está disponible en este momento. Volvé pronto.
          </p>
        ) : aLaVenta.length === 0 ? (
          <p role="note" className={c.aviso} data-sin-venta>
            {e.tipos.every((t) => t.venta === "agotada") ? "Entradas agotadas." : "No hay entradas a la venta en este momento."}
          </p>
        ) : (
          <Comprar
            tipos={aLaVenta.map((t) => ({ id: t.id, nombre: t.nombre, precio: formatearPesos(t.precio), disponibles: t.disponibles }))}
            maximo={MAXIMO_POR_COMPRA}
          />
        )}
      </div>
    </div>
  );
}

export async function metadatosEvento({ tenantId, params }: PropsRutaPublica): Promise<MetadatosPagina> {
  const e = await eventoPublicado(tenantId, params.id);
  if (!e) return {};
  return { titulo: e.nombre, descripcion: `${FECHA_LARGA.format(e.fecha)} · ${e.lugar}, ${e.ciudad}`, imagen: e.foto ? foto(e.foto) : undefined };
}

/**
 * /fechas/compra/<id>: el estado de la compra y, con acceso (la cookie de este navegador o el
 * link del mail), las entradas con su QR. Sin acceso, solo el estado: el id no es un secreto.
 */
export async function CompraPublica({ tenantId, params, consulta }: PropsRutaPublica) {
  const token = await accesoRecordado(`entradas-${params.id}`);
  const compra = token ? await compraConToken(tenantId, params.id, token) : null;
  if (!compra) return <CompraSinAcceso tenantId={tenantId} id={params.id} resultado={consulta.get("resultado")} />;
  const resultado = consulta.get("resultado");
  const esperando = compra.estado === "RESERVADA" && (resultado === "exito" || compra.estadoCobro === "approved" || resultado === "pendiente");
  const qrs = await Promise.all(compra.entradas.map(async (e) => ({ ...e, svg: await qrSvg(e.codigo) })));
  return (
    <Pagina titulo="Tus entradas">
      <div className="flex flex-col gap-1">
        <p className="text-xl font-black">{compra.evento.nombre}</p>
        <p className={c.suave}>
          {FECHA_LARGA.format(compra.evento.fecha)} · {compra.evento.lugar}, {compra.evento.ciudad}
        </p>
      </div>
      <div data-estado-compra={compra.estado}>
        {compra.estado === "PAGADA" && <p className="font-bold">¡Listo! Mostrá el QR de cada entrada en la puerta. También te las mandamos por mail.</p>}
        {compra.estado === "RESERVADA" &&
          (esperando ? (
            <p className="font-bold">Estamos confirmando tu pago. Esta página se actualiza sola.</p>
          ) : (
            <p className="font-bold">
              Tus entradas están reservadas hasta las {new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }).format(compra.venceEn)}.{" "}
              {compra.urlPago && (
                <a href={compra.urlPago} className="underline">
                  Ir a pagar
                </a>
              )}
            </p>
          ))}
        {compra.estado === "VENCIDA" && <p className="font-bold">La reserva venció sin pago. Si querés, volvé a comprar.</p>}
        {compra.estado === "EN_REVISION" && <p className="font-bold">Recibimos un pago que hay que revisar. La banda te contacta.</p>}
      </div>
      {esperando && <Refrescar />}
      {qrs.length > 0 && (
        <ul className="grid gap-6 sm:grid-cols-2" data-entradas>
          {qrs.map((e) => (
            <li key={e.id} className={`flex flex-col items-center gap-2 rounded-xl border p-5 text-center ${c.linea}`} data-entrada={e.codigo}>
              <div className="w-56 rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: e.svg }} />
              <div className="text-lg font-black">{e.nombre}</div>
              <div className={c.suave}>
                Documento {e.documento} · {compra.tipo.nombre}
              </div>
              <div className="font-mono tracking-widest">{formatearCodigo(e.codigo)}</div>
              {e.validadaEn && <div className="text-sm font-bold">Ya usada</div>}
            </li>
          ))}
        </ul>
      )}
    </Pagina>
  );
}

/** Sin acceso a las entradas (otro navegador, o el link del mail todavía no canjeado). */
async function CompraSinAcceso({ tenantId, id, resultado }: { tenantId: string; id: string; resultado: string | null }) {
  const compra = await estadoDeCompra(tenantId, id);
  if (!compra) notFound();
  const esperando = compra.estado === "RESERVADA" && (resultado === "exito" || resultado === "pendiente" || compra.estadoCobro === "approved");
  return (
    <Pagina titulo="Tus entradas">
      <CanjearLink canjear={canjearEntradasAccion.bind(null, id)} />
      <div className="flex flex-col gap-1">
        <p className="text-xl font-black">{compra.evento.nombre}</p>
        <p className={c.suave}>
          {FECHA_LARGA.format(compra.evento.fecha)} · {compra.evento.lugar}, {compra.evento.ciudad}
        </p>
      </div>
      <p className="font-bold" data-estado-compra={compra.estado}>
        {compra.estado === "PAGADA"
          ? "Pago recibido. Te mandamos las entradas por mail: abrí el link de ese mail para verlas acá."
          : esperando
            ? "Estamos confirmando tu pago. Cuando se acredite, te llegan las entradas por mail."
            : compra.estado === "VENCIDA"
              ? "La reserva venció sin pago."
              : compra.estado === "EN_REVISION"
                ? "Recibimos un pago que hay que revisar. La banda te contacta."
                : "Esta compra está esperando el pago."}
      </p>
      {esperando && <Refrescar />}
    </Pagina>
  );
}
