import { leerComoStaff } from "@/nucleo/acceso/staff";
import type { PropsRutaAdmin } from "@/nucleo/modulos/contrato";
import { Campo, Formulario, Insignia, Tarjeta } from "@/ui";
import { accesosDeSello, sellos } from "../sellos";
import { crearSelloAccion, darAccesoAccion, quitarAccesoAccion } from "./acciones";

/** Back office · Sellos (plan Sello): quién entra al panel del manager. Las bandas lo suman ellas. */
export async function AdminSellos(_: PropsRutaAdmin) {
  const lista = await sellos();
  const accesos = await Promise.all(lista.map((s) => accesosDeSello(leerComoStaff, s.id)));
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-display-xs font-semibold text-primary">Sellos y managers</h1>
        <p className="mt-1 text-md text-tertiary">
          Quien tenga acceso entra al panel del manager (app/portal/manager). Ve las bandas que lo invitaron desde su Equipo, y de ellas solo
          números: nunca los datos de los fans. El plan Sello de cada banda se asigna en la ficha de la banda.
        </p>
      </header>
      {lista.map((s, i) => (
        <Tarjeta key={s.id} titulo={s.nombre} data-sello={s.nombre}>
          <ul className="flex flex-col gap-2">
            {accesos[i].map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3" data-acceso={c.email}>
                <span className="text-primary">{c.nombre}</span>
                <span className="text-sm text-tertiary">{c.email}</span>
                {c.claveTemporal && <Insignia color="advertencia">Clave temporal</Insignia>}
                <Formulario accion={quitarAccesoAccion.bind(null, c.id)} puedeEditar enLinea variante="peligro" etiqueta="Quitar acceso" />
              </li>
            ))}
          </ul>
          <Formulario accion={darAccesoAccion.bind(null, s.id)} puedeEditar etiqueta="Dar acceso" limpiarAlGuardar>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo name="email" type="email" etiqueta="Email" required />
              <Campo name="nombre" etiqueta="Nombre" ayuda="Solo si es un usuario nuevo." maxLength={120} />
            </div>
          </Formulario>
        </Tarjeta>
      ))}
      <Tarjeta titulo="Nuevo sello o representante">
        <Formulario accion={crearSelloAccion} puedeEditar etiqueta="Crear" limpiarAlGuardar>
          <Campo name="nombre" etiqueta="Nombre" required />
        </Formulario>
      </Tarjeta>
    </div>
  );
}
