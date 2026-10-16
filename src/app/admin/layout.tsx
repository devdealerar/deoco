import Link from "next/link";
import type { ReactNode } from "react";
import { registro } from "@/nucleo/modulos";
import type { AlertaAdmin } from "@/nucleo/modulos/contrato";
import { Aviso } from "@/ui";
import { menuAdminPorModulo } from "@/nucleo/modulos/navegacion";
import { BotonSalir } from "../salir";
import { exigirStaff } from "./_servidor/acceso";
import { devolucionesSinPedir } from "./_servidor/compras";
import { type GrupoMenu, MenuAdmin } from "./menu";

// Back office de Deoco: app.<raiz>/admin, solo staff. Cada página y acción vuelve a
// verificar con exigirStaff() (el layout no garantiza correr antes que la página).
// Menú lateral agrupado: lo de Deoco arriba y un bloque por módulo (crece hacia abajo, no de costado).
export default async function LayoutAdmin({ children }: { children: ReactNode }) {
  await exigirStaff();
  const alertas = await alertasDelBackOffice();
  const grupos: GrupoMenu[] = [
    {
      titulo: "Deoco",
      items: [
        { href: "/admin", etiqueta: "Bandas" },
        { href: "/admin/usuarios", etiqueta: "Usuarios" },
        { href: "/admin/eventos", etiqueta: "Eventos fallidos" },
        { href: "/admin/auditoria", etiqueta: "Auditoría" },
        { href: "/admin/dominios", etiqueta: "Dominios comprados" },
      ],
    },
    ...menuAdminPorModulo(registro()).map((g) => ({ titulo: g.titulo, items: g.items.map((i) => ({ href: i.href, etiqueta: i.etiqueta })) })),
  ];
  const pie = (
    <div className="flex flex-col gap-2 border-t border-secondary pt-4 text-sm">
      <Link href="/clave" className="font-semibold text-tertiary hover:text-secondary">
        Cambiar clave
      </Link>
      <BotonSalir />
    </div>
  );
  return (
    <div className="min-h-dvh bg-secondary lg:flex">
      <aside className="border-b border-secondary bg-primary lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
        <div className="flex flex-col gap-6 p-4 lg:min-h-full lg:p-6">
          <Link href="/admin" className="text-lg font-bold text-primary">
            deoco <span className="font-medium text-tertiary">· admin</span>
          </Link>
          {/* Celular: el menú se despliega; escritorio: siempre a la vista. */}
          <details className="lg:hidden">
            <summary className="cursor-pointer rounded-md px-3 py-2 text-md font-semibold text-secondary">Menú</summary>
            <nav aria-label="Back office (celular)" className="mt-3 flex flex-col gap-6">
              <MenuAdmin grupos={grupos} />
              {pie}
            </nav>
          </details>
          <nav aria-label="Back office" className="hidden flex-1 lg:block">
            <MenuAdmin grupos={grupos} />
          </nav>
          <div className="hidden lg:block">{pie}</div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-8 lg:px-10">
        <div className="mx-auto max-w-6xl">
          {alertas.length > 0 && (
            <div className="mb-6 flex flex-col gap-2" data-alertas-admin>
              {alertas.map((a) => (
                <Aviso key={a.texto} tono="error">
                  <Link href={a.href} className="font-semibold underline">
                    {a.texto}
                  </Link>
                </Aviso>
              ))}
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}

/**
 * Lo que el staff tiene que mirar ya, en todas las páginas (p. ej. plata que no se pudo devolver):
 * del núcleo y de cada módulo (`alertasAdmin`). Si un módulo falla al contestar, también se avisa.
 */
async function alertasDelBackOffice(): Promise<AlertaAdmin[]> {
  const sinPedir = await devolucionesSinPedir();
  const propias: AlertaAdmin[] = sinPedir
    ? [{ texto: `${sinPedir === 1 ? "Una compra de dominio fallida no pudo pedir" : `${sinPedir} compras de dominios fallidas no pudieron pedir`} la devolución del pago.`, href: "/admin/dominios?estado=atencion" }]
    : [];
  const deModulos = await Promise.all(
    registro()
      .modulos.filter((m) => m.alertasAdmin)
      .map((m) =>
        m.alertasAdmin!().catch((e) => {
          console.error(`[admin] alertas de ${m.id}:`, e);
          return [{ texto: `No se pudieron leer las alertas de "${m.id}": revisá el log.`, href: "/admin" }];
        }),
      ),
  );
  return [...propias, ...deModulos.flat()];
}
