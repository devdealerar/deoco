import Link from "next/link";
import { Campo, Filtros, Tabla } from "@/ui";
import { exigirStaff } from "../_servidor/acceso";
import { listarAuditoria } from "../_servidor/auditoria";
import { type ParametrosUrl, pagina, texto } from "../_servidor/listado";

const FECHA = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" });

/** Auditoría (registro de actividad) de toda la plataforma: solo se agrega, nadie la cambia ni la borra. */
export default async function Auditoria({ searchParams }: { searchParams: Promise<ParametrosUrl> }) {
  await exigirStaff();
  const p = await searchParams;
  const filtro = { banda: texto(p, "banda") || undefined, accion: texto(p, "accion") || undefined, quien: texto(p, "quien") || undefined, pagina: pagina(p) };
  const { filas, ...paginacion } = await listarAuditoria(filtro);
  return (
    <div className="flex flex-col gap-6">
      <Filtros>
        <Campo name="banda" etiqueta="Banda (slug)" defaultValue={filtro.banda} />
        <Campo name="accion" etiqueta="Acción (empieza con)" placeholder="membresia." defaultValue={filtro.accion} />
        <Campo type="search" name="quien" etiqueta="Quién (email)" defaultValue={filtro.quien} />
      </Filtros>
      <Tabla
        titulo="Auditoría"
        descripcion="Todo lo que se hizo en Deoco: del staff, de las bandas y de la plataforma sola. Solo se agrega: no se puede cambiar ni borrar."
        paginacion={paginacion}
        columnas={[
          { id: "fecha", etiqueta: "Cuándo" },
          { id: "quien", etiqueta: "Quién" },
          { id: "banda", etiqueta: "Banda" },
          { id: "accion", etiqueta: "Acción" },
          { id: "detalle", etiqueta: "Detalle" },
        ]}
        filas={filas.map((f) => ({
          id: f.id,
          celdas: [
            <span key="f" className="text-sm whitespace-nowrap text-tertiary">{FECHA.format(f.fecha)}</span>,
            <span key="q" className="text-sm">{f.quien ?? "Deoco (automático)"}</span>,
            f.banda ? (
              <Link key="b" href={`/admin/bandas/${f.banda.slug}`} className="text-sm text-secondary hover:text-brand-secondary">{f.banda.nombre}</Link>
            ) : (
              <span key="b" className="text-sm text-tertiary">—</span>
            ),
            <code key="a" className="text-sm" data-accion={f.accion}>{f.accion}</code>,
            <code key="d" className="block max-w-md truncate text-xs text-tertiary" title={JSON.stringify(f.detalle)}>{JSON.stringify(f.detalle)}</code>,
          ],
        }))}
      />
    </div>
  );
}
