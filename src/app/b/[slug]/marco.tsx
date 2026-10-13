import Link from "next/link";
import type { ReactNode } from "react";
import { type AccesoPanel, prendidosDelPedido } from "@/nucleo/acceso/panel";
import { registro } from "@/nucleo/modulos";
import { menuPanel } from "@/nucleo/modulos/navegacion";
import { BotonSalir } from "../../salir";

/** Marco del panel de una banda: menú armado con los módulos prendidos y los permisos. */
export async function MarcoPanel({ slug, acceso, children }: { slug: string; acceso: AccesoPanel; children: ReactNode }) {
  const menu = menuPanel(registro(), await prendidosDelPedido(acceso.tenantId), acceso, slug);
  const item = "block rounded-md px-3 py-2 text-md font-semibold text-secondary hover:bg-primary_hover hover:text-secondary_hover";
  return (
    <div className="min-h-dvh bg-secondary lg:flex">
      <aside className="border-b border-secondary bg-primary lg:sticky lg:top-0 lg:h-dvh lg:w-72 lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="flex h-full flex-col gap-6 p-4 lg:p-6">
          <Link href="/" className="text-lg font-bold text-primary">
            deoco
          </Link>
          <nav aria-label="Panel" className="flex-1">
            <ul className="flex gap-1 overflow-x-auto lg:flex-col">
              <li>
                <Link href={`/b/${slug}`} className={item}>
                  Inicio
                </Link>
              </li>
              {acceso.rol === "TITULAR" && (
                <li>
                  <Link href={`/b/${slug}/dominios`} className={item}>
                    Dominios
                  </Link>
                </li>
              )}
              {menu.map((m) => (
                <li key={m.href} data-modulo={m.moduloId}>
                  <Link href={m.href} className={item}>
                    {m.etiqueta}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="hidden flex-col gap-2 border-t border-secondary pt-4 text-sm lg:flex">
            <Link href="/" className="font-semibold text-tertiary hover:text-secondary">
              Mis bandas
            </Link>
            <Link href="/clave" className="font-semibold text-tertiary hover:text-secondary">
              Cambiar clave
            </Link>
            <BotonSalir />
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1 p-4 lg:p-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </div>
    </div>
  );
}
