/* eslint-disable @next/next/no-img-element -- archivos propios ya optimizados (versión web) */
import Link from "next/link";
import type { ReactNode } from "react";
import type { ContenidoSitio } from "../contenido";
import { type Rutas, variables } from "./estilo";

/** Marco del sitio de la banda: identidad, pestañas y pie. Envuelve todas las páginas públicas. */
export function MarcoBanda({
  contenido,
  pestanas,
  path,
  rutas,
  aviso,
  children,
}: {
  contenido: ContenidoSitio;
  pestanas: { etiqueta: string; href: string }[];
  path: string;
  rutas: Rutas;
  aviso?: ReactNode;
  children: ReactNode;
}) {
  const { logo } = contenido.identidad;
  return (
    <div
      style={variables(contenido)}
      className="min-h-dvh bg-[var(--fondo)] text-[var(--texto)] [font-family:var(--fuente)] antialiased"
    >
      {aviso}
      <header className="sticky top-0 z-10 border-b border-[var(--linea)] bg-[var(--fondo)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3">
          <Link href={rutas.home} className="flex min-w-0 items-center gap-3">
            {logo ? (
              <img src={rutas.archivo(logo, { web: true })} alt={contenido.nombre} className="h-9 w-auto max-w-40 object-contain" />
            ) : (
              <span className="truncate text-lg font-black tracking-tight uppercase">{contenido.nombre}</span>
            )}
          </Link>
          {pestanas.length > 1 && (
            <nav aria-label="Sitio">
              <ul className="flex gap-1 text-sm font-bold">
                {pestanas.map((p) => {
                  const activa = p.href === path || (p.href !== "/" && path.startsWith(p.href));
                  return (
                    <li key={p.href}>
                      <Link
                        href={p.href}
                        aria-current={activa ? "page" : undefined}
                        className={`block rounded-full px-3.5 py-1.5 transition ${
                          activa ? "bg-[var(--acento)] text-[var(--sobre-acento)]" : "hover:bg-[var(--superficie)]"
                        }`}
                      >
                        {p.etiqueta}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}
        </div>
      </header>
      <main>{children}</main>
      <footer className="mx-auto max-w-5xl px-5 py-10 text-sm text-[var(--texto-suave)]">
        © {new Date().getFullYear()} {contenido.nombre}
      </footer>
    </div>
  );
}
