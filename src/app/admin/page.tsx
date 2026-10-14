import Link from "next/link";
import type { EstadoTenant } from "@/generated/prisma/client";
import { formatearBytes } from "@/nucleo/archivos";
import { Boton, Campo, Filtros, Insignia, Selector, Tabla } from "@/ui";
import { exigirStaff } from "./_servidor/acceso";
import { ESTADOS_BANDA, ORDENES_BANDA, listarBandas } from "./_servidor/bandas";
import { type ParametrosUrl, orden, pagina, texto } from "./_servidor/listado";

const COLOR_ESTADO = { ACTIVO: "exito", MOROSO: "advertencia", SUSPENDIDO: "error", ARCHIVADO: "gris" } as const;
const FECHA = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" });
const LIMITE_POR_DEFECTO = BigInt(process.env.DEOCO_LIMITE_ALMACENAMIENTO ?? 1024 ** 3);

/** Bandas: 50 por página, las más nuevas primero. Filtro, orden y página van en la URL. */
export default async function Bandas({ searchParams }: { searchParams: Promise<ParametrosUrl> }) {
  await exigirStaff();
  const p = await searchParams;
  const estado = texto(p, "estado") as EstadoTenant;
  const filtro = {
    buscar: texto(p, "q") || undefined,
    estado: ESTADOS_BANDA.includes(estado) ? estado : undefined,
    orden: orden(p, ORDENES_BANDA, { columna: "alta", direccion: "desc" }),
    pagina: pagina(p),
  };
  const { filas: bandas, ...paginacion } = await listarBandas(filtro);
  return (
    <div className="flex flex-col gap-6">
      <Filtros>
        <Campo type="search" name="q" etiqueta="Buscar" placeholder="Nombre o slug" defaultValue={filtro.buscar} />
        <Selector
          name="estado"
          etiqueta="Estado"
          defaultValue={filtro.estado ?? ""}
          opciones={[{ valor: "", texto: "Todos" }, ...ESTADOS_BANDA.map((e) => ({ valor: e, texto: e }))]}
        />
      </Filtros>
      <Tabla
        titulo="Bandas"
        descripcion="Todas las bandas de Deoco, con su estado, módulos prendidos y espacio usado."
        acciones={
          <Boton href="/admin/bandas/nueva" tamano="md">
            Nueva banda
          </Boton>
        }
        orden={filtro.orden}
        paginacion={paginacion}
        columnas={[
          { id: "nombre", etiqueta: "Banda", ordenable: true },
          { id: "estado", etiqueta: "Estado" },
          { id: "dominio", etiqueta: "Dominio" },
          { id: "modulos", etiqueta: "Módulos" },
          { id: "espacio", etiqueta: "Espacio", ordenable: true },
          { id: "alta", etiqueta: "Alta", ordenable: true },
        ]}
        filas={bandas.map((b) => ({
          id: b.id,
          celdas: [
            <div key="banda" data-slug={b.slug}>
              <Link href={`/admin/bandas/${b.slug}`} className="font-medium text-primary hover:text-brand-secondary">
                {b.nombre}
              </Link>
              <Link href={`/b/${b.slug}`} className="text-sm text-tertiary hover:text-brand-secondary">
                /b/{b.slug}
              </Link>
            </div>,
            <Insignia key="estado" color={COLOR_ESTADO[b.estado]}>
              {b.estado}
            </Insignia>,
            <span key="dominio" className="text-sm text-tertiary">
              {b.dominio ?? "—"}
            </span>,
            <span key="modulos" className="text-sm text-tertiary">
              {b.modulos.length ? b.modulos.join(", ") : "ninguno"}
            </span>,
            <span key="espacio" className="text-sm whitespace-nowrap text-tertiary">
              {formatearBytes(b.usado)} de {formatearBytes(b.limite ?? LIMITE_POR_DEFECTO)}
            </span>,
            <span key="alta" className="text-sm whitespace-nowrap text-tertiary">
              {FECHA.format(b.creadoEn)}
            </span>,
          ],
        }))}
      />
    </div>
  );
}
