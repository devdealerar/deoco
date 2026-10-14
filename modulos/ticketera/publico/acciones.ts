"use server";

import { recordarAcceso } from "@/nucleo/publico/acceso";
import { origenDelPedido } from "@/nucleo/publico/origen";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { compraConToken, intentarComprar } from "../compras";

export type EstadoCompra = { error?: string; redireccion?: string };

/** Comprar: reserva las entradas y manda al fan a la pasarela de la banda. */
export async function comprarAccion(
  _: EstadoCompra,
  fd: FormData,
): Promise<EstadoCompra> {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "publico")
    return { error: "Solo en el sitio de una banda." };
  const cantidad = Number(fd.get("cantidad"));
  const campo = (n: string) => String(fd.get(n) ?? "");
  const r = await intentarComprar(
    ctx.tenantId,
    {
      tipoId: campo("tipoId"),
      cantidad,
      nombre: campo("nombre"),
      email: campo("email"),
      asistentes: Array.from(
        {
          length:
            Number.isInteger(cantidad) && cantidad > 0 && cantidad <= 10
              ? cantidad
              : 0,
        },
        (_, i) => ({
          nombre: campo(`asistente-${i}-nombre`),
          documento: campo(`asistente-${i}-documento`),
        }),
      ),
    },
    await origenDelPedido(),
  );
  if (!r.ok) return { error: r.error };
  // Este navegador queda con acceso a las entradas: al volver de la pasarela las ve.
  await recordarAcceso(`entradas-${r.compraId}`, r.token);
  return { redireccion: r.redireccion };
}

/** Canjea el token del link del mail por el acceso en este navegador. */
export async function canjearEntradasAccion(
  compraId: string,
  token: string,
): Promise<boolean> {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "publico") return false;
  if (!(await compraConToken(ctx.tenantId, compraId, token))) return false;
  await recordarAcceso(`entradas-${compraId}`, token);
  return true;
}
