"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type GrupoMenu = { titulo: string; items: { href: string; etiqueta: string }[] };

/** Lo de la página actual: la entrada cuya dirección es el prefijo más largo de la ruta. */
function actual(grupos: GrupoMenu[], ruta: string) {
  const hrefs = grupos.flatMap((g) => g.items.map((i) => i.href));
  return hrefs.filter((h) => ruta === h || ruta.startsWith(`${h}/`)).sort((a, b) => b.length - a.length)[0];
}

/** Menú del back office: un bloque por grupo (Deoco y cada módulo), con la página actual marcada. */
export function MenuAdmin({ grupos }: { grupos: GrupoMenu[] }) {
  const marcada = actual(grupos, usePathname());
  return (
    <div className="flex flex-col gap-5">
      {grupos.map((g) => (
        <div key={g.titulo} data-grupo={g.titulo}>
          <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-quaternary uppercase">{g.titulo}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  aria-current={i.href === marcada ? "page" : undefined}
                  className={`block rounded-md px-3 py-1.5 text-md font-semibold hover:bg-primary_hover hover:text-secondary_hover ${
                    i.href === marcada ? "bg-active text-secondary_hover" : "text-secondary"
                  }`}>
                  {i.etiqueta}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
