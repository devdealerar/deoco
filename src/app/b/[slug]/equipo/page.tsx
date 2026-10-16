import { miembrosDeBanda } from "@/nucleo/acceso/equipo";
import { accesoPanel } from "@/nucleo/acceso/panel";
import { modulosPrendidos } from "@/nucleo/modulos/encendido";
import { registro } from "@/nucleo/modulos";
import { Aviso, Casilla, Formulario, Insignia, Selector, Tabla } from "@/ui";
import { MarcoPanel } from "../marco";
import { cambiarRolAccion, dejarAccion, pasarTitularidadAccion, quitarAccion } from "./acciones";

// Equipo de la banda (núcleo, 3.2 núcleo d6). Todos ven quién es parte; el titular saca gente,
// cambia roles y pasa la titularidad. A otra persona titular no se la toca desde acá (Deoco no
// arbitra). Sumar gente lo hace el staff por ahora.
export default async function Equipo({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const acceso = await accesoPanel(`/b/${slug}/equipo`);
  const miembros = await miembrosDeBanda(acceso.tenantId);
  const esTitular = acceso.rol === "TITULAR";
  const prendidos = await modulosPrendidos(acceso.tenantId);
  const roles = registro()
    .roles.filter((r) => !r.moduloIds.length || r.moduloIds.some((m) => prendidos.has(m)))
    .map((r) => ({ valor: r.clave, texto: r.etiqueta }));
  const etiqueta = (rol: string) => registro().rol(rol)?.etiqueta ?? rol;
  return (
    <MarcoPanel slug={slug} acceso={acceso}>
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-display-xs font-semibold text-primary">Equipo</h1>
          <p className="mt-1 text-md text-tertiary">
            Quién es parte de la banda y con qué rol. Un cambio vale desde el próximo movimiento de esa persona, aunque tenga el panel abierto. La banda
            siempre tiene al menos una persona titular. Para sumar a alguien, escribinos.
          </p>
        </header>
        {esTitular && miembros.filter((m) => m.rol === "TITULAR").length > 1 && (
          <Aviso tono="info">Hay más de una persona titular: tienen el mismo control. Ninguna puede sacar a la otra desde acá; cada una deja la titularidad si quiere.</Aviso>
        )}
        <Tabla
          titulo="Personas"
          columnas={[
            { id: "persona", etiqueta: "Persona" },
            { id: "rol", etiqueta: "Rol" },
            { id: "acciones", etiqueta: "" },
          ]}
          filas={miembros.map((m) => {
            const yo = m.usuarioId === acceso.usuarioId;
            const otroTitular = m.rol === "TITULAR" && !yo;
            return {
              id: m.id,
              celdas: [
                <div key="p" data-miembro={m.email}>
                  <div className="font-medium text-primary">
                    {m.nombre} {yo && <span className="text-tertiary">(vos)</span>}
                  </div>
                  <div className="text-sm text-tertiary">{m.email}</div>
                </div>,
                esTitular && !otroTitular && !yo ? (
                  <Formulario key="r" accion={cambiarRolAccion.bind(null, slug, m.id)} puedeEditar enLinea variante="secundario" etiqueta="Cambiar">
                    <Selector name="rol" etiqueta="Rol" defaultValue={m.rol} opciones={roles} />
                  </Formulario>
                ) : (
                  <Insignia key="r" color={m.rol === "TITULAR" ? "marca" : "gris"}>
                    {etiqueta(m.rol)}
                  </Insignia>
                ),
                esTitular && !yo && !otroTitular ? (
                  <div key="a" className="flex flex-col gap-3">
                    <Formulario accion={pasarTitularidadAccion.bind(null, slug, m.id)} puedeEditar enLinea variante="secundario" etiqueta="Pasarle la titularidad">
                      <Casilla name="confirmar" etiqueta="Confirmo: yo quedo como editor" />
                    </Formulario>
                    <Formulario accion={quitarAccion.bind(null, slug, m.id)} puedeEditar enLinea variante="secundario" etiqueta="Sacar de la banda">
                      <Casilla name="confirmar" etiqueta="Confirmo: pierde el acceso" />
                    </Formulario>
                  </div>
                ) : yo && !acceso.viaStaff ? (
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
      </div>
    </MarcoPanel>
  );
}
