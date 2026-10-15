import type { DominioBanda, RegistroDns } from "@/nucleo/dominios";
import { Campo, Casilla, Copiable, type EstadoFormulario, Formulario, Insignia, Tarjeta } from "@/ui";

type Accion = (estado: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;

/**
 * Dominios de una banda: la usan el panel (titular) y el back office. Para cada dominio
 * propio sin verificar (o con un problema) muestra los registros DNS exactos, listos para
 * copiar; el estado (certificado, problema) es el que informó Cloudflare.
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
        <Tarjeta
          key={d.id}
          data-dominio={d.dominio}
          data-estado={d.estado}
          titulo={d.dominio}
          junto={
            <>
              {d.esPrincipal && <Insignia color="marca">Principal</Insignia>}
              {d.dePlataforma && <Insignia>Subdominio de Deoco</Insignia>}
              {d.via === "zona" && <Insignia>Delegado</Insignia>}
              {d.estado === "sin-verificar" && (
                <Insignia color="advertencia">{d.delegacion ? "Esperando los nameservers" : "Sin verificar"}</Insignia>
              )}
              {d.estado === "certificado" && <Insignia color="advertencia">Emitiendo el certificado</Insignia>}
              {d.estado === "listo" && <Insignia color="exito">Listo</Insignia>}
              {d.estado === "problema" && <Insignia color="error">Con un problema</Insignia>}
            </>
          }
          acciones={d.verificado && !d.esPrincipal && <Formulario {...enLinea} accion={principal(d.id)} etiqueta="Usar como principal" />}
        >
          {d.estado === "certificado" && !d.esPrincipal && (
            <p className="text-sm text-tertiary">
              Verificado: ya muestra el sitio y, mientras no sea el principal, redirige al principal. Cloudflare está
              emitiendo el certificado de <code>https://{d.dominio}</code> (suele tardar unos minutos); cuando esté, podés
              usarlo como principal.
            </p>
          )}
          {d.estado === "listo" && !d.esPrincipal && (
            <p className="text-sm text-tertiary">Listo para usar como principal. Mientras no lo sea, redirige al principal.</p>
          )}
          {d.esPrincipal && !d.dePlataforma && (
            <p className="text-sm text-tertiary">
              El subdominio de Deoco sigue andando y redirige acá. Para quitar este dominio, primero elegí otro como principal.
            </p>
          )}

          {d.problema && (
            <div data-problema className="flex flex-col gap-2">
              <p className="text-sm text-secondary">
                Desde el {d.problema.desde.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}:{" "}
                {d.problema.texto} El sitio sigue publicado, pero quien entra por este dominio puede no llegar.
                {d.registros && " Revisá que estos registros sigan en el DNS de tu dominio."} Cuando se corrija, este
                aviso se va solo (se revisa cada pocas horas).
              </p>
            </div>
          )}

          {d.delegacion && <Delegacion dominio={d.dominio} delegacion={d.delegacion} verificar={verificar(d.id)} />}

          {d.registros && (
            <>
              {!d.verificado && (
                <p className="text-sm text-secondary">
                  Creá estos dos registros en el DNS de <strong>{d.dominio}</strong> (donde compraste el dominio) y tocá{" "}
                  <strong>Verificar</strong>. Hasta entonces el dominio no muestra el sitio.
                </p>
              )}
              <Registros registros={d.registros} />
              {!d.verificado && (
                <p className="text-xs text-tertiary">
                  Algunos proveedores piden el nombre sin el dominio: la parte de adelante (por ejemplo <code>www</code>) para
                  el CNAME y <code>_deoco</code> o <code>_deoco.www</code> para el TXT. Si tu proveedor no acepta un CNAME en el
                  dominio sin www, usá <code>www.</code> adelante. Si tu DNS está en Cloudflare, dejá el CNAME en{" "}
                  <strong>solo DNS</strong> (nube gris). Los cambios de DNS pueden tardar desde minutos hasta unas horas.
                </p>
              )}
              {d.validacion.length > 0 && (
                <details className="text-sm text-secondary" data-validacion>
                  <summary className="cursor-pointer text-tertiary">¿Pasó más de un día y sigue sin verificar? Sumá también estos</summary>
                  <div className="mt-3">
                    <Registros registros={d.validacion} />
                  </div>
                </details>
              )}
              {!d.verificado && (
                <div>
                  <Formulario puedeEditar accion={verificar(d.id)} etiqueta="Verificar" />
                </div>
              )}
            </>
          )}

          {!d.dePlataforma && !d.esPrincipal && (
            <div className="border-t border-secondary pt-4" data-quitar>
              <Formulario {...enLinea} variante="peligro" accion={quitar(d.id)} etiqueta="Quitar dominio">
                <Casilla name="confirmar" etiqueta={`Confirmo quitar ${d.dominio}`} />
              </Formulario>
            </div>
          )}
        </Tarjeta>
      ))}

      <Tarjeta
        titulo="Delegar un dominio (recomendado)"
        descripcion="Deoco maneja su DNS: el sitio con y sin www y el certificado. Cambiás dos nameservers donde registraste el dominio; lo que ya tenga (por ejemplo tu correo) lo traemos. Sirve también para un .com.ar de NIC Argentina."
      >
        <div data-agregar="zona">
          <Formulario accion={agregar} puedeEditar etiqueta="Delegar dominio" limpiarAlGuardar>
            <input type="hidden" name="via" value="zona" />
            <Campo name="dominio" etiqueta="Dominio" placeholder="labanda.com" required />
          </Formulario>
        </div>
      </Tarjeta>

      <Tarjeta
        titulo="Conectar por CNAME"
        descripcion="Seguís manejando tu DNS: lo conectás con dos registros. Solo con www adelante (p. ej. www.labanda.com): el dominio sin www lo tenés que redirigir vos."
      >
        <div data-agregar="cname">
          <Formulario accion={agregar} puedeEditar etiqueta="Agregar dominio" limpiarAlGuardar>
            <input type="hidden" name="via" value="cname" />
            <Campo name="dominio" etiqueta="Dominio" placeholder="www.labanda.com" required />
          </Formulario>
        </div>
      </Tarjeta>
    </div>
  );
}

/** Un dominio delegado esperando que la banda cambie los nameservers. */
function Delegacion({ dominio, delegacion: g, verificar }: { dominio: string; delegacion: NonNullable<DominioBanda["delegacion"]>; verificar: Accion }) {
  if (g.acompanaA) {
    return (
      <p className="text-sm text-secondary">
        Se activa junto con <strong>{g.acompanaA}</strong>: cuando cambies sus nameservers, este anda solo y redirige al principal.
      </p>
    );
  }
  if (g.sinRegistrar || g.nameservers.length === 0) {
    return (
      <div className="flex flex-col gap-3" data-delegacion="sin-registrar">
        <p className="text-sm text-secondary">
          {g.sinRegistrar ? (
            <>
              <strong>{dominio}</strong> todavía no figura registrado.{" "}
              {g.nicAr ? (
                <>
                  Registralo en{" "}
                  <a href="https://nic.ar" target="_blank" rel="noreferrer" className="font-semibold underline">
                    NIC Argentina
                  </a>{" "}
                  (con tu CUIT y clave fiscal; el arancel se paga ahí).
                </>
              ) : (
                "Registralo donde quieras comprarlo."
              )}{" "}
              Cuando esté, tocá el botón y te mostramos los nameservers.
            </>
          ) : (
            "Estamos preparando el dominio en Cloudflare. Si en unos minutos no aparecen los nameservers, tocá el botón."
          )}
        </p>
        <div>
          <Formulario puedeEditar accion={verificar} etiqueta={g.sinRegistrar ? "Ya lo registré" : "Reintentar"} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4" data-delegacion="nameservers">
      <p className="text-sm text-secondary">
        {g.nicAr ? (
          <>
            En{" "}
            <a href="https://nic.ar" target="_blank" rel="noreferrer" className="font-semibold underline">
              nic.ar
            </a>
            , entrá a <strong>{dominio}</strong>, elegí <strong>Delegar</strong> y pegá estos dos nameservers:
          </>
        ) : (
          <>
            Donde registraste <strong>{dominio}</strong>, cambiá los nameservers por estos dos:
          </>
        )}
      </p>
      <div className="flex flex-col gap-2">
        {g.nameservers.map((ns, i) => (
          <Copiable key={ns} valor={ns} etiqueta={`nameserver ${i + 1}`} />
        ))}
      </div>
      {g.importados.length > 0 ? (
        <details className="text-sm text-secondary" data-importados>
          <summary className="cursor-pointer">
            Trajimos {g.importados.length === 1 ? "1 registro" : `${g.importados.length} registros`} de tu DNS actual (por ejemplo el correo): siguen andando
          </summary>
          <ul className="mt-2 flex flex-col gap-1 font-mono text-xs">
            {g.importados.map((r) => (
              <li key={`${r.tipo}-${r.nombre}-${r.valor}`}>
                {r.tipo} {r.nombre} → {r.valor}
              </li>
            ))}
          </ul>
          <p className="mt-2">Revisalos antes de cambiar los nameservers: si falta alguno, escribinos.</p>
        </details>
      ) : (
        <p className="text-sm text-tertiary">
          No encontramos otros registros en su DNS actual. Si usás correo con este dominio (Gmail, Outlook u otro), escribinos antes de cambiar los nameservers.
        </p>
      )}
      <p className="text-xs text-tertiary">
        El cambio puede tardar unas horas (a veces hasta un día). Lo revisamos solos cada pocos minutos: cuando se active, el dominio queda verificado y el
        sitio anda con y sin www. Hasta entonces, todo sigue como estaba.
      </p>
      <div>
        <Formulario puedeEditar accion={verificar} etiqueta="Ya cambié los nameservers" />
      </div>
    </div>
  );
}

/** Registros DNS exactos, listos para copiar. */
function Registros({ registros }: { registros: RegistroDns[] }) {
  return (
    <dl className="flex flex-col gap-4">
      {registros.map((r) => (
        <div key={`${r.tipo}-${r.nombre}`} data-registro={r.tipo} className="grid gap-2 rounded-lg p-4 ring-1 ring-secondary sm:grid-cols-[6rem_1fr]">
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
  );
}
