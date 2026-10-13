import Link from "next/link";
import { puedeEnPedido } from "@/nucleo/acceso/panel";

export const SECCIONES = [
  { href: "", etiqueta: "Resumen" },
  { href: "/identidad", etiqueta: "Identidad" },
  { href: "/home", etiqueta: "Home" },
  { href: "/prensa", etiqueta: "Press kit" },
  { href: "/vista-previa", etiqueta: "Vista previa" },
];

export const puedeEditar = (slug: string) => puedeEnPedido("sitio.contenido.editar", `/b/${slug}/sitio`);

/** Encabezado de las pantallas del módulo, con sus secciones. */
export function Encabezado({ slug, actual, puedeEditar }: { slug: string; actual: string; puedeEditar: boolean }) {
  const base = `/b/${slug}/sitio`;
  return (
    <header className="mb-8">
      <h1 className="text-display-xs font-semibold text-primary">Sitio</h1>
      <p className="mt-1 text-md text-tertiary">Home y press kit. Lo que editás acá es un borrador hasta que lo publicás.</p>
      {!puedeEditar && (
        <p role="note" className="mt-4 rounded-lg bg-secondary px-4 py-3 text-sm text-secondary">
          Tu rol puede ver el sitio, pero no editarlo.
        </p>
      )}
      <nav aria-label="Secciones del sitio" className="mt-6 border-b border-secondary">
        <ul className="-mb-px flex gap-4 overflow-x-auto">
          {SECCIONES.map((s) => {
            const activa = actual === s.href;
            return (
              <li key={s.href}>
                <Link
                  href={`${base}${s.href}`}
                  aria-current={activa ? "page" : undefined}
                  className={`block border-b-2 px-1 pb-3 text-sm font-semibold whitespace-nowrap ${
                    activa ? "border-brand text-brand-secondary" : "border-transparent text-quaternary hover:text-secondary"
                  }`}
                >
                  {s.etiqueta}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}

/** Miniatura en el panel: la versión web del archivo, servida por la ruta autenticada. */
export function Miniatura({ slug, archivo, web = true }: { slug: string; archivo: { id: string; nombre: string; tipo: string }; web?: boolean }) {
  const raster = ["jpeg", "png", "webp"].includes(archivo.tipo);
  if (!raster) {
    return (
      <div className="grid size-16 shrink-0 place-items-center rounded-lg bg-secondary text-xs font-semibold text-tertiary uppercase">
        {archivo.tipo}
      </div>
    );
  }
  const q = web ? "?v=web" : "";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- archivo propio, versión web
    <img
      src={`/b/${slug}/archivos/${archivo.id}/${encodeURIComponent(archivo.nombre)}${q}`}
      alt=""
      className="size-16 shrink-0 rounded-lg bg-secondary object-cover"
    />
  );
}
