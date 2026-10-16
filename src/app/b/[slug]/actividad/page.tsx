import { exigirTitular } from "@/nucleo/acceso/panel";
import { actividadDeBanda } from "@/nucleo/actividad";
import { Campo, Filtros, Tabla } from "@/ui";
import { MarcoPanel } from "../marco";

const FECHA = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

// Actividad de la banda (núcleo, solo el titular): quién hizo qué y cuándo en su cuenta,
// también lo que hizo Deoco sola y los accesos del equipo de Deoco. Solo se agrega.
export default async function Actividad({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const acceso = await exigirTitular(`/b/${slug}/actividad`);
  const p = await searchParams;
  const uno = (k: string) => [p[k]].flat()[0]?.slice(0, 60) ?? "";
  const accion = uno("accion");
  const pedida = Number(uno("pagina"));
  const { filas, total, pagina, paginas } = await actividadDeBanda(acceso.tenantId, { accion, pagina: Number.isSafeInteger(pedida) && pedida > 0 ? pedida : 1 });
  return (
    <MarcoPanel slug={slug} acceso={acceso}>
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-display-xs font-semibold text-primary">Actividad</h1>
          <p className="mt-1 text-md text-tertiary">
            Todo lo que se hizo en la cuenta de la banda: quién, qué y cuándo. También lo que hace Deoco sola (la cuota, los dominios) y cada vez que
            el equipo de Deoco entra a tu panel. Nadie puede cambiar ni borrar este registro.
          </p>
        </header>
        <Filtros>
          <Campo name="accion" etiqueta="Acción (empieza con)" placeholder="membresia." defaultValue={accion} />
        </Filtros>
        <Tabla
          titulo="Registro"
          paginacion={{ pagina, paginas, total }}
          columnas={[
            { id: "fecha", etiqueta: "Cuándo" },
            { id: "quien", etiqueta: "Quién" },
            { id: "accion", etiqueta: "Qué" },
            { id: "detalle", etiqueta: "Detalle" },
          ]}
          filas={filas.map((f) => ({
            id: f.id,
            celdas: [
              <span key="f" className="text-sm whitespace-nowrap text-tertiary">{FECHA.format(f.fecha)}</span>,
              <span key="q" className="text-sm">{f.quien}</span>,
              <code key="a" className="text-sm" data-accion={f.accion}>{f.accion}</code>,
              <code key="d" className="block max-w-md truncate text-xs text-tertiary" title={JSON.stringify(f.detalle)}>{JSON.stringify(f.detalle)}</code>,
            ],
          }))}
        />
      </div>
    </MarcoPanel>
  );
}
