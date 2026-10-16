import { exigirTitular } from "@/nucleo/acceso/panel";
import { formatearBytes } from "@/nucleo/archivos";
import { DIAS_DISPONIBLE, exportacionesDe } from "@/nucleo/exportacion";
import { Aviso, Formulario, Insignia, Tabla } from "@/ui";
import { MarcoPanel } from "../marco";
import { pedirExportacionAccion } from "./acciones";

const FECHA = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });
const ESTADO = {
  pendiente: { texto: "En cola", color: "gris" },
  armando: { texto: "Armándose", color: "advertencia" },
  lista: { texto: "Lista", color: "exito" },
  fallida: { texto: "No se pudo armar", color: "error" },
  vencida: { texto: "Vencida", color: "gris" },
} as const;

// Exportar todo (núcleo, td3): los datos de la banda en un zip, sin trámite. Solo el titular;
// abierta en todos los estados, también suspendida o archivada.
export default async function Exportar({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const acceso = await exigirTitular(`/b/${slug}/exportar`);
  const lista = await exportacionesDe(acceso.tenantId);
  const ahora = new Date();
  return (
    <MarcoPanel slug={slug} acceso={acceso}>
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-display-xs font-semibold text-primary">Exportar todo</h1>
          <p className="mt-1 text-md text-tertiary">
            Los datos son de tu banda. Te armamos un archivo .zip con todo lo que Deoco guarda de ella: una planilla (CSV) y un JSON por cada tabla —
            pedidos, compradores, entradas, productos, el sitio, la actividad— y los archivos originales que subiste. Cuando está listo te avisamos por
            mail; lo bajás desde acá durante {DIAS_DISPONIBLE} días. Podés pedirla las veces que quieras, también si dejás de usar Deoco.
          </p>
        </header>
        <Formulario accion={pedirExportacionAccion.bind(null, slug)} puedeEditar enLinea etiqueta="Exportar todo" />
        {lista.length === 0 ? (
          <Aviso tono="info">Todavía no pediste ninguna.</Aviso>
        ) : (
          <Tabla
            titulo="Tus exportaciones"
            columnas={[
              { id: "fecha", etiqueta: "Pedida" },
              { id: "estado", etiqueta: "Estado" },
              { id: "bajar", etiqueta: "" },
            ]}
            filas={lista.map((e) => ({
              id: e.id,
              celdas: [
                <span key="f" data-exportacion={e.id}>
                  {FECHA.format(e.creadoEn)}
                </span>,
                <div key="e" className="flex flex-col gap-1">
                  <Insignia color={ESTADO[e.estado as keyof typeof ESTADO]?.color ?? "gris"}>{ESTADO[e.estado as keyof typeof ESTADO]?.texto ?? e.estado}</Insignia>
                  {e.estado === "lista" && (
                    <span className="text-xs text-tertiary">
                      {e.tablas} tablas, {e.archivos} archivos{e.bytes ? `, ${formatearBytes(e.bytes)}` : ""}
                    </span>
                  )}
                  {e.estado === "fallida" && <span className="text-xs text-error-primary">Pedila de nuevo; si vuelve a fallar, escribinos.</span>}
                </div>,
                e.estado === "lista" && e.venceEn && e.venceEn > ahora ? (
                  <a key="b" className="text-sm font-semibold text-brand-secondary underline" href={`/b/${slug}/exportar/${e.id}/descargar`} data-bajar>
                    Bajar (hasta el {FECHA.format(e.venceEn)})
                  </a>
                ) : (
                  <span key="b" />
                ),
              ],
            }))}
          />
        )}
      </div>
    </MarcoPanel>
  );
}
