/* eslint-disable @next/next/no-img-element -- archivos propios ya optimizados (versión web) */
import Link from "next/link";
import { notFound } from "next/navigation";
import { puedeEnPedido } from "@/nucleo/acceso/panel";
import { urlArchivo } from "@/nucleo/archivos";
import type { PropsRutaPanel } from "@/nucleo/modulos/contrato";
import { diaArgentino } from "@/nucleo/fechas";
import { Aviso, Boton, Campo, CampoArchivo, Casilla, Formulario, Insignia, Selector, Tabla, Tarjeta } from "@/ui";
import { campania as leerCampania, campanias, estadoDeHito, type EstadoHito, TIPOS } from "../campanias";
import { cancelarCampaniaAccion, crearCampaniaAccion, marcarHitoAccion, moverFechaAccion, subirPiezaAccion, terminarCampaniaAccion } from "./acciones";

const puedeEditar = (slug: string) => puedeEnPedido("lanzamiento.campanias.editar", `/b/${slug}/lanzamientos`);
const DIA = new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires" });
const DIA_LARGO = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" });

const INSIGNIA: Record<EstadoHito, { texto: string; color: "exito" | "error" | "advertencia" | "gris" }> = {
  hecho: { texto: "Hecho", color: "exito" },
  atrasado: { texto: "Atrasado", color: "error" },
  "esta-semana": { texto: "Esta semana", color: "advertencia" },
  pendiente: { texto: "Pendiente", color: "gris" },
};

const ESTADOS: Record<string, string> = { ACTIVA: "En curso", TERMINADA: "Terminada", CANCELADA: "Cancelada (archivada)" };

/** Panel · Lanzamientos: las campañas (las canceladas quedan archivadas, abajo). */
export async function CampaniasPanel({ tenantId, slug }: PropsRutaPanel) {
  const [lista, editar] = await Promise.all([campanias(tenantId), puedeEditar(slug)]);
  const activas = lista.filter((c) => c.estado !== "CANCELADA");
  const archivadas = lista.filter((c) => c.estado === "CANCELADA");
  const fila = (c: (typeof lista)[number]) => ({
    id: c.id,
    celdas: [
      <div key="t" data-campania={c.titulo}>
        <Link href={`/b/${slug}/lanzamientos/${c.id}`} className="font-semibold text-primary underline">
          {c.titulo}
        </Link>
        <div className="text-sm text-tertiary">
          {TIPOS[c.tipo] ?? c.tipo} · {DIA_LARGO.format(c.fecha)}
        </div>
      </div>,
      <span key="h" className="tabular-nums">
        {c.hechos} / {c.hitos.length}
      </span>,
      c.atrasados ? (
        <Insignia key="a" color="error">
          {c.atrasados} atrasados
        </Insignia>
      ) : (
        <span key="a" />
      ),
      <span key="p" className="tabular-nums">
        {c.piezasSubidas} / {c.piezas.length}
        {c.noConformes ? ` (${c.noConformes} no conformes)` : ""}
      </span>,
      <span key="e">{ESTADOS[c.estado] ?? c.estado}</span>,
    ],
  });
  const columnas = [
    { id: "campania", etiqueta: "Lanzamiento" },
    { id: "hitos", etiqueta: "Hitos" },
    { id: "atrasados", etiqueta: "" },
    { id: "piezas", etiqueta: "Piezas" },
    { id: "estado", etiqueta: "Estado" },
  ];
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-display-xs font-semibold text-primary">Lanzamientos</h1>
        <p className="mt-1 text-md text-tertiary">Una campaña por lanzamiento: el cronograma y las piezas gráficas se arman solos con la fecha. Es interno: nada se ve en tu sitio.</p>
      </header>
      <Tabla titulo="Campañas" columnas={columnas} filas={activas.map(fila)} />
      <Tarjeta titulo="Nueva campaña" descripcion="Elegí la fecha del lanzamiento: el cronograma se arma hacia atrás y hacia adelante.">
        <Formulario accion={crearCampaniaAccion.bind(null, slug)} puedeEditar={editar} etiqueta="Armar la campaña">
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo name="titulo" etiqueta="Nombre" placeholder="Nuevo single" maxLength={120} required />
            <Selector name="tipo" etiqueta="Qué sale" defaultValue="single" opciones={Object.entries(TIPOS).map(([valor, texto]) => ({ valor, texto }))} />
            <Campo name="fecha" type="date" etiqueta="Fecha del lanzamiento" required />
          </div>
        </Formulario>
      </Tarjeta>
      {archivadas.length > 0 && <Tabla titulo="Archivadas" columnas={columnas} filas={archivadas.map(fila)} />}
    </div>
  );
}

