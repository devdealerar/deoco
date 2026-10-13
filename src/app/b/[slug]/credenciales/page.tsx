import { exigirTitular } from "@/nucleo/acceso/panel";
import { secretosDeBanda } from "@/nucleo/secretos/carga";
import { Campo, Casilla, Formulario, Insignia, Tarjeta } from "@/ui";
import { MarcoPanel } from "../marco";
import { borrarAccion, guardarAccion } from "./acciones";

const fecha = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

// Credenciales de la banda para sus módulos (p. ej. la pasarela de cobro). Pantalla del
// núcleo: solo el titular, ni otro rol ni el staff. Nunca muestra un valor completo.
export default async function Credenciales({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const acceso = await exigirTitular(`/b/${slug}/credenciales`);
  const secretos = await secretosDeBanda(acceso.tenantId);
  return (
    <MarcoPanel slug={slug} acceso={acceso}>
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-display-xs font-semibold text-primary">Credenciales</h1>
          <p className="mt-1 text-md text-tertiary">
            Se guardan cifradas. Solo las ve el módulo que las usa: acá ni nadie de Deoco puede leerlas completas.
          </p>
        </header>
        {secretos.length === 0 && <p className="text-tertiary">Ningún módulo prendido necesita credenciales.</p>}
        {secretos.map((s) => (
          <div key={`${s.moduloId}/${s.clave}`} data-secreto={`${s.moduloId}/${s.clave}`}>
            <Tarjeta titulo={`${s.moduloNombre} · ${s.etiqueta}`} descripcion={s.ayuda}>
              <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-tertiary">
                {s.cargado ? (
                  <>
                    <Insignia color="exito">Cargada</Insignia>
                    {s.pista && <code data-pista>{s.pista}</code>}
                    {s.actualizadoEn && <span>· {fecha.format(s.actualizadoEn)}</span>}
                  </>
                ) : (
                  <Insignia color="advertencia">Sin cargar</Insignia>
                )}
              </div>
              <Formulario
                accion={guardarAccion.bind(null, slug, s.moduloId, s.clave)}
                puedeEditar
                etiqueta={s.cargado ? "Reemplazar" : "Guardar"}
                limpiarAlGuardar
              >
                <Campo
                  name="valor"
                  type="password"
                  autoComplete="off"
                  etiqueta={s.cargado ? "Nuevo valor" : "Valor"}
                  maxLength={4096}
                  required
                />
              </Formulario>
              {s.cargado && (
                <div className="mt-4 border-t border-secondary pt-4" data-borrar>
                  <Formulario
                    accion={borrarAccion.bind(null, slug, s.moduloId, s.clave)}
                    puedeEditar
                    enLinea
                    variante="peligro"
                    etiqueta="Borrar"
                  >
                    <Casilla name="confirmar" etiqueta="Confirmo borrarla" />
                  </Formulario>
                </div>
              )}
            </Tarjeta>
          </div>
        ))}
      </div>
    </MarcoPanel>
  );
}
