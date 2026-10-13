"use server";

import { headers } from "next/headers";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { comprar } from "../compras";
import { ErrorTicketera } from "../eventos";

export type EstadoCompra = { error?: string; redireccion?: string };

/** Comprar: reserva las entradas y manda al fan a la pasarela de la banda. */
export async function comprarAccion(_: EstadoCompra, fd: FormData): Promise<EstadoCompra> {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "publico") return { error: "Solo en el sitio de una banda." };
  const h = await headers();
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || (process.env.NODE_ENV === "production" ? "https" : "http");
  const cantidad = Number(fd.get("cantidad"));
  const campo = (n: string) => String(fd.get(n) ?? "");
  try {
    const r = await comprar(
      ctx.tenantId,
      {
        tipoId: campo("tipoId"),
        cantidad,
        nombre: campo("nombre"),
        email: campo("email"),
        asistentes: Array.from({ length: Number.isInteger(cantidad) && cantidad > 0 && cantidad <= 10 ? cantidad : 0 }, (_, i) => ({
          nombre: campo(`asistente-${i}-nombre`),
          documento: campo(`asistente-${i}-documento`),
        })),
      },
      `${proto}://${h.get("host")}`,
    );
    return { redireccion: r.redireccion };
  } catch (e) {
    if (e instanceof ErrorTicketera) return { error: e.message };
    throw e;
  }
}