/** Panel · una campaña: el cronograma con sus estados y las piezas con su medida. */
export async function CampaniaPanel({ tenantId, slug, params }: PropsRutaPanel) {
  const [c, editar] = await Promise.all([leerCampania(tenantId, params.id), puedeEditar(slug)]);
  if (!c) notFound();
  const ahora = new Date();
  const activa = c.estado === "ACTIVA";
  const puede = editar && activa;
  const porClave = new Map(c.hitos.map((h) => [h.clave, h]));
  const estados = c.hitos.map((h) => estadoDeHito(h, ahora));
  const atrasados = estados.filter((e) => e === "atrasado").length;
  const faltan = Math.ceil((c.fecha.getTime() - ahora.getTime()) / 86_400_000);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Boton href={`/b/${slug}/lanzamientos`} variante="enlace">
          ← Lanzamientos
        </Boton>
      </div>
      <header>
        <h1 className="text-display-xs font-semibold text-primary">{c.titulo}</h1>
        <p className="mt-1 text-md text-tertiary">
          {TIPOS[c.tipo] ?? c.tipo} · sale el {DIA_LARGO.format(c.fecha)} · {ESTADOS[c.estado]}
          {activa && faltan >= 0 ? ` · faltan ${faltan} días` : ""}
        </p>
      </header>
      {c.estado === "CANCELADA" && (
        <Aviso tono="info" titulo="Campaña cancelada: queda archivada.">
          No se borró nada: el cronograma, las piezas y sus archivos siguen acá para consultar.
        </Aviso>
      )}
      {activa && atrasados > 0 && (
        <Aviso tono="error" titulo={`${atrasados} ${atrasados === 1 ? "hito atrasado" : "hitos atrasados"}.`} data-atrasados={atrasados}>
          {faltan < 30 ? "Con la fecha tan cerca, lo vencido se muestra igual (atrasado) para que lo resuelvas o lo marques hecho." : "Marcalos hechos o mové la fecha."}
        </Aviso>
      )}
      {activa && (
        <Tarjeta titulo="Mover la fecha" descripcion="Todos los hitos se corren lo mismo: las distancias entre ellos quedan.">
          <Formulario accion={moverFechaAccion.bind(null, slug, c.id)} puedeEditar={puede} etiqueta="Mover">
            <Campo name="fecha" type="date" etiqueta="Fecha nueva" defaultValue={diaArgentino(c.fecha)} required />
          </Formulario>
        </Tarjeta>
      )}
      <Tabla
        titulo="Cronograma"
        columnas={[
          { id: "estado", etiqueta: "" },
          { id: "hito", etiqueta: "Hito" },
          { id: "vence", etiqueta: "Para el" },
          { id: "accion", etiqueta: "" },
        ]}
        filas={c.hitos.map((h, i) => {
          const antes = h.dependeDe.map((k) => porClave.get(k)).filter((x): x is NonNullable<typeof x> => !!x);
          const esperando = antes.filter((x) => !x.hechoEn);
          return {
            id: h.id,
            celdas: [
              <span key="e" data-hito={h.clave} data-estado={estados[i]}>
                <Insignia color={INSIGNIA[estados[i]].color}>{INSIGNIA[estados[i]].texto}</Insignia>
              </span>,
              <div key="t">
                <div className="font-medium text-primary">{h.titulo}</div>
                {h.descripcion && <div className="text-sm text-tertiary">{h.descripcion}</div>}
                {antes.length > 0 && (
                  <div className="text-sm text-tertiary">
                    Después de: {antes.map((x) => x.titulo).join(", ")}
                    {esperando.length > 0 && !h.hechoEn ? ` (falta${esperando.length > 1 ? "n" : ""} ${esperando.length})` : ""}
                  </div>
                )}
              </div>,
              <span key="v" className="whitespace-nowrap tabular-nums">
                {DIA.format(h.vence)} ({h.dias === 0 ? "el día" : h.dias < 0 ? `${-h.dias} d antes` : `${h.dias} d después`})
              </span>,
              <Formulario
                key="a"
                accion={marcarHitoAccion.bind(null, slug, h.id, !h.hechoEn)}
                puedeEditar={puede}
                enLinea
                variante="secundario"
                etiqueta={h.hechoEn ? "Deshacer" : "Hecho"}
              />,
            ],
          };
        })}
      />
      <Tarjeta titulo="Piezas gráficas" descripcion="Una por formato, con la medida que pide cada plataforma. Si una no cumple, se guarda igual, marcada.">
        <ul className="grid gap-4 sm:grid-cols-2" data-piezas>
          {c.piezas.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 rounded-lg p-4 ring-1 ring-secondary ring-inset" data-pieza={p.formatoId} data-conforme={p.conforme === null ? "sin-subir" : String(p.conforme)}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-primary">
                  {p.plataforma} · {p.pieza}
                </span>
                <span className="text-sm text-tertiary tabular-nums">
                  {p.ancho}×{p.alto} px
                </span>
                {p.conforme === true && <Insignia color="exito">Cumple</Insignia>}
                {p.conforme === false && (
                  <Insignia color="advertencia">
                    No conforme ({p.anchoReal}×{p.altoReal})
                  </Insignia>
                )}
              </div>
              {p.archivoId && p.archivoNombre && (
                <a href={urlArchivo({ id: p.archivoId, nombre: p.archivoNombre }, { panelSlug: slug })} className="block w-40">
                  <img src={urlArchivo({ id: p.archivoId, nombre: p.archivoNombre }, { panelSlug: slug, variante: "web" })} alt={`${p.plataforma} · ${p.pieza}`} className="rounded" />
                </a>
              )}
              {activa && (
                <Formulario accion={subirPiezaAccion.bind(null, slug, p.id)} puedeEditar={puede} etiqueta={p.archivoId ? "Reemplazar" : "Subir"}>
                  <CampoArchivo name="archivo" etiqueta="Imagen (JPG, PNG o WebP)" accept="image/png,image/jpeg,image/webp" required />
                </Formulario>
              )}
            </li>
          ))}
        </ul>
      </Tarjeta>
      {activa && (
        <div className="grid gap-6 sm:grid-cols-2">
          <Tarjeta titulo="Terminar" descripcion="Cuando ya salió y cerraste el seguimiento.">
            <Formulario accion={terminarCampaniaAccion.bind(null, slug, c.id)} puedeEditar={puede} variante="secundario" etiqueta="Terminar la campaña" />
          </Tarjeta>
          <Tarjeta titulo="Cancelar" descripcion="Se archiva: no se borra nada.">
            <Formulario accion={cancelarCampaniaAccion.bind(null, slug, c.id)} puedeEditar={puede} variante="peligro" etiqueta="Cancelar la campaña">
              <Casilla name="confirmar" etiqueta="Confirmo cancelarla" />
            </Formulario>
          </Tarjeta>
        </div>
      )}
    </div>
  );
}
