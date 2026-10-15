import Link from "next/link";
import { exigirTitular } from "@/nucleo/acceso/panel";
import { formatearPesos } from "@/nucleo/dinero";
import { ErrorDominio } from "@/nucleo/dominios";
import { buscarDominios, type Cotizacion, ventaHabilitada } from "@/nucleo/dominios/venta";
import { Aviso, Boton, Campo, Formulario, Insignia, Tabla } from "@/ui";
import { MarcoPanel } from "../../marco";
import { buscarAccion } from "./acciones";

// Comprar un dominio (D10), paso 1: buscar. Resultados por terminación a la venta, con el precio
// por año; el titular elige uno y sigue a "A nombre de quién".
export default async function Comprar({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string }> }) {
  const { slug } = await params;
  const acceso = await exigirTitular(`/b/${slug}/dominios/comprar`);
  const q = ((await searchParams).q ?? "").slice(0, 80);
  const puede = acceso.estado === "ACTIVO" || acceso.estado === "MOROSO";
  let resultados: Cotizacion[] = [];
  let error: string | null = null;
  if (q && puede && ventaHabilitada()) {
    try {
      resultados = await buscarDominios(acceso.tenantId, q);
    } catch (e) {
      if (!(e instanceof ErrorDominio)) throw e;
      error = e.message;
    }
  }
  return (
    <MarcoPanel slug={slug} acceso={acceso}>
      <div className="flex flex-col gap-6">
        <header>
          <Link href={`/b/${slug}/dominios`} className="text-sm font-semibold text-tertiary hover:text-secondary">
            ← Dominios
          </Link>
          <h1 className="mt-2 text-display-xs font-semibold text-primary">Comprar un dominio</h1>
          <p className="mt-1 text-md text-tertiary">
            Queda registrado a nombre de quien vos digas, no de Deoco. Deoco lo configura solo: sitio con y sin www, certificado y correo.
          </p>
        </header>
        {!ventaHabilitada() ? (
          <Aviso tono="info">La compra de dominios todavía no está habilitada. Podés usar uno que ya tengas desde Dominios.</Aviso>
        ) : !puede ? (
          <Aviso>Con el panel suspendido o archivado no se compran dominios nuevos. Los que ya tenés se siguen renovando y te los podés llevar.</Aviso>
        ) : (
          <>
            <div data-buscar-dominio>
              <Formulario puedeEditar accion={buscarAccion.bind(null, slug)} etiqueta="Buscar">
                <Campo name="q" etiqueta="¿Qué nombre querés?" placeholder="labanda" defaultValue={q} required />
              </Formulario>
            </div>
            {error && <Aviso tono="error">{error}</Aviso>}
            {resultados.length > 0 && (
              <Tabla
                titulo="Resultados"
                descripcion="Precio por año, en pesos. La renovación la pagás cuando vence: te avisamos antes."
                columnas={[
                  { id: "dominio", etiqueta: "Dominio" },
                  { id: "precio", etiqueta: "Precio por año" },
                  { id: "accion", etiqueta: "" },
                ]}
                filas={resultados.map((r) => ({
                  id: r.dominio,
                  celdas: [
                    <span key="d" className="font-medium text-primary" data-resultado={r.dominio}>
                      {r.dominio}
                    </span>,
                    <span key="p">{r.disponible && r.precio !== null ? formatearPesos(r.precio) : "—"}</span>,
                    !r.disponible ? (
                      <Insignia key="a">No disponible</Insignia>
                    ) : r.precio === null ? (
                      <Insignia key="a">No se vende en Deoco</Insignia>
                    ) : (
                      <Boton key="a" href={`/b/${slug}/dominios/comprar/${encodeURIComponent(r.dominio)}`}>
                        Elegir
                      </Boton>
                    ),
                  ],
                }))}
              />
            )}
            <p className="text-sm text-tertiary">
              ¿Ya tenés un dominio, o un .com.ar de NIC Argentina? Lo sumás desde <Link href={`/b/${slug}/dominios`} className="font-semibold underline">Dominios</Link>, sin comprar nada.
            </p>
          </>
        )}
      </div>
    </MarcoPanel>
  );
}
