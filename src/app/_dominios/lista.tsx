import type { DominioBanda } from "@/nucleo/dominios";
import { Campo, Casilla, Copiable, type EstadoFormulario, Formulario, Insignia, Tarjeta } from "@/ui";

type Accion = (estado: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;

/**
 * Dominios de una banda: la usan el panel (titular) y el back office. Para cada dominio
 * propio sin verificar muestra los registros DNS exactos, listos para copiar.
 */
export function ListaDominios({
  dominios,
  verificar,
  principal,
  quitar,
  agregar,
}: {
  dominios: DominioBanda[];
  verificar: (dominioId: string) => Accion;
  principal: (dominioId: string) => Accion;
  quitar: (dominioId: string) => Accion;
  agregar: Accion;
}) {
  const enLinea = { puedeEditar: true, enLinea: true, variante: "secundario" as const };
  return (
    <div className="flex flex-col gap-6">
      {dominios.map((d) => (
        <section
          key={d.id}
          data-dominio={d.dominio}
          className="flex flex-col gap-4 rounded-xl bg-primary p-6 shadow-xs ring-1 ring-secondary ring-inset"
        >
          <header className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold break-all text-primary">{d.dominio}</h2>
            {d.esPrincipal && <Insignia color="marca">Principal</Insignia>}
            {d.dePlataforma && <Insignia>Subdominio de Deoco</Insignia>}
            {d.noApunta ? (
              <Insignia color="error">No apunta a Deoco</Insignia>
            ) : d.verificado ? (
              !d.dePlataforma && <Insignia color="exito">Verificado</Insignia>
            ) : (
              <Insignia color="advertencia">Sin verificar</Insignia>
            )}
            <div className="ml-auto">
              {d.verificado && !d.esPrincipal && (
                <Formulario {...enLinea} accion={principal(d.id)} etiqueta="Usar como principal" />
              )}
            </div>
          </header>

          {d.verificado && !d.esPrincipal && (
            <p className="text-sm text-tertiary">
              Mientras no sea el principal, redirige al principal. Usalo como principal cuando{" "}
              <code>https://{d.dominio}</code> abra con candado (el certificado lo activa Deoco en el servidor).
            </p>
          )}
          {d.esPrincipal && !d.dePlataforma && (
            <p className="text-sm text-tertiary">
              El subdominio de Deoco sigue andando y redirige acá. Para quitar este dominio, primero elegí otro como principal.
            </p>
          )}

          {d.noApunta && (
            <div data-no-apunta className="flex flex-col gap-2">
              <p className="text-sm text-secondary">
                Desde el {d.noApunta.desde.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}{" "}
                este dominio no apunta al servidor de Deoco: quien entra por acá no llega al sitio. El sitio sigue
                publicado. Corregí el registro A; cuando apunte de nuevo, este aviso se va solo (se revisa cada pocas horas).
              </p>
              <div className="grid items-center gap-1 sm:grid-cols-[6rem_1fr]">
                <span className="text-xs text-tertiary">A · {d.noApunta.registroA.nombre}</span>
                <Copiable valor={d.noApunta.registroA.valor} etiqueta="valor del registro A" />
              </div>
            </div>
          )}

          {d.registros && (
            <>
              <p className="text-sm text-secondary">
                Creá estos dos registros en el DNS de <strong>{d.dominio}</strong> (donde compraste el dominio o en
                Cloudflare) y tocá <strong>Verificar</strong>. Hasta entonces el dominio no muestra el sitio. Si
                usás Cloudflare, el registro A va en <strong>solo DNS</strong> (nube gris).
              </p>
              <dl className="flex flex-col gap-4">
                {d.registros.map((r) => (
                  <div key={r.tipo} data-registro={r.tipo} className="grid gap-2 rounded-lg p-4 ring-1 ring-secondary sm:grid-cols-[6rem_1fr]">
                    <dt className="text-sm font-semibold text-primary">
                      {r.tipo}
                      <span className="block text-xs font-normal text-tertiary">{r.para}</span>
                    </dt>
                    <dd className="flex flex-col gap-2">
                      <div className="grid items-center gap-1 sm:grid-cols-[4rem_1fr]">
                        <span className="text-xs text-tertiary">Nombre</span>
                        <Copiable valor={r.nombre} etiqueta={`nombre del registro ${r.tipo}`} />
                      </div>
                      <div className="grid items-center gap-1 sm:grid-cols-[4rem_1fr]">
                        <span className="text-xs text-tertiary">Valor</span>
                        <Copiable valor={r.valor} etiqueta={`valor del registro ${r.tipo}`} />
                      </div>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-tertiary">
                Algunos proveedores piden el nombre sin el dominio: <code>@</code> para el A y <code>_deoco</code> para
                el TXT. Los cambios de DNS pueden tardar desde minutos hasta unas horas.
              </p>
              <div>
                <Formulario puedeEditar accion={verificar(d.id)} etiqueta="Verificar" />
              </div>
            </>
          )}

          {!d.dePlataforma && !d.esPrincipal && (
            <div className="border-t border-secondary pt-4" data-quitar>
              <Formulario {...enLinea} variante="peligro" accion={quitar(d.id)} etiqueta="Quitar dominio">
                <Casilla name="confirmar" etiqueta={`Confirmo quitar ${d.dominio}`} />
              </Formulario>
            </div>
          )}
        </section>
      ))}

      <Tarjeta titulo="Agregar dominio propio" descripcion="Un dominio que ya tenga la banda, p. ej. labanda.com o www.labanda.com.">
        <Formulario accion={agregar} puedeEditar etiqueta="Agregar dominio" limpiarAlGuardar>
          <Campo name="dominio" etiqueta="Dominio" placeholder="labanda.com" required />
        </Formulario>
      </Tarjeta>
    </div>
  );
}
