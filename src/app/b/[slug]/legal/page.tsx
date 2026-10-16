import Link from "next/link";
import { exigirTitular } from "@/nucleo/acceso/panel";
import { aceptacionesDe, datosLegales, faltanDatos, pendientesDeAceptar, versionesLegales } from "@/nucleo/legal";
import { resumenDeConsentimientos } from "@/nucleo/legal/cookies";
import { DOCUMENTOS_DEOCO } from "@/nucleo/legal/textos";
import { AreaTexto, Aviso, Campo, Casilla, Formulario, Insignia, Tabla, Tarjeta } from "@/ui";
import { MarcoPanel } from "../marco";
import { aceptarAccion, guardarLegalAccion } from "./acciones";

const FECHA = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

// Legal (núcleo, solo el titular): los datos del responsable para la política y los términos del
// sitio, lo que la banda aceptó de Deoco (términos y contrato de encargo, con fecha y versión),
// las versiones publicadas y qué decidieron los visitantes sobre las cookies.
export default async function Legal({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const acceso = await exigirTitular(`/b/${slug}/legal`);
  const [d, pendientes, hechas, versiones, cookies] = await Promise.all([
    datosLegales(acceso.tenantId),
    pendientesDeAceptar(acceso.tenantId),
    aceptacionesDe(acceso.tenantId),
    versionesLegales(acceso.tenantId),
    resumenDeConsentimientos(acceso.tenantId),
  ]);
  return (
    <MarcoPanel slug={slug} acceso={acceso}>
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-display-xs font-semibold text-primary">Legal y privacidad</h1>
          <p className="mt-1 text-md text-tertiary">
            Tu banda es la responsable de los datos de sus fans; Deoco los trata por su cuenta. Con estos datos tu sitio muestra su política de privacidad
            y sus términos, el aviso de cookies y el canal para que un fan pida sus datos. Es un borrador técnico: conviene que lo mire un abogado.
          </p>
        </header>

        <Tarjeta titulo="Lo que aceptaste de Deoco" data-testid="aceptacion">
          {pendientes.length > 0 ? (
            <>
              <Aviso tono="advertencia" titulo="Falta que aceptes">
                {pendientes.map((p) => `${p.titulo} (versión ${p.version})`).join(" y ")}. Leelos antes de aceptar:{" "}
                <Link className="underline" href="/terminos" target="_blank">
                  términos
                </Link>{" "}
                ·{" "}
                <Link className="underline" href="/encargo" target="_blank">
                  contrato de encargo de tratamiento
                </Link>
                .
              </Aviso>
              <Formulario accion={aceptarAccion.bind(null, slug)} puedeEditar etiqueta="Aceptar">
                <Casilla name="acepto" etiqueta="Leí y acepto los términos del servicio y el contrato de encargo de tratamiento de datos" />
              </Formulario>
            </>
          ) : (
            <p className="text-sm text-secondary">Al día: aceptaste las versiones vigentes.</p>
          )}
          {hechas.length > 0 && (
            <ul className="mt-2 text-sm text-tertiary">
              {hechas.map((h) => (
                <li key={h.id}>
                  {DOCUMENTOS_DEOCO.find((x) => x.id === h.documento)?.titulo ?? h.documento} · versión {h.version} · {FECHA.format(h.aceptadoEn)}
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        <Tarjeta titulo="Quién responde por los datos" descripcion="Lo pide la Ley 25.326 (art. 6): identidad y domicilio del responsable, y dónde se ejercen los derechos.">
          {faltanDatos(d) && <Aviso tono="advertencia">Completá el responsable y el domicilio: tu política de privacidad los necesita.</Aviso>}
          <Formulario accion={guardarLegalAccion.bind(null, slug)} puedeEditar>
            <Campo name="responsable" etiqueta="Responsable (persona o razón social)" defaultValue={d.responsable} />
            <Campo name="domicilio" etiqueta="Domicilio" defaultValue={d.domicilio} />
            <Campo name="emailDatos" type="email" etiqueta="Email para datos personales (opcional)" ayuda="Si lo dejás vacío, los pedidos llegan por el formulario del sitio." defaultValue={d.emailDatos} />
            <AreaTexto name="extraPrivacidad" etiqueta="Algo más para la política de privacidad (opcional)" defaultValue={d.extraPrivacidad} />
            <AreaTexto name="extraTerminos" etiqueta="Algo más para los términos (opcional)" defaultValue={d.extraTerminos} />
          </Formulario>
        </Tarjeta>

        <Tabla
          titulo="Versiones publicadas en tu sitio"
          columnas={[
            { id: "texto", etiqueta: "Texto" },
            { id: "version", etiqueta: "Versión" },
            { id: "fecha", etiqueta: "Desde" },
          ]}
          filas={versiones.map((v) => ({
            id: v.id,
            celdas: [
              <span key="t">{v.tipo === "privacidad" ? "Política de privacidad" : "Términos"}</span>,
              <Insignia key="v">{`v${v.version}`}</Insignia>,
              <span key="f">{FECHA.format(v.publicadaEn)}</span>,
            ],
          }))}
        />

        <Tarjeta titulo="Cookies de tu sitio" descripcion="Hoy tu sitio usa solo cookies necesarias. El aviso igual pregunta por medición y publicidad, por si se suman: solo corren con un sí.">
          {cookies.length === 0 ? (
            <p className="text-sm text-tertiary">Todavía ningún visitante decidió.</p>
          ) : (
            <ul className="text-sm text-secondary">
              {cookies.map((x) => (
                <li key={`${x.analitica}${x.marketing}`}>
                  {x.analitica && x.marketing ? "Aceptaron todas" : !x.analitica && !x.marketing ? "Solo las necesarias" : `Medición: ${x.analitica ? "sí" : "no"}, publicidad: ${x.marketing ? "sí" : "no"}`}: {x.visitantes}
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>
    </MarcoPanel>
  );
}
