import Link from "next/link";
import type { ReactNode } from "react";
import { type AccesoPanel, prendidosDelPedido } from "@/nucleo/acceso/panel";
import { registro } from "@/nucleo/modulos";
import { menuPanel } from "@/nucleo/modulos/navegacion";
import { dominiosConProblema } from "@/nucleo/dominios";
import { bandaCobra } from "@/nucleo/pagos";
import { Aviso } from "@/ui";
import { BotonSalir } from "../../salir";

/** Marco del panel de una banda: menú armado con los módulos prendidos y los permisos. */
export async function MarcoPanel({ slug, acceso, children }: { slug: string; acceso: AccesoPanel; children: ReactNode }) {
  const reg = registro();
  const prendidos = await prendidosDelPedido(acceso.tenantId);
  const menu = menuPanel(reg, prendidos, acceso, slug);
  const esTitular = acceso.rol === "TITULAR";
  const conCredenciales =
    esTitular && (reg.modulos.some((m) => prendidos.has(m.id) && m.secretos?.length) || (await bandaCobra(acceso.tenantId, reg)));
  // Dominios propios con un problema (los marca el barrido según Cloudflare): lo ve quien lo
  // puede arreglar (el staff lo ve en /admin). El sitio no se despublica.
  const conProblema = esTitular ? await dominiosConProblema(acceso.tenantId) : [];
  // Suspendida: solo se puede pagar (el resto del panel da 403). El sitio público sigue.
  const suspendida = acceso.estado === "SUSPENDIDO";
  const conPago = esTitular && Boolean(reg.gestor);
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
              {!suspendida && (
                <li>
                  <Link href={`/b/${slug}`} className={item}>
                    Inicio
                  </Link>
                </li>
              )}
              {conPago && (
                <li>
                  <Link href={`/b/${slug}/pago`} className={item}>
                    Plan y pago
                  </Link>
                </li>
              )}
              {esTitular && !suspendida && (
                <li>
                  <Link href={`/b/${slug}/dominios`} className={item}>
                    Dominios
                  </Link>
                </li>
              )}
              {conCredenciales && !suspendida && (
                <li>
                  <Link href={`/b/${slug}/credenciales`} className={item}>
                    Credenciales
                  </Link>
                </li>
              )}
              {!suspendida && menu.map((m) => (
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
        <div className="mx-auto max-w-5xl">
          {acceso.estado === "MOROSO" && esTitular && (
            <div className="mb-6">
              <Aviso titulo="Hay una cuota pendiente." data-testid="aviso-mora">
                Tu sitio sigue publicado. Si no se regulariza, el panel se suspende.{" "}
                <Link href={`/b/${slug}/pago`} className="font-semibold underline">
                  Pagar
                </Link>
              </Aviso>
            </div>
          )}
          {suspendida && esTitular && (
            <div className="mb-6">
              <Aviso tono="error" titulo="Tu cuenta está suspendida." data-testid="aviso-suspendida">
                El sitio público sigue online. Para volver a usar el panel, regularizá el pago.
              </Aviso>
            </div>
          )}
          {conProblema.length > 0 && (
            <div className="mb-6">
              <Aviso
                titulo={
                  conProblema.length === 1
                    ? `${conProblema[0].dominio} tiene un problema`
                    : `${conProblema.map((d) => d.dominio).join(", ")} tienen un problema`
                }
                data-dominio-problema
              >
                {conProblema.length === 1 ? `${conProblema[0].problema} ` : ""}El sitio sigue publicado, pero quien entra
                por ese dominio puede no llegar. <Link href={`/b/${slug}/dominios`} className="font-semibold underline">Ver dominios</Link>
              </Aviso>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
