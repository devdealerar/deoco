import Link from "next/link";
import type { ReactNode } from "react";
import { type AccesoPanel, prendidosDelPedido } from "@/nucleo/acceso/panel";
import { registro } from "@/nucleo/modulos";
import { menuPanel } from "@/nucleo/modulos/navegacion";
import { BotonSalir } from "../../salir";

/** Marco del panel de una banda: menú armado con los módulos prendidos y los permisos. */
export async function MarcoPanel({ slug, acceso, children }: { slug: string; acceso: AccesoPanel; children: ReactNode }) {
  const menu = menuPanel(registro(), await prendidosDelPedido(acceso.tenantId), acceso, slug);
  return (
    <>
      <nav aria-label="Panel">
        <ul>
          <li>
            <Link href={`/b/${slug}`}>Inicio</Link>
          </li>
          {menu.map((m) => (
            <li key={m.href} data-modulo={m.moduloId}>
              <Link href={m.href}>{m.etiqueta}</Link>
            </li>
          ))}
        </ul>
        <Link href="/">Mis bandas</Link>
        <BotonSalir />
      </nav>
      {children}
    </>
  );
}
