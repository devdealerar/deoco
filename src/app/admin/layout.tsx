import Link from "next/link";
import type { ReactNode } from "react";
import { BotonSalir } from "../salir";
import { exigirStaff } from "./_servidor/acceso";

// Back office de Deoco: app.<raiz>/admin, solo staff. Cada página y acción vuelve a
// verificar con exigirStaff() (el layout no garantiza correr antes que la página).
export default async function LayoutAdmin({ children }: { children: ReactNode }) {
  await exigirStaff();
  return (
    <div className="min-h-dvh bg-secondary">
      <header className="border-b border-secondary bg-primary">
        <div className="mx-auto flex max-w-6xl items-center gap-8 px-4 py-4 lg:px-8">
          <Link href="/admin" className="text-lg font-bold text-primary">
            deoco <span className="font-medium text-tertiary">· admin</span>
          </Link>
          <nav aria-label="Back office" className="flex-1">
            <ul className="flex gap-1 text-md font-semibold text-secondary">
              {[
                ["/admin", "Bandas"],
                ["/admin/usuarios", "Usuarios"],
                ["/admin/eventos", "Eventos fallidos"],
              ].map(([href, etiqueta]) => (
                <li key={href}>
                  <Link href={href} className="rounded-md px-3 py-2 hover:bg-primary_hover">
                    {etiqueta}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <BotonSalir />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">{children}</main>
    </div>
  );
}
