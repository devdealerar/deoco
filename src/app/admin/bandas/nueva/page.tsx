import Link from "next/link";
import { dominioRaiz } from "@/nucleo/tenant/hosts";
import { Campo, Formulario, Tarjeta } from "@/ui";
import { exigirStaff } from "../../_servidor/acceso";
import { crearBanda } from "./acciones";

export default async function NuevaBanda() {
  await exigirStaff();
  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin" className="text-sm font-semibold text-tertiary hover:text-secondary">
        ← Bandas
      </Link>
      <Tarjeta titulo="Nueva banda" descripcion="Con esto la banda ya existe y su titular entra a su panel.">
        <Formulario accion={crearBanda} puedeEditar etiqueta="Crear banda" limpiarAlGuardar>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo name="nombre" etiqueta="Nombre de la banda" required maxLength={80} />
            <Campo name="slug" etiqueta="Slug" required maxLength={40} ayuda="Panel en /b/<slug>. Minúsculas, números y guiones." />
          </div>
          <Campo name="subdominio" etiqueta="Subdominio" maxLength={40} ayuda={`Quedará <subdominio>.${dominioRaiz()}. Vacío: el slug.`} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo name="titularEmail" type="email" etiqueta="Email del titular" required />
            <Campo name="titularNombre" etiqueta="Nombre del titular" maxLength={120} ayuda="Solo si es un usuario nuevo." />
          </div>
        </Formulario>
      </Tarjeta>
    </div>
  );
}
