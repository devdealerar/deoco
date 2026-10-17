"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ipDelVisitante } from "@/nucleo/publico/visitante";
import { accesoRecordado, recordarAcceso } from "@/nucleo/publico/acceso";
import { origenDelPedido } from "@/nucleo/publico/origen";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { revalidatePath } from "next/cache";
import { mensajeParaElPublico } from "@/nucleo/publico/errores";
import { emailDelFan } from "@/nucleo/publico/fan";
import { compraConToken, compraEnElSitio, intentarComprar, MAXIMO_ABSOLUTO_POR_COMPRA } from "../compras";
import { reenviarEntradas } from "../correos";
import { ErrorTicketera } from "../eventos";
import { aceptarTransferencia, cancelarTransferencia, confirmarTransferencia, pedirTransferencia } from "../transferencias";

export type EstadoCompra = { error?: string };

/**
 * Comprar: reserva las entradas y manda al fan a la pasarela de la banda. La redirección la
 * hace el servidor: si la compra se lleva las últimas entradas, la página se rehace como
 * "agotada" (la cookie de acceso la refresca) y el formulario ya no está para redirigir.
 */
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
      documento: campo("documento"),
      novedades: campo("novedades") === "si",
      asistentes: Array.from(
        {
          length:
            Number.isInteger(cantidad) && cantidad > 0 && cantidad <= MAXIMO_ABSOLUTO_POR_COMPRA
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
    new Date(),
    ipDelVisitante(await headers()),
  );
  if (!r.ok) return { error: r.error };
  // Este navegador queda con acceso a las entradas: al volver de la pasarela las ve.
  await recordarAcceso(`entradas-${r.compraId}`, r.token);
  redirect(r.redireccion);
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

// ---------- Área del fan (D5): transferir y reenviar ----------

async function fanDelSitio(): Promise<{ tenantId: string; email: string | null }> {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "publico") throw new Error("Solo en el sitio de una banda.");
  return { tenantId: ctx.tenantId, email: await emailDelFan(ctx.tenantId) };
}

export type EstadoFan = { ok?: string; error?: string };

export async function transferirAccion(entradaId: string, _: EstadoFan, fd: FormData): Promise<EstadoFan> {
  const { tenantId, email } = await fanDelSitio();
  if (!email) return { error: "Tu sesión venció: pedí un link nuevo desde Mis compras." };
  const campo = (n: string) => String(fd.get(n) ?? "");
  try {
    await pedirTransferencia(tenantId, email, entradaId, { nombre: campo("nombre"), documento: campo("documento"), email: campo("email") }, await origenDelPedido());
    return { ok: "Te mandamos un mail para confirmar la transferencia. Hasta que la otra persona la acepte, la entrada sigue siendo tuya." };
  } catch (e) {
    if (e instanceof ErrorTicketera) return { error: e.message };
    return { error: mensajeParaElPublico(e, "ticketera: transferir") };
  }
}

export async function cancelarTransferenciaAccion(transferenciaId: string, _: EstadoFan): Promise<EstadoFan> {
  const { tenantId, email } = await fanDelSitio();
  if (!email) return { error: "Tu sesión venció: pedí un link nuevo desde Mis compras." };
  try {
    await cancelarTransferencia(tenantId, email, transferenciaId);
    revalidatePath("/mis-compras");
    return { ok: "Cancelada: la entrada sigue siendo tuya." };
  } catch (e) {
    if (e instanceof ErrorTicketera) return { error: e.message };
    throw e;
  }
}

/** Reenviar el mail de las entradas (no le llegó): desde la página de la compra o el área del fan. */
export async function reenviarAccion(compraId: string, _: EstadoFan): Promise<EstadoFan> {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "publico") return { error: "Solo en el sitio de una banda." };
  const compra = await compraEnElSitio(ctx.tenantId, compraId, await accesoRecordado(`entradas-${compraId}`), await emailDelFan(ctx.tenantId));
  if (!compra) return { error: "Para reenviarlas, abrí el link de tu mail o entrá desde Mis compras." };
  return (await reenviarEntradas(ctx.tenantId, compraId))
    ? { ok: `Listo: te las volvimos a mandar a ${compra.email}. Revisá también la carpeta de spam.` }
    : { error: "Ya te las reenviamos varias veces hoy. Si no te llegan, respondé cualquier mail de la banda." };
}

export async function confirmarTransferenciaAccion(token: string): Promise<boolean> {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "publico") return false;
  return confirmarTransferencia(ctx.tenantId, token, await origenDelPedido());
}

export async function aceptarTransferenciaAccion(token: string): Promise<boolean> {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "publico") return false;
  return aceptarTransferencia(ctx.tenantId, token);
}
