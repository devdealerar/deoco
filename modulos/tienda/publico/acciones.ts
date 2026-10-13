"use server";

import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import tienda from "../index";
import { crearPedido, ErrorCompra, leerCarrito, revisarCarrito, type Revision } from "../pedidos";
import { pasarelaLista } from "../pasarelas";

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

export type EstadoCheckout = { problemas?: string[]; pedidoId?: string };

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
    return { pedidoId: pedido.id };
  } catch (e) {
    if (e instanceof ErrorCompra) return { problemas: e.problemas };
    throw e;
  }
}
