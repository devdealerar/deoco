import Link from "next/link";
import { accesoPanel, puedeEnPedido } from "@/nucleo/acceso/panel";
import { bloquesDeInicio, permisosDelMenu } from "@/nucleo/inicio";
import { Tarjeta } from "@/ui";
import { MarcoPanel } from "./marco";

// Inicio del panel de una banda: un bloque por módulo prendido (su consulta "inicio"): estado
// de la cuenta, ventas, entradas, lo que falta hacer. Sin gráficos: lo que hay que saber hoy.
export default async function PanelBanda({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const volver = `/b/${slug}`;
  const acceso = await accesoPanel(volver);
  const bloques = await bloquesDeInicio(acceso.tenantId, async (moduloId, esGestor) => {
    if (esGestor) return acceso.rol === "TITULAR";
    for (const p of permisosDelMenu(moduloId)) if (await puedeEnPedido(p, volver)) return true;
    return false;
  });
  const pendientes = bloques.flatMap((b) => b.pendientes.map((p) => ({ ...p, moduloId: b.moduloId })));

  return (
    <MarcoPanel slug={slug} acceso={acceso}>
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-display-xs font-semibold text-primary">Inicio</h1>
          <p className="mt-1 text-md text-tertiary">
            Tu rol: <span data-testid="rol">{acceso.rol ?? "—"}</span>
            {acceso.viaStaff && <strong data-testid="acceso-staff"> · acceso de staff</strong>}
          </p>
        </header>
        {pendientes.length > 0 && (
          <Tarjeta titulo="Para hacer" data-testid="pendientes">
            <ul className="flex flex-col gap-2 text-md">
              {pendientes.map((p) => (
                <li key={p.texto} data-pendiente={p.moduloId}>
                  {p.href ? (
                    <Link href={`${volver}${p.href === "/" ? "" : p.href}`} className="font-medium text-brand-secondary hover:underline">
                      {p.texto}
                    </Link>
                  ) : (
                    p.texto
                  )}
                </li>
              ))}
            </ul>
          </Tarjeta>
        )}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {bloques.map((b) => (
            <Tarjeta key={b.moduloId} titulo={b.titulo} data-bloque={b.moduloId}>
              {b.datos.length > 0 ? (
                <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                  {b.datos.map((d) => (
                    <div key={d.etiqueta}>
                      <dt className="text-sm text-tertiary">{d.etiqueta}</dt>
                      <dd className="text-md font-semibold text-primary tabular-nums" data-dato={d.etiqueta}>
                        {d.valor}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-tertiary">Nada por ahora.</p>
              )}
            </Tarjeta>
          ))}
        </div>
      </div>
    </MarcoPanel>
  );
}
