/* eslint-disable @next/next/no-img-element -- archivos propios ya optimizados (versión web) */
import Link from "next/link";
import { notFound } from "next/navigation";
import { puedeEnPedido } from "@/nucleo/acceso/panel";
import { urlArchivo } from "@/nucleo/archivos";
import { conTenant } from "@/nucleo/db/con-tenant";
import type { PropsRutaPanel } from "@/nucleo/modulos/contrato";
import { pasarelaDe, pasarelaLista } from "@/nucleo/pagos";
import { cobrosDuplicados } from "@/nucleo/pagos/registro";
import { AreaTexto, Aviso, Campo, CampoArchivo, Casilla, Formulario, Insignia, Tabla, Tarjeta } from "@/ui";
import { formatearPesos, pesosParaCampo } from "@/nucleo/dinero";
import { FECHA_CORTA, fechaHoraParaCampo } from "@/nucleo/fechas";
import { desdeAhora, evento as leerEvento, eventos, type TipoConVenta } from "../eventos";
import ticketera from "../index";
import {
  actualizarEventoAccion,
  actualizarTipoAccion,
  borrarEventoAccion,
  borrarTipoAccion,
  crearEventoAccion,
  corregirEmailAccion,
  crearTipoAccion,
  guardarFrenosAccion,
  publicarAccion,
} from "./acciones";
import { MAXIMO_POR_COMPRA, MAXIMO_POR_EMAIL_Y_SHOW, RESERVA_MINUTOS, RESERVAS_ABIERTAS_POR_EMAIL, RESERVAS_ABIERTAS_POR_IP } from "../compras";

const puedeEditar = (slug: string) => puedeEnPedido("ticketera.eventos.editar", `/b/${slug}/entradas`);

function CamposEvento({ e }: { e?: { nombre: string; fecha: Date; lugar: string; ciudad: string; direccion: string; descripcion: string } }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo name="nombre" etiqueta="Nombre del show" defaultValue={e?.nombre} maxLength={120} required />
        <Campo name="fecha" type="datetime-local" etiqueta="Día y hora" ayuda="Hora de Argentina." defaultValue={e ? fechaHoraParaCampo(e.fecha) : undefined} required />
        <Campo name="lugar" etiqueta="Lugar" defaultValue={e?.lugar} maxLength={120} required />
        <Campo name="ciudad" etiqueta="Ciudad" defaultValue={e?.ciudad} maxLength={80} required />
        <Campo name="direccion" etiqueta="Dirección" defaultValue={e?.direccion} maxLength={200} />
      </div>
      <AreaTexto name="descripcion" etiqueta="Descripción" defaultValue={e?.descripcion} maxLength={2000} />
    </>
  );
}

const ventaTexto: Record<TipoConVenta["venta"], string> = { abierta: "A la venta", antes: "Todavía no", despues: "Venta cerrada", agotada: "Agotada" };

