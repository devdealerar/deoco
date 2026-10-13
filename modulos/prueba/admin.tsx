import type { PropsRutaAdmin } from "@/nucleo/modulos/contrato";
import { Formulario, Tarjeta } from "@/ui";
import { probarStaff } from "./acciones-admin";

/** Pantalla de ejemplo en el back office (rutasAdmin): solo staff, en /admin/m/prueba. */
export function AdminPrueba({ usuarioId }: PropsRutaAdmin) {
  return (
    <Tarjeta titulo="Módulo de prueba · back office" descripcion="Una pantalla que aporta un módulo al back office.">
      <p data-testid="admin-prueba" data-usuario={usuarioId} className="mb-4 text-sm text-tertiary">
        Lo que se escribe desde acá pasa por conStaff() y queda en la auditoría.
      </p>
      <Formulario accion={probarStaff} puedeEditar etiqueta="Probar conStaff" />
    </Tarjeta>
  );
}
