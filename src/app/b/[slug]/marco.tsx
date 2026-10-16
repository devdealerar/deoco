import Link from "next/link";
import type { ReactNode } from "react";
import { rutaAbiertaConBandaCerrada } from "@/nucleo/acceso/banda-cerrada";
import { type AccesoPanel, prendidosDelPedido } from "@/nucleo/acceso/panel";
import { registro } from "@/nucleo/modulos";
import { menuPanel } from "@/nucleo/modulos/navegacion";
import { delegacionesPorVencer, dominiosConProblema } from "@/nucleo/dominios";
import { dominioDeEnvio } from "@/nucleo/dominios/envio";
import { pagosParaDevolver } from "@/nucleo/pagos/registro";
import { dominiosPorVencerEnPanel } from "@/nucleo/dominios/vencimiento";
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
  // Delegaciones que vencen en un par de días si la banda no cambia los nameservers.
  const porVencer = esTitular ? await delegacionesPorVencer(acceso.tenantId) : [];
  // Dominios que vencen en 30 días o ya vencieron (comprados: renovar; delegados: en su registrador).
  const vencen = esTitular ? await dominiosPorVencerEnPanel(acceso.tenantId) : [];
  // Cuota impaga (escalera del gestor de cuenta): MOROSO aviso al titular; MOROSO_GRAVE aviso
  // permanente a todos; SOLO_LECTURA y SUSPENDIDO, el panel se ve y no guarda (suspendida, además,
  // el sitio no está publicado). Archivada: el panel no existe más, salvo Dominios para el titular
  // y la puerta de un show ya vendido.
  const archivada = acceso.estado === "ARCHIVADO";
  // Plan y pago, también archivada: para darse de baja o volver.
  const conPago = esTitular && Boolean(reg.gestor);
  // Pagos que la banda tiene que devolver (duplicados, tardíos, que no coinciden): el titular.
  const paraDevolver = esTitular ? (await pagosParaDevolver(acceso.tenantId, { pendientes: true })).length : 0;
  // Archivada: del menú quedan solo las rutas de módulo que siguen abiertas (la puerta de un show
  // ya vendido).
  const visibles = archivada
    ? (await Promise.all(menu.map(async (m) => ((await rutaAbiertaConBandaCerrada(acceso, m.href.slice(`/b/${slug}`.length) || "/", reg)) ? m : null)))).filter((m) => m !== null)
    : menu;
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
              {!archivada && (
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
              {esTitular && (paraDevolver > 0 || (await bandaCobra(acceso.tenantId, reg))) && (
                <li>
                  <Link href={`/b/${slug}/devoluciones`} className={item}>
                    Pagos para devolver{paraDevolver > 0 ? ` (${paraDevolver})` : ""}
                  </Link>
                </li>
              )}
              {/* Dominios, también archivada: la cuota impaga no le impide llevarse sus dominios. */}
              {esTitular && (
                <li>
                  <Link href={`/b/${slug}/dominios`} className={item}>
                    Dominios
                  </Link>
                </li>
              )}
              {esTitular && !archivada && dominioDeEnvio() && (
                <li>
                  <Link href={`/b/${slug}/correo`} className={item}>
                    Correo
                  </Link>
                </li>
              )}
              {conCredenciales && !archivada && (
                <li>
                  <Link href={`/b/${slug}/credenciales`} className={item}>
                    Credenciales
                  </Link>
                </li>
              )}
              {visibles.map((m) => (
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
                Tu sitio sigue publicado. Si no se regulariza, primero el panel queda en solo lectura y después el sitio deja de estar publicado.{" "}
                <Link href={`/b/${slug}/pago`} className="font-semibold underline">
                  Pagar
                </Link>
              </Aviso>
            </div>
          )}
          {archivada && esTitular && (
            <div className="mb-6">
              <Aviso tono="error" titulo="La banda está archivada." data-testid="aviso-archivada">
                El sitio y el panel ya no están en Deoco. Tus dominios siguen siendo tuyos: desde acá podés llevártelos. En Plan y pago podés
                darte de baja o volver.
              </Aviso>
            </div>
          )}
          {paraDevolver > 0 && (
            <div className="mb-6">
              <Aviso tono="advertencia" titulo={`Tenés ${paraDevolver === 1 ? "un pago" : `${paraDevolver} pagos`} para devolver.`} data-testid="aviso-devoluciones">
                Llegaron a tu cuenta pagos que no corresponden (duplicados, tardíos o que no coinciden).{" "}
                <Link href={`/b/${slug}/devoluciones`} className="font-semibold underline">
                  Ver y devolver
                </Link>
              </Aviso>
            </div>
          )}
          {acceso.estado === "MOROSO_GRAVE" && (
            <div className="mb-6">
              <Aviso tono="error" titulo="La cuota de Deoco sigue impaga." data-testid="aviso-mora-grave">
                Todo sigue funcionando por ahora. Si no se regulariza, el panel pasa a solo lectura y después el sitio deja de estar publicado.{" "}
                {esTitular && (
                  <Link href={`/b/${slug}/pago`} className="font-semibold underline">
                    Pagar
                  </Link>
                )}
              </Aviso>
            </div>
          )}
          {(acceso.estado === "SOLO_LECTURA" || acceso.estado === "SUSPENDIDO") && (
            <div className="mb-6">
              <Aviso tono="error" titulo="El panel está en solo lectura." data-testid="aviso-solo-lectura">
                {acceso.estado === "SUSPENDIDO"
                  ? "La cuota de Deoco está impaga: el sitio dejó de estar publicado y se cortaron las ventas. No se borró nada y la puerta de los shows vendidos sigue funcionando."
                  : "La cuota de Deoco está impaga: podés ver todo, pero no guardar cambios. El sitio, la tienda y las entradas siguen funcionando."}{" "}
                {esTitular && (
                  <Link href={`/b/${slug}/pago`} className="font-semibold underline">
                    Regularizar el pago
                  </Link>
                )}
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
          {porVencer.length > 0 && (
            <div className="mb-6">
              <Aviso
                titulo={
                  porVencer.length === 1
                    ? `La delegación de ${porVencer[0].dominio} está por vencer`
                    : `Las delegaciones de ${porVencer.map((d) => d.dominio).join(", ")} están por vencer`
                }
                data-delegacion-por-vencer
              >
                {porVencer.length === 1
                  ? `Si no cambiás los nameservers antes del ${porVencer[0].vence.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "long" })}, el pedido vence y se libera. `
                  : "Si no cambiás los nameservers, los pedidos vencen y se liberan. "}
                <Link href={`/b/${slug}/dominios`} className="font-semibold underline">Ver dominios</Link>
              </Aviso>
            </div>
          )}
          {vencen.length > 0 && (
            <div className="mb-6">
              <Aviso tono={vencen.some((d) => d.vencidoEn || d.dias <= 7) ? "error" : "advertencia"} titulo={tituloVencen(vencen)} data-dominio-vence>
                {vencen.some((d) => d.comprado) ? "Renovalo desde Dominios: Deoco nunca lo renueva sin que lo pagues. " : "Renovalo donde lo registraste. "}
                <Link href={`/b/${slug}/dominios`} className="font-semibold underline">Ver dominios</Link>
              </Aviso>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

function tituloVencen(v: { dominio: string; dias: number; vencidoEn: Date | null }[]) {
  if (v.length > 1) return `${v.map((d) => d.dominio).join(", ")}: vencen pronto o ya vencieron`;
  const [d] = v;
  if (d.vencidoEn || d.dias <= 0) return `${d.dominio} venció`;
  return d.dias === 1 ? `${d.dominio} vence mañana` : `${d.dominio} vence en ${d.dias} días`;
}
