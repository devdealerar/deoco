import { miembrosDeBanda } from "@/nucleo/acceso/equipo";
import { accesoPanel } from "@/nucleo/acceso/panel";
import { modulosPrendidos } from "@/nucleo/modulos/encendido";
import { registro } from "@/nucleo/modulos";
import { invitacionesDeBanda } from "@/nucleo/acceso/invitaciones";
import { Campo, Casilla, Formulario, Insignia, Selector, Tabla, Tarjeta } from "@/ui";
import { MarcoPanel } from "../marco";
import { cambiarRolAccion, cancelarInvitacionAccion, dejarAccion, invitarAccion, pasarTitularidadAccion, quitarAccion } from "./acciones";

// Equipo de la banda (núcleo, 3.2 núcleo d6). Todos ven quién es parte; el titular (uno solo,
// registrado) saca gente, cambia roles, pasa la titularidad e invita (D7: un manager, un integrante).
export default async function Equipo({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const acceso = await accesoPanel(`/b/${slug}/equipo`);
  const miembros = await miembrosDeBanda(acceso.tenantId);
  const esTitular = acceso.rol === "TITULAR";
  const prendidos = await modulosPrendidos(acceso.tenantId);
  const roles = registro()
    .roles.filter((r) => r.clave !== "TITULAR" && (!r.moduloIds.length || r.moduloIds.some((m) => prendidos.has(m))))
    .map((r) => ({ valor: r.clave, texto: r.etiqueta }));
  const etiqueta = (rol: string) => registro().rol(rol)?.etiqueta ?? rol;
  const invitaciones = esTitular ? await invitacionesDeBanda(acceso.tenantId) : [];
  const FECHA = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });
  return (
    <MarcoPanel slug={slug} acceso={acceso}>
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-display-xs font-semibold text-primary">Equipo</h1>
          <p className="mt-1 text-md text-tertiary">
            Quién es parte de la banda y con qué rol. Un cambio vale desde el próximo movimiento de esa persona, aunque tenga el panel abierto. La banda
            tiene una sola persona titular: la que conserva el control de la cuenta, el cobro y el plan. Para sumar a alguien (tu manager, alguien de la
            banda), invitalo por email. Sacar a alguien le corta el acceso al instante, sin borrar nada de lo que hizo.
          </p>
        </header>
        <Tabla
          titulo="Personas"
          columnas={[
            { id: "persona", etiqueta: "Persona" },
            { id: "rol", etiqueta: "Rol" },
            { id: "acciones", etiqueta: "" },
          ]}
          filas={miembros.map((m) => {
            const yo = m.usuarioId === acceso.usuarioId;
            return {
              id: m.id,
              celdas: [
                <div key="p" data-miembro={m.email}>
                  <div className="font-medium text-primary">
                    {m.nombre} {yo && <span className="text-tertiary">(vos)</span>}
                  </div>
                  <div className="text-sm text-tertiary">{m.email}</div>
                </div>,
                esTitular && !yo ? (
                  <Formulario key="r" accion={cambiarRolAccion.bind(null, slug, m.id)} puedeEditar enLinea variante="secundario" etiqueta="Cambiar">
                    <Selector name="rol" etiqueta="Rol" defaultValue={m.rol} opciones={roles} />
                  </Formulario>
                ) : (
                  <Insignia key="r" color={m.rol === "TITULAR" ? "marca" : "gris"}>
                    {etiqueta(m.rol)}
                  </Insignia>
                ),
                esTitular && !yo ? (
                  <div key="a" className="flex flex-col gap-3">
                    <Formulario accion={pasarTitularidadAccion.bind(null, slug, m.id)} puedeEditar enLinea variante="secundario" etiqueta="Pasarle la titularidad">
                      <Casilla name="confirmar" etiqueta="Confirmo: yo quedo como gestor" />
                    </Formulario>
                    <Formulario accion={quitarAccion.bind(null, slug, m.id)} puedeEditar enLinea variante="secundario" etiqueta="Sacar de la banda">
                      <Casilla name="confirmar" etiqueta="Confirmo: pierde el acceso" />
                    </Formulario>
                  </div>
                ) : yo && !acceso.viaStaff && !esTitular ? (
                  <Formulario key="a" accion={dejarAccion.bind(null, slug)} puedeEditar enLinea variante="secundario" etiqueta="Dejar esta banda">
                    <Casilla name="confirmar" etiqueta="Confirmo: pierdo el acceso" />
                  </Formulario>
                ) : (
                  <span key="a" />
                ),
              ],
            };
          })}
        />
        {esTitular && (
          <Tarjeta titulo="Invitar a alguien" descripcion="Le llega un mail; acepta entrando a Deoco con su cuenta de ese email. Vence en 14 días.">
            <Formulario accion={invitarAccion.bind(null, slug)} puedeEditar etiqueta="Invitar" limpiarAlGuardar>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo name="email" type="email" etiqueta="Email" required />
                <Selector name="rol" etiqueta="Rol" defaultValue="GESTOR" opciones={roles} />
              </div>
            </Formulario>
            {invitaciones.length > 0 && (
              <ul className="flex flex-col gap-2" data-invitaciones>
                {invitaciones.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 text-sm" data-invitacion={i.email}>
                    <span className="text-primary">{i.email}</span>
                    <Insignia>{etiqueta(i.rol)}</Insignia>
                    <span className="text-tertiary">vence el {FECHA.format(i.vence)}</span>
                    <Formulario accion={cancelarInvitacionAccion.bind(null, slug, i.id)} puedeEditar enLinea variante="secundario" etiqueta="Cancelar" />
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        )}
      </div>
    </MarcoPanel>
  );
}
