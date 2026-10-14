import { puedeEnPedido } from "@/nucleo/acceso/panel";
import { Aviso, Pestanas } from "@/ui";

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
        <div className="mt-4">
          <Aviso tono="info">Tu rol puede ver el sitio, pero no editarlo.</Aviso>
        </div>
      )}
      <div className="mt-6">
        <Pestanas
          etiqueta="Secciones del sitio"
          pestanas={SECCIONES.map((s) => ({ href: `${base}${s.href}`, texto: s.etiqueta, actual: actual === s.href }))}
        />
      </div>
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
