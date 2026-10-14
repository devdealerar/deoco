import Link from "next/link";
import { Campo, Casilla, Filtros, Insignia, Tabla } from "@/ui";
import { exigirStaff } from "../_servidor/acceso";
import { type ParametrosUrl, orden, pagina, texto } from "../_servidor/listado";
import { ORDENES_USUARIO, listarUsuarios } from "../_servidor/usuarios";

const FECHA = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" });

/** Usuarios: 50 por página, los más nuevos primero. Filtro, orden y página van en la URL. */
export default async function Usuarios({ searchParams }: { searchParams: Promise<ParametrosUrl> }) {
  await exigirStaff();
  const p = await searchParams;
  const filtro = {
    buscar: texto(p, "q") || undefined,
    soloStaff: texto(p, "staff") === "on",
    orden: orden(p, ORDENES_USUARIO, { columna: "alta", direccion: "desc" }),
    pagina: pagina(p),
  };
  const { filas: usuarios, ...paginacion } = await listarUsuarios(filtro);
  return (
    <div className="flex flex-col gap-6">
      <Filtros>
        <Campo type="search" name="q" etiqueta="Buscar" placeholder="Nombre o email" defaultValue={filtro.buscar} />
        <div className="pb-2.5">
          <Casilla name="staff" etiqueta="Solo staff" marcada={filtro.soloStaff} />
        </div>
      </Filtros>
      <Tabla
        titulo="Usuarios"
        descripcion="Todas las personas con cuenta en Deoco y sus bandas. Para invitar o cambiar un rol, entrá a la banda."
        orden={filtro.orden}
        paginacion={paginacion}
        columnas={[
          { id: "nombre", etiqueta: "Persona", ordenable: true },
          { id: "bandas", etiqueta: "Bandas y rol" },
          { id: "marcas", etiqueta: "" },
          { id: "alta", etiqueta: "Alta", ordenable: true },
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
            <span key="alta" className="text-sm whitespace-nowrap text-tertiary">
              {FECHA.format(u.creadoEn)}
            </span>,
          ],
        }))}
      />
    </div>
  );
}
