"use server";

import { headers } from "next/headers";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import tienda from "../index";
import { crearPedido, ErrorCompra, leerCarrito, revisarCarrito, type Revision } from "../pedidos";
import { iniciarCobro } from "../pagos";
import { ErrorPasarela, pasarelaLista } from "@/nucleo/pagos";

/** Solo en el sitio público de una banda: la banda sale del host, nunca del navegador. */
async function banda(): Promise<string> {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "publico") throw new Error("Solo en el sitio de una banda.");
  return ctx.tenantId;
}

export type EstadoCarrito = Revision & { disponible: boolean };

/** Revisa el carrito del navegador contra la base: precios de ahora, publicado, variantes. */
export async function revisarAccion(crudo: unknown): Promise<EstadoCarrito> {
  const tenantId = await banda();
  const [revision, { lista }] = [await revisarCarrito(tenantId, leerCarrito(crudo)), await pasarelaLista(tienda, tenantId)];
  return { ...revision, disponible: lista };
}

export type EstadoCheckout = { problemas?: string[]; pedidoId?: string; redireccion?: string };

/** El sitio de la banda tal como lo pidió el fan (para volver después de pagar). */
async function origen(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${proto}://${h.get("host")}`;
}

/** Confirma: revalida todo y crea el pedido PENDIENTE con su copia de precios. */
export async function confirmarAccion(_: EstadoCheckout, fd: FormData): Promise<EstadoCheckout> {
  const tenantId = await banda();
  let carrito: unknown = [];
  try {
    carrito = JSON.parse(String(fd.get("carrito") ?? "[]"));
  } catch {
    // carrito ilegible: queda vacío y la revisión lo dice
  }
  const campo = (n: string) => String(fd.get(n) ?? "");
  try {
    const pedido = await crearPedido(tienda, tenantId, leerCarrito(carrito), {
      nombre: campo("nombre"),
      email: campo("email"),
      telefono: campo("telefono"),
      calle: campo("calle"),
      numero: campo("numero"),
      piso: campo("piso"),
      ciudad: campo("ciudad"),
      provincia: campo("provincia"),
      codigoPostal: campo("codigoPostal"),
    });
    try {
      // El fan va directo a la pasarela de la banda, con el cobro creado con SUS credenciales.
      return { pedidoId: pedido.id, redireccion: await iniciarCobro(tienda, tenantId, pedido.id, await origen()) };
    } catch (e) {
      console.error(`[tienda] no se pudo crear el cobro del pedido ${pedido.id}: ${e instanceof Error ? e.message : e}`);
      return { pedidoId: pedido.id }; // el pedido queda PENDIENTE; desde su página se puede reintentar
    }
  } catch (e) {
    if (e instanceof ErrorCompra) return { problemas: e.problemas };
    if (e instanceof ErrorPasarela) return { problemas: [e.message] };
    throw e;
  }
}

/** Reintentar el pago de un pedido PENDIENTE (desde su página). */
export async function pagarAccion(pedidoId: string): Promise<{ redireccion?: string; error?: string }> {
  const tenantId = await banda();
  try {
    return { redireccion: await iniciarCobro(tienda, tenantId, pedidoId, await origen()) };
  } catch (e) {
    if (e instanceof ErrorPasarela) return { error: "No pudimos conectar con la pasarela de pago. Probá de nuevo en un rato." };
    throw e;
  }
}
