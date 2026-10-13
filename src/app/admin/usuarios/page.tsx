import Link from "next/link";
import { Insignia, Tabla } from "@/ui";
import { exigirStaff } from "../_servidor/acceso";
import { listarUsuarios } from "../_servidor/usuarios";

export default async function Usuarios() {
  await exigirStaff();
  const usuarios = await listarUsuarios();
  return (
    <Tabla
      titulo="Usuarios"
      descripcion="Todas las personas con cuenta en Deoco y sus bandas. Para invitar o cambiar un rol, entrá a la banda."
      columnas={[
        { id: "persona", etiqueta: "Persona" },
        { id: "bandas", etiqueta: "Bandas y rol" },
        { id: "marcas", etiqueta: "" },
      ]}
      filas={usuarios.map((u) => ({
        id: u.id,
        celdas: [
          <div key="p" data-email={u.email}>
            <div className="font-medium text-primary">{u.nombre}</div>
            <div className="text-sm text-tertiary">{u.email}</div>
          </div>,
          <ul key="b" className="flex flex-wrap gap-2 text-sm">
            {u.membresias.length === 0 && <li className="text-tertiary">—</li>}
            {u.membresias.map((m) => (
              <li key={m.tenant.slug}>
                <Link href={`/admin/bandas/${m.tenant.slug}`} className="text-secondary hover:text-brand-secondary">
                  {m.tenant.nombre}
                </Link>{" "}
                <span className="text-tertiary">· {m.rol}</span>
              </li>
            ))}
          </ul>,
          <div key="m" className="flex gap-2">
            {u.esStaff && <Insignia color="marca">Staff</Insignia>}
            {u.claveTemporal && <Insignia color="advertencia">Clave temporal</Insignia>}
          </div>,
        ],
      }))}
    />
  );
}
