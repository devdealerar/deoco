import Link from "next/link";
import { Campo, Filtros, Formulario, Selector, Tabla } from "@/ui";
import { exigirStaff } from "../_servidor/acceso";
import { listarFallidos, nombresConFallidos } from "../_servidor/eventos";
import { type ParametrosUrl, pagina, texto } from "../_servidor/listado";
import { reprocesarAccion } from "./acciones";

const FECHA = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

/** Eventos fallidos: 50 por página, los más recientes primero. Filtro y página van en la URL. */
export default async function EventosFallidos({ searchParams }: { searchParams: Promise<ParametrosUrl> }) {
  await exigirStaff();
  const p = await searchParams;
  const filtro = { banda: texto(p, "banda") || undefined, nombre: texto(p, "evento") || undefined, pagina: pagina(p) };
  const [{ filas: eventos, ...paginacion }, nombres] = await Promise.all([listarFallidos(filtro), nombresConFallidos()]);
  return (
    <div className="flex flex-col gap-6">
      <Filtros>
        <Campo type="search" name="banda" etiqueta="Banda" placeholder="Nombre o slug" defaultValue={filtro.banda} />
        <Selector
          name="evento"
          etiqueta="Evento"
          defaultValue={filtro.nombre ?? ""}
          opciones={[{ valor: "", texto: "Todos" }, ...nombres.map((n) => ({ valor: n, texto: n }))]}
        />
      </Filtros>
      <Tabla
        titulo="Eventos fallidos"
        descripcion="De todas las bandas, los más recientes primero. Reprocesar vuelve a entregar el evento solo a los módulos que fallaron."
        paginacion={paginacion}
        columnas={[
          { id: "evento", etiqueta: "Evento" },
          { id: "banda", etiqueta: "Banda" },
          { id: "error", etiqueta: "Error" },
          { id: "accion", etiqueta: "" },
        ]}
        filas={eventos.map((e) => ({
          id: e.id,
          celdas: [
            <div key="e" data-evento={e.id}>
              <div className="font-medium text-primary">{e.nombre}</div>
              <div className="text-sm text-tertiary">
                {FECHA.format(e.fecha)} · {e.intentos} {e.intentos === 1 ? "intento" : "intentos"}
              </div>
            </div>,
            <Link key="b" href={`/admin/bandas/${e.tenant.slug}`} className="text-sm text-secondary hover:text-brand-secondary">
              {e.tenant.nombre}
            </Link>,
            <ul key="f" className="text-sm text-error-primary">
              {e.ultimosFallos.map((f) => (
                <li key={f.moduloId}>
                  <span className="font-medium">{f.moduloId}:</span> {f.error}
                </li>
              ))}
            </ul>,
            <Formulario key="a" puedeEditar enLinea variante="secundario" accion={reprocesarAccion.bind(null, e.tenantId, e.id)} etiqueta="Reprocesar" />,
          ],
        }))}
      />
    </div>
  );
}
