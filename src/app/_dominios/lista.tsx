import type { DominioBanda, RegistroDns } from "@/nucleo/dominios";
import { enFormatoBind } from "@/nucleo/dominios/bind";
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
  delegar,
  llevarse,
  quedarse,
}: {
  dominios: DominioBanda[];
  verificar: (dominioId: string) => Accion;
  principal: (dominioId: string) => Accion;
  quitar: (dominioId: string) => Accion;
  agregar: Accion;
  delegar: (dominioId: string) => Accion;
  llevarse: (dominioId: string) => Accion;
  quedarse: (dominioId: string) => Accion;
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
              {d.delegacion?.migrando && <Insignia>Pasando a delegado</Insignia>}
              {d.salida && <Insignia color="advertencia">Te estás llevando el DNS</Insignia>}
              {d.estado === "sin-verificar" && (
                <Insignia color="advertencia">{d.delegacion ? "Esperando los nameservers" : "Sin verificar"}</Insignia>
              )}
              {d.estado === "certificado" && <Insignia color="advertencia">Emitiendo el certificado</Insignia>}
              {d.estado === "listo" && <Insignia color="exito">Listo</Insignia>}
              {d.estado === "problema" && <Insignia color="error">Con un problema</Insignia>}
            </>
          }
          acciones={
            // El dominio del que se está llevando el DNS deja de llegar a Deoco: no se ofrece como principal.
            d.verificado && !d.esPrincipal && !(d.salida && !d.salida.acompanaA) && <Formulario {...enLinea} accion={principal(d.id)} etiqueta="Usar como principal" />
          }
        >
          {d.estado === "certificado" && !d.esPrincipal && (
            <p className="text-sm text-tertiary">
              Verificado: ya muestra el sitio y, mientras no sea el principal, redirige al principal. Cloudflare está
              emitiendo el certificado de <code>https://{d.dominio}</code> (suele tardar unos minutos); cuando esté, podés
              usarlo como principal.
            </p>
          )}
          {d.estado === "listo" && !d.esPrincipal && !d.salida && (
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

          {d.via === "cname" && !d.delegacion && (
            <div className="flex flex-col gap-2 rounded-lg p-4 ring-1 ring-secondary" data-pasar-a-delegado>
              <p className="text-sm text-secondary">
                <strong>Pasarme a delegar:</strong> Deoco maneja el DNS y el sitio anda también sin www. Preparamos todo antes
                (con lo que ya tiene tu DNS, por ejemplo el correo) y mientras cambiás los nameservers este dominio sigue
                andando por CNAME: no se corta.
              </p>
              <div>
                <Formulario {...enLinea} accion={delegar(d.id)} etiqueta="Pasarme a delegar" />
              </div>
            </div>
          )}

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

          {d.salida && !d.salida.acompanaA && <Salida dominio={d.dominio} salida={d.salida} quedarse={quedarse(d.id)} />}
          {d.salida?.acompanaA && (
            <p className="text-sm text-secondary">
              Va con <strong>{d.salida.acompanaA}</strong>: {d.salida.seguirConSitio ? "cuando cambies los nameservers, sigue en Deoco por CNAME." : "cuando cambies los nameservers, deja de llegar a Deoco."}
            </p>
          )}

          {d.via === "zona" && d.verificado && !d.salida && !d.dominio.startsWith("www.") && (
            <details className="text-sm text-secondary" data-como-me-lo-llevo>
              <summary className="cursor-pointer font-semibold">Cómo me lo llevo</summary>
              <div className="mt-3 flex flex-col gap-3">
                <p>
                  El dominio es tuyo y sigue registrado donde lo compraste. Para llevarte el DNS: te damos la lista de registros para tu
                  proveedor nuevo y cambiás los nameservers. No se corta nada: hasta que los cambies, todo sigue andando por Deoco.
                </p>
                <p>
                  Si querés seguir con el sitio en Deoco, queda en <strong>www.{d.dominio}</strong> (por un CNAME que va en la lista) y lo
                  preparamos antes, así no se corta. El dominio sin www lo redirigís vos a www en tu proveedor.
                </p>
                <div>
                  <Formulario {...enLinea} accion={llevarse(d.id)} etiqueta="Llevarme el DNS">
                    <Casilla name="seguirConSitio" etiqueta={`Seguir con el sitio en Deoco (www.${d.dominio})`} marcada />
                  </Formulario>
                </div>
              </div>
            </details>
          )}
          {d.via === "cname" && d.verificado && !d.delegacion && (
            <details className="text-sm text-secondary" data-como-me-lo-llevo>
              <summary className="cursor-pointer font-semibold">Cómo me lo llevo</summary>
              <p className="mt-3">
                Tu DNS ya es tuyo: Deoco no maneja nada de este dominio. Para dejar de usarlo en Deoco, borrá el CNAME y el TXT de tu DNS y
                quitalo acá{d.esPrincipal ? " (como es el principal, primero elegí otro)" : ""}.
              </p>
            </details>
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

const FECHA: Intl.DateTimeFormatOptions = { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "long" };

/** Un dominio delegado esperando que la banda cambie los nameservers. */
function Delegacion({ dominio, delegacion: g, verificar }: { dominio: string; delegacion: NonNullable<DominioBanda["delegacion"]>; verificar: Accion }) {
  if (g.acompanaA) {
    return (
      <p className="text-sm text-secondary">
        {g.migrando ? "Se pasa a delegado" : "Se activa"} junto con <strong>{g.acompanaA}</strong>: cuando cambies sus nameservers, este anda
        solo{g.migrando ? ". Mientras tanto sigue andando por CNAME, como hasta ahora" : " y redirige al principal"}.
      </p>
    );
  }
  const vence = (
    <p className="text-xs text-tertiary" data-vence>
      Si no cambiás los nameservers antes del {g.vence.toLocaleDateString("es-AR", FECHA)}, el pedido vence y {g.migrando ? "todo queda como estaba" : "se libera"} (lo
      podés volver a pedir).
    </p>
  );
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
        {vence}
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
      {vence}
      <div>
        <Formulario puedeEditar accion={verificar} etiqueta="Ya cambié los nameservers" />
      </div>
    </div>
  );
}

/** Un delegado del que la banda se está llevando el DNS: qué cargar, qué cambiar, hasta cuándo. */
function Salida({ dominio, salida: s, quedarse }: { dominio: string; salida: NonNullable<DominioBanda["salida"]>; quedarse: Accion }) {
  const nicAr = /\.ar$/.test(dominio);
  return (
    <div className="flex flex-col gap-4" data-salida>
      <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm text-secondary">
        <li>
          Cargá estos registros en tu proveedor de DNS nuevo
          {s.seguirConSitio ? " (el CNAME de www es el que mantiene el sitio en Deoco)" : ""}:
          <div className="mt-3">
            <Registros registros={s.registros} />
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-tertiary">Los mismos, en formato de archivo de zona (para importar)</summary>
            <Copiable valor={enFormatoBind(s.registros)} etiqueta="archivo de zona" />
          </details>
        </li>
        {s.seguirConSitio && (
          <li>
            En tu proveedor, redirigí <strong>{dominio}</strong> a <strong>https://www.{dominio}</strong> (muchos lo llaman &quot;redirección&quot;
            o &quot;forwarding&quot;): el dominio sin www no puede ir por CNAME.
          </li>
        )}
        {s.pierdeRecepcion && (
          <li>
            El reenvío de <strong>{s.pierdeRecepcion}</strong> deja de andar cuando cambies los nameservers. Antes, creá esa casilla donde
            vayas a tener tu correo. El envío desde esa dirección sigue (sus registros están en la lista).
          </li>
        )}
        <li>
          Cambiá los nameservers {nicAr ? "en nic.ar (Delegar)" : "donde registraste el dominio"} por los de tu proveedor nuevo.
        </li>
      </ol>
      <p className="text-xs text-tertiary">
        Lo revisamos solos: cuando los nameservers cambien, damos de baja el DNS en Deoco
        {s.seguirConSitio ? ` y el sitio sigue en www.${dominio}` : " y el sitio queda en tu subdominio de Deoco"}. Si el{" "}
        {s.bajaEn.toLocaleDateString("es-AR", FECHA)} todavía no cambiaron, lo damos de baja igual (te avisamos una semana antes).
      </p>
      <div>
        <Formulario puedeEditar variante="secundario" accion={quedarse} etiqueta="Me quedo en Deoco" />
      </div>
    </div>
  );
}

/** Registros DNS exactos, listos para copiar. */
export function Registros({ registros }: { registros: RegistroDns[] }) {
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