/** Panel · Entradas: los shows de la banda. */
export async function EventosPanel({ tenantId, slug }: PropsRutaPanel) {
  const [lista, editar, { lista: cobra }] = [await eventos(tenantId), await puedeEditar(slug), await pasarelaLista(ticketera, tenantId)];
  const proximos = lista.filter((e) => e.fecha >= desdeAhora());
  const pasados = lista.filter((e) => e.fecha < desdeAhora()).reverse();
  const fila = (e: (typeof lista)[number]) => {
    const vendidas = e.tipos.reduce((s, t) => s + t.vendidas, 0);
    const cupo = e.tipos.reduce((s, t) => s + t.cupo, 0);
    return {
      id: e.id,
      celdas: [
        <div key="n" data-evento={e.nombre}>
          <Link href={`/b/${slug}/entradas/${e.id}`} className="font-semibold text-primary underline">
            {e.nombre}
          </Link>
          <div className="text-sm text-tertiary">
            {FECHA_CORTA.format(e.fecha)} · {e.lugar}, {e.ciudad}
          </div>
        </div>,
        <span key="v" className="tabular-nums" data-vendidas>
          {vendidas} / {cupo}
        </span>,
        e.publicado ? <Insignia key="p" color="exito">Publicado</Insignia> : <Insignia key="p">Borrador</Insignia>,
      ],
    };
  };
  const columnas = [
    { id: "show", etiqueta: "Show" },
    { id: "vendidas", etiqueta: "Vendidas / cupo" },
    { id: "estado", etiqueta: "" },
  ];
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-display-xs font-semibold text-primary">Entradas</h1>
        <p className="mt-1 text-md text-tertiary">
          Tus shows, los tipos de entrada y lo vendido. La plata de cada entrada va directo a tu cuenta de cobro: Deoco no la toca.
        </p>
      </header>
      {!cobra && (
        <Aviso titulo="Todavía no podés vender" data-ticketera-sin-pasarela>
          Falta conectar tu cuenta de cobro en <Link href={`/b/${slug}/credenciales`} className="font-semibold underline">Credenciales</Link>.
          Hasta entonces, los shows publicados se ven pero no se pueden comprar.
        </Aviso>
      )}
      <Tabla titulo="Próximos shows" columnas={columnas} filas={proximos.map(fila)} />
      {pasados.length > 0 && <Tabla titulo="Ya pasaron" columnas={columnas} filas={pasados.map(fila)} />}
      {editar && (
        <Tarjeta titulo="Nuevo show" descripcion="Se crea como borrador. Después le cargás los tipos de entrada y lo publicás.">
          <Formulario accion={crearEventoAccion.bind(null, slug)} puedeEditar etiqueta="Crear show">
            <CamposEvento />
          </Formulario>
        </Tarjeta>
      )}
    </div>
  );
}

