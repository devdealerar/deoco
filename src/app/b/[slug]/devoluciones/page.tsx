import { exigirTitular } from "@/nucleo/acceso/panel";
import { formatearPesos } from "@/nucleo/dinero";
import { registro } from "@/nucleo/modulos";
import { pasarelaDe } from "@/nucleo/pagos";
import { pagosParaDevolver } from "@/nucleo/pagos/registro";
import { Aviso, Campo, Casilla, Formulario, Insignia, Tabla } from "@/ui";
import { MarcoPanel } from "../marco";
import { devolverAccion, marcarAccion } from "./acciones";

const MOTIVO: Record<string, string> = {
  duplicado: "Pagó dos veces",
  tardio: "Llegó tarde (ya estaba vencido o cancelado)",
  "no-coincide": "No coincide con lo que se cobraba",
};

const fecha = (d: Date) => d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" });

// Pagos para devolver (núcleo): pagos que entraron a la cuenta de la banda y no se entregan. La
// banda los devuelve desde acá (con SU cuenta: la plata va de la banda al comprador) o por su
// lado. Solo el titular; abierta en todos los estados de la banda.
export default async function Devoluciones({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const acceso = await exigirTitular(`/b/${slug}/devoluciones`);
  const filas = await pagosParaDevolver(acceso.tenantId);
  const pendientes = filas.filter((f) => !f.devueltoEn);
  const reg = registro();
  return (
    <MarcoPanel slug={slug} acceso={acceso}>
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-display-xs font-semibold text-primary">Pagos para devolver</h1>
          <p className="mt-1 text-md text-tertiary">
            Pagos que entraron a tu cuenta y no corresponden: el comprador pagó dos veces, pagó cuando lo que compraba ya había vencido, o pagó otro
            monto. Nada se entregó por ellos. La plata está en tu cuenta: devolverla es tuyo (Deoco no la toca).
          </p>
        </header>
        {pendientes.length === 0 && <Aviso tono="info">No tenés pagos para devolver.</Aviso>}
        <Tabla
          titulo="Pagos"
          columnas={[
            { id: "pago", etiqueta: "Pago" },
            { id: "motivo", etiqueta: "Motivo" },
            { id: "monto", etiqueta: "Monto" },
            { id: "estado", etiqueta: "" },
          ]}
          filas={filas.map((f) => ({
            id: f.id,
            celdas: [
              <div key="p" data-devolucion={f.cobroId}>
                <div className="font-medium text-primary">
                  {reg.modulo(f.moduloId)?.nombre ?? f.moduloId} · {pasarelaDe(f.pasarela)?.nombre ?? f.pasarela} {f.cobroId}
                </div>
                <div className="text-sm text-tertiary">{fecha(f.creadoEn)}</div>
              </div>,
              <div key="m" className="text-sm">
                <div className="text-secondary">{MOTIVO[f.motivo] ?? f.motivo}</div>
                {f.detalle && <div className="text-tertiary">{f.detalle}</div>}
              </div>,
              <span key="$">{formatearPesos(f.monto)}</span>,
              f.devueltoEn ? (
                <div key="e" className="flex flex-col gap-1">
                  <Insignia color="exito">Resuelto</Insignia>
                  <span className="text-xs text-tertiary">{f.nota}</span>
                </div>
              ) : (
                <div key="e" className="flex flex-col gap-3">
                  <Formulario accion={devolverAccion.bind(null, slug, f.id)} puedeEditar enLinea etiqueta="Devolver desde mi cuenta">
                    <Casilla name="confirmar" etiqueta="Confirmo: sale de mi cuenta" />
                  </Formulario>
                  <Formulario accion={marcarAccion.bind(null, slug, f.id)} puedeEditar enLinea variante="secundario" etiqueta="Ya lo resolví">
                    <Campo name="nota" etiqueta="Cómo" placeholder="Devuelto desde Mercado Pago el 3/11" />
                  </Formulario>
                  {pasarelaDe(f.pasarela) && <span className="text-xs text-tertiary">{pasarelaDe(f.pasarela)!.comoDevolver}</span>}
                </div>
              ),
            ],
          }))}
        />
      </div>
    </MarcoPanel>
  );
}
