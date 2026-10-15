import Link from "next/link";
import { exigirTitular } from "@/nucleo/acceso/panel";
import { correoDeBanda, dominiosParaCorreo } from "@/nucleo/dominios/correo";
import { dominioDeEnvio } from "@/nucleo/dominios/envio";
import { Aviso, Campo, Casilla, Formulario, Insignia, Selector, Tarjeta } from "@/ui";
import { Registros } from "../../../_dominios/lista";
import { MarcoPanel } from "../marco";
import { configurarAccion, probarAccion, quitarAccion, verificarAccion } from "./acciones";

// Correo desde el dominio de la banda. Lo define el núcleo (no es de ningún módulo). Solo el titular.
export default async function Correo({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const acceso = await exigirTitular(`/b/${slug}/correo`);
  const [c, dominios] = await Promise.all([correoDeBanda(acceso.tenantId), dominiosParaCorreo(acceso.tenantId)]);
  const habilitado = Boolean(dominioDeEnvio());
  const enLinea = { puedeEditar: true, enLinea: true, variante: "secundario" as const };
  return (
    <MarcoPanel slug={slug} acceso={acceso}>
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-display-xs font-semibold text-primary">Correo</h1>
          <p className="mt-1 text-md text-tertiary">
            Los mails de la banda (compras, entradas, despachos) salen desde una dirección de tu dominio. Si el dominio está delegado en
            Deoco, lo que te escriban ahí te llega a la casilla que elijas.
          </p>
        </header>

        {!habilitado ? (
          <Aviso titulo="Todavía no está habilitado">El correo desde tu dominio todavía no está habilitado en Deoco. Escribinos y lo vemos.</Aviso>
        ) : dominios.length === 0 ? (
          <Aviso titulo="Primero, un dominio propio">
            Para mandar desde tu dominio, primero conectalo en{" "}
            <Link href={`/b/${slug}/dominios`} className="font-semibold underline">
              Dominios
            </Link>
            . Mientras tanto, tus mails salen desde Deoco con el nombre de la banda.
          </Aviso>
        ) : (
          <>
            {c && (
              <Tarjeta
                titulo={c.direccion}
                data-correo={c.estado}
                junto={
                  c.estado === "verificado" ? (
                    <Insignia color="exito">Lista</Insignia>
                  ) : c.estado === "fallido" ? (
                    <Insignia color="error">No se pudo verificar</Insignia>
                  ) : (
                    <Insignia color="advertencia">Verificando</Insignia>
                  )
                }
              >
                {c.estado === "verificado" && <p className="text-sm text-secondary">Tus mails salen desde {c.direccion}.</p>}
                {c.estado !== "verificado" && c.cargadosPorDeoco && (
                  <p className="text-sm text-secondary">
                    Ya cargamos los registros en tu dominio: falta que el servicio de correo los vea (suele tardar unos minutos). Lo revisamos
                    solos; mientras tanto tus mails salen desde Deoco.
                  </p>
                )}
                {c.estado !== "verificado" && !c.cargadosPorDeoco && (
                  <>
                    <p className="text-sm text-secondary">
                      Creá estos registros en el DNS de <strong>{c.dominio}</strong> (donde lo compraste) y tocá <strong>Verificar</strong>.
                      Mientras tanto tus mails salen desde Deoco.
                    </p>
                    <Registros registros={c.registros} />
                  </>
                )}

                <div data-recepcion={c.recepcion} className="text-sm text-secondary">
                  {c.recepcion === "activa" && (
                    <p>
                      Lo que llegue a <strong>{c.direccion}</strong> se reenvía a <strong>{c.reenvioA}</strong>. Cuando respondas desde ahí, le
                      respondés directo a quien te escribió.
                    </p>
                  )}
                  {c.recepcion === "propio" && (
                    <p>
                      Tu dominio ya tiene su propio correo (por ejemplo Gmail u Outlook): no lo tocamos. Para recibir lo que te escriban a{" "}
                      {c.direccion}, esa casilla tiene que existir ahí.
                    </p>
                  )}
                  {c.recepcion === "no" && (
                    <p>
                      Con el dominio conectado por CNAME no recibimos correo en él. Para recibir lo que te escriban a {c.direccion}, pasalo a
                      delegado en Dominios o creá esa casilla donde tengas tu correo.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-3">
                  {c.estado !== "verificado" && <Formulario {...enLinea} accion={verificarAccion.bind(null, slug)} etiqueta="Verificar" />}
                  {c.estado === "verificado" && (
                    // No en línea: el mensaje dice a dónde va a llegar.
                    <Formulario puedeEditar variante="secundario" accion={probarAccion.bind(null, slug)} etiqueta="Mandarme un mail de prueba" />
                  )}
                </div>
                <div className="border-t border-secondary pt-4" data-quitar-correo>
                  <Formulario {...enLinea} variante="peligro" accion={quitarAccion.bind(null, slug)} etiqueta="Dejar de usar mi dominio">
                    <Casilla name="confirmar" etiqueta="Confirmo: mis mails vuelven a salir desde Deoco" />
                  </Formulario>
                </div>
              </Tarjeta>
            )}

            <Tarjeta titulo={c ? "Cambiar la dirección" : "Tu dirección"} descripcion="Una sola dirección por banda.">
              <Formulario accion={configurarAccion.bind(null, slug)} puedeEditar etiqueta="Guardar">
                <Selector
                  name="dominio"
                  etiqueta="Dominio"
                  defaultValue={c?.dominioId ?? dominios[0].id}
                  opciones={dominios.map((d) => ({ valor: d.id, texto: d.dominio }))}
                />
                <Campo name="local" etiqueta="Dirección (lo que va antes de la @)" defaultValue={c?.direccion.split("@")[0] ?? "merch"} required />
                <Campo
                  name="reenvioA"
                  etiqueta="Lo que llegue, reenviarlo a"
                  type="email"
                  defaultValue={c?.reenvioA ?? ""}
                  ayuda="Solo con el dominio delegado y sin correo propio. Vacío: al email del titular."
                />
              </Formulario>
            </Tarjeta>
          </>
        )}
      </div>
    </MarcoPanel>
  );
}