/** Panel · Un show: datos, foto, tipos de entrada con lo vendido, compras. */
export async function EventoPanel({ tenantId, slug, params }: PropsRutaPanel) {
  const e = await leerEvento(tenantId, params.id);
  if (!e) notFound();
  const editar = await puedeEditar(slug);
  const compras = await conTenant(tenantId, (tx) =>
    tx.ticketeraCompra.findMany({ where: { eventoId: e.id, estado: { in: ["PAGADA", "EN_REVISION"] } }, include: { tipo: true }, orderBy: { creadoEn: "desc" }, take: 300 }),
  );
  // Pagos duplicados: los registra el núcleo (uno por cobro de más), por compra.
  const duplicados = await cobrosDuplicados(ticketera, tenantId, compras.map((c) => c.id));
  const enRevision = compras.filter((c) => c.estado === "EN_REVISION" || c.observacion || duplicados.some((d) => d.referencia === c.id));
  const enLinea = { puedeEditar: editar, enLinea: true, variante: "secundario" as const };
  return (
    <div className="flex flex-col gap-6" data-evento-panel={e.nombre}>
      <header className="flex flex-wrap items-center gap-3">
        <Link href={`/b/${slug}/entradas`} className="text-sm font-semibold text-tertiary underline">
          Entradas
        </Link>
        <h1 className="w-full text-display-xs font-semibold text-primary">{e.nombre}</h1>
        {e.publicado ? <Insignia color="exito">Publicado</Insignia> : <Insignia>Borrador</Insignia>}
        <Formulario {...enLinea} accion={publicarAccion.bind(null, slug, e.id, !e.publicado)} etiqueta={e.publicado ? "Pasar a borrador" : "Publicar"} />
      </header>
      {enRevision.length > 0 && (
        <Aviso tono="error" titulo="Hay pagos para revisar" data-compras-revision>
          {enRevision.map((c) => (
            <p key={c.id}>
              {c.nombre} ({c.email}): {c.observacion}
              {duplicados
                .filter((d) => d.referencia === c.id)
                .map((d) => (
                  <span key={d.cobroId} data-pago-duplicado={d.cobroId}>
                    {" "}
                    Pago duplicado: {d.moneda === "ARS" ? formatearPesos(d.monto) : `${d.moneda} ${(d.monto / 100).toFixed(2)}`}{" "}
                    {`(pago ${d.cobroId} en ${pasarelaDe(d.pasarela)?.nombre ?? d.pasarela}).`} Devolvelo desde tu pasarela.
                  </span>
                ))}
            </p>
          ))}
          <p>Devolvé esos pagos desde tu cuenta de la pasarela: Deoco no devuelve nada, solo te avisa.</p>
        </Aviso>
      )}
      <Tabla
        titulo="Tipos de entrada"
        columnas={[
          { id: "tipo", etiqueta: "Tipo" },
          { id: "vendidas", etiqueta: "Vendidas" },
          { id: "reservadas", etiqueta: "Pagando ahora" },
          { id: "disponibles", etiqueta: "Disponibles" },
          { id: "venta", etiqueta: "" },
        ]}
        filas={e.tipos.map((t) => ({
          id: t.id,
          celdas: [
            <div key="t" data-tipo={t.nombre}>
              <div className="font-medium text-primary">{t.nombre}</div>
              <div className="text-sm text-tertiary tabular-nums">
                {formatearPesos(t.precio)} · cupo {t.cupo}
              </div>
            </div>,
            <span key="v" className="tabular-nums" data-vendidas>
              {t.vendidas}
            </span>,
            <span key="r" className="tabular-nums">
              {t.reservadas}
            </span>,
            <span key="d" className="tabular-nums" data-disponibles>
              {t.disponibles}
            </span>,
            <Insignia key="e" color={t.venta === "abierta" ? "exito" : t.venta === "agotada" ? "error" : "gris"}>
              {ventaTexto[t.venta]}
            </Insignia>,
          ],
        }))}
      />
      {editar &&
        e.tipos.map((t) => (
          <details key={t.id} className="rounded-xl bg-primary p-4 ring-1 ring-secondary ring-inset" data-editar-tipo={t.nombre}>
            <summary className="cursor-pointer text-sm font-semibold text-secondary">Editar «{t.nombre}»</summary>
            <div className="mt-4 flex flex-col gap-4">
              <Formulario accion={actualizarTipoAccion.bind(null, slug, t.id)} puedeEditar>
                <CamposTipo t={t} />
              </Formulario>
              {t.vendidas + t.reservadas === 0 && (
                <Formulario {...enLinea} variante="peligro" accion={borrarTipoAccion.bind(null, slug, t.id)} etiqueta="Borrar tipo" />
              )}
            </div>
          </details>
        ))}
      {editar && (
        <Tarjeta titulo="Nuevo tipo de entrada" descripcion="Precio, cupo y, si querés, desde y hasta cuándo se vende.">
          <Formulario accion={crearTipoAccion.bind(null, slug, e.id)} puedeEditar etiqueta="Agregar tipo" limpiarAlGuardar>
            <CamposTipo />
          </Formulario>
        </Tarjeta>
      )}
      <Tarjeta titulo="Datos del show">
        {e.foto && <img src={urlArchivo(e.foto, { variante: "web", panelSlug: slug })} alt="" className="mb-4 max-h-64 rounded-lg object-cover" />}
        <Formulario accion={actualizarEventoAccion.bind(null, slug, e.id)} puedeEditar={editar}>
          <CamposEvento e={e} />
          <CampoArchivo name="foto" etiqueta={e.foto ? "Cambiar foto" : "Foto"} accept="image/jpeg,image/png,image/webp" ayuda="JPG, PNG o WebP." />
        </Formulario>
      </Tarjeta>
      <Tarjeta titulo="Frenos de compra">
        <p className="mb-4 text-sm text-tertiary">
          Contra quien reserva un show entero para revenderlo. Vacío: el número de la plataforma ({RESERVA_MINUTOS} minutos de reserva, {MAXIMO_POR_COMPRA} por
          compra, {MAXIMO_POR_EMAIL_Y_SHOW} por persona, {RESERVAS_ABIERTAS_POR_EMAIL} reservas abiertas por email, {RESERVAS_ABIERTAS_POR_IP} por conexión).
        </p>
        <Formulario accion={guardarFrenosAccion.bind(null, slug, e.id)} puedeEditar={editar} etiqueta="Guardar frenos">
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo name="reservaMinutos" type="number" etiqueta="Reserva (minutos)" ayuda="De 5 a 30." defaultValue={e.frenos.reservaMinutos?.toString()} placeholder={String(RESERVA_MINUTOS)} />
            <Campo name="maxPorCompra" type="number" etiqueta="Entradas por compra" ayuda="De 1 a 20." defaultValue={e.frenos.maxPorCompra?.toString()} placeholder={String(MAXIMO_POR_COMPRA)} />
            <Campo name="maxPorPersona" type="number" etiqueta="Entradas por persona" ayuda="De 1 a 100, por email." defaultValue={e.frenos.maxPorPersona?.toString()} placeholder={String(MAXIMO_POR_EMAIL_Y_SHOW)} />
            <Campo name="reservasPorEmail" type="number" etiqueta="Reservas abiertas por email" ayuda="De 1 a 5." defaultValue={e.frenos.reservasPorEmail?.toString()} placeholder={String(RESERVAS_ABIERTAS_POR_EMAIL)} />
            <Campo name="reservasPorIp" type="number" etiqueta="Reservas abiertas por conexión" ayuda="De 1 a 50." defaultValue={e.frenos.reservasPorIp?.toString()} placeholder={String(RESERVAS_ABIERTAS_POR_IP)} />
          </div>
        </Formulario>
      </Tarjeta>
      <Tabla
        titulo={`Compras (${compras.length})`}
        columnas={[
          { id: "quien", etiqueta: "Compró" },
          { id: "tipo", etiqueta: "Entradas" },
          { id: "total", etiqueta: "Total" },
          { id: "email", etiqueta: "" },
        ]}
        filas={compras.map((c) => ({
          id: c.id,
          celdas: [
            <div key="q">
              <div className="font-medium text-primary">{c.nombre}</div>
              <div className="text-sm text-tertiary">
                {c.email} · {FECHA_CORTA.format(c.pagadaEn ?? c.creadoEn)}
              </div>
            </div>,
            <span key="t">
              {c.cantidad} × {c.tipo.nombre}
            </span>,
            <span key="m" className="tabular-nums">
              {formatearPesos(c.total)}
            </span>,
            c.estado === "PAGADA" && editar ? (
              <details key="e" className="text-sm" data-corregir-email={c.id}>
                <summary className="cursor-pointer text-tertiary underline">Corregir el email</summary>
                <div className="mt-2 w-72">
                  <Formulario accion={corregirEmailAccion.bind(null, slug, c.id)} puedeEditar etiqueta="Corregir y reenviar">
                    <Campo name="email" type="email" etiqueta="Email correcto" required />
                    <Campo name="comprobante" etiqueta="Comprobante que verificaste" ayuda="El número de operación del pago." required />
                  </Formulario>
                </div>
              </details>
            ) : (
              <span key="e" />
            ),
          ],
        }))}
      />
      {editar && compras.length === 0 && (
        <Tarjeta titulo="Borrar show">
          <Formulario puedeEditar enLinea variante="peligro" accion={borrarEventoAccion.bind(null, slug, e.id)} etiqueta="Borrar show">
            <Casilla name="confirmar" etiqueta="Confirmo borrarlo" />
          </Formulario>
        </Tarjeta>
      )}
    </div>
  );
}

function CamposTipo({ t }: { t?: TipoConVenta }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Campo name="nombre" etiqueta="Nombre" placeholder="General" defaultValue={t?.nombre} maxLength={60} required />
      <Campo name="precio" etiqueta="Precio ($)" defaultValue={t ? pesosParaCampo(t.precio) : undefined} maxLength={20} required />
      <Campo name="cupo" type="number" etiqueta="Cupo" defaultValue={t ? String(t.cupo) : undefined} required />
      <Campo name="ventaDesde" type="datetime-local" etiqueta="Venta desde (opcional)" defaultValue={t?.ventaDesde ? fechaHoraParaCampo(t.ventaDesde) : undefined} />
      <Campo name="ventaHasta" type="datetime-local" etiqueta="Venta hasta (opcional)" defaultValue={t?.ventaHasta ? fechaHoraParaCampo(t.ventaHasta) : undefined} />
    </div>
  );
}
