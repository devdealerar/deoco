import Link from "next/link";
import { formatearBytes } from "@/nucleo/archivos";
import { Insignia, Tabla } from "@/ui";
import { exigirStaff } from "./_servidor/acceso";
import { listarBandas } from "./_servidor/bandas";

const COLOR_ESTADO = { ACTIVO: "exito", MOROSO: "advertencia", SUSPENDIDO: "error", ARCHIVADO: "gris" } as const;
const FECHA = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" });
const LIMITE_POR_DEFECTO = BigInt(process.env.DEOCO_LIMITE_ALMACENAMIENTO ?? 1024 ** 3);

export default async function Bandas() {
  await exigirStaff();
  const bandas = await listarBandas();
  return (
    <Tabla
      titulo="Bandas"
      descripcion="Todas las bandas de Deoco, con su estado, módulos prendidos y espacio usado."
      acciones={
        <Link
          href="/admin/bandas/nueva"
          className="inline-flex rounded-lg bg-brand-solid px-3.5 py-2.5 text-sm font-semibold text-white shadow-xs-skeuomorphic hover:bg-brand-solid_hover"
        >
          Nueva banda
        </Link>
      }
      columnas={[
        { id: "banda", etiqueta: "Banda" },
        { id: "estado", etiqueta: "Estado" },
        { id: "dominio", etiqueta: "Dominio" },
        { id: "modulos", etiqueta: "Módulos" },
        { id: "espacio", etiqueta: "Espacio" },
        { id: "alta", etiqueta: "Alta" },
      ]}
      filas={bandas.map((b) => ({
        id: b.id,
        celdas: [
          <div key="banda" data-slug={b.slug}>
            <div className="font-medium text-primary">{b.nombre}</div>
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
  );
}
