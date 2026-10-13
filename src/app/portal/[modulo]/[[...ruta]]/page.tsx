import Link from "next/link";
import { notFound } from "next/navigation";
import { accesoExterno } from "@/nucleo/acceso/externas";
import { registro } from "@/nucleo/modulos";
import { consultaDe, type SearchParamsNext } from "@/nucleo/modulos/consulta";
import { menuExterno } from "@/nucleo/modulos/navegacion";
import { BotonSalir } from "../../../salir";

// Portal de cuentas externas de un módulo (el panel del proveedor de la tienda):
// app.<raiz>/portal/<id><ruta>. Solo quien tiene cuenta externa en ese módulo; si no, 404.
export default async function RutaExterna({
  params,
  searchParams,
}: {
  params: Promise<{ modulo: string; ruta?: string[] }>;
  searchParams: Promise<SearchParamsNext>;
}) {
  const { modulo, ruta = [] } = await params;
  const reg = registro();
  const definicion = reg.modulo(modulo);
  if (!definicion?.cuentasExternas) notFound();
  const path = "/" + ruta.map(decodeURIComponent).join("/");
  const { usuarioId, referencia } = await accesoExterno(modulo, `/portal/${modulo}${path === "/" ? "" : path}`);
  const encontrada = reg.rutaExterna(modulo, path);
  if (!encontrada) notFound();
  const Componente = encontrada.ruta.componente;
  const menu = menuExterno(reg, modulo);
  return (
    <div className="min-h-dvh bg-secondary">
      <header className="border-b border-secondary bg-primary">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-4 lg:px-8">
          <Link href={`/portal/${modulo}`} className="text-lg font-bold text-primary">
            deoco <span className="font-medium text-tertiary">· {definicion.cuentasExternas.etiqueta}</span>
          </Link>
          <nav aria-label="Portal" className="flex-1">
            <ul className="flex flex-wrap gap-1 text-md font-semibold text-secondary">
              {menu.map((m) => (
                <li key={m.href}>
                  <Link href={m.href} className="rounded-md px-3 py-2 hover:bg-primary_hover">
                    {m.etiqueta}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/clave" className="font-semibold text-tertiary hover:text-secondary">
              Cambiar clave
            </Link>
            <BotonSalir />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
        <Componente usuarioId={usuarioId} referencia={referencia} params={encontrada.params} consulta={consultaDe(await searchParams)} />
      </main>
    </div>
  );
}
