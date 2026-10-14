import { conStaff } from "@/nucleo/acceso/staff";
import type { PropsRutaAdmin } from "@/nucleo/modulos/contrato";
import { Tarjeta } from "@/ui";
import { formatearPesos } from "@/nucleo/dinero";
import { deudaDeTodas } from "../pagos";

/** Back office · Deuda con proveedores, por banda y por proveedor. Solo lectura (auditada). */
export async function AdminDeudas(_: PropsRutaAdmin) {
  const bandas = await conStaff("tienda.deudas_consultadas", async (tx, ctx) => {
    const r = await deudaDeTodas(tx);
    ctx.detalle({ bandas: r.length });
    return r;
  });
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-display-xs font-semibold text-primary">Deuda con proveedores</h1>
        <p className="mt-1 text-md text-tertiary">Lo que cada banda le debe a cada proveedor por pedidos pagados. Deoco solo lleva la cuenta.</p>
      </header>
      {bandas.length === 0 && <p className="text-tertiary">Todavía no hay pedidos pagados.</p>}
      {bandas.map(({ banda, proveedores }) => (
        <div key={banda.id} data-banda={banda.slug}>
          <Tarjeta titulo={banda.nombre}>
            <ul className="flex flex-col divide-y divide-secondary">
              {proveedores.map((d) => (
                <li key={d.proveedorId} className="flex justify-between gap-4 py-2" data-deuda={d.proveedor}>
                  <span className="text-primary">{d.proveedor}</span>
                  <span className="tabular-nums">
                    <strong data-pendiente>{formatearPesos(d.pendiente)}</strong>{" "}
                    <span className="text-sm text-tertiary">
                      ({d.pedidosPendientes} sin saldar{d.saldado > 0 && ` · ${formatearPesos(d.saldado)} saldado`})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Tarjeta>
        </div>
      ))}
    </div>
  );
}
