"use server";

import { accesoRecordado, recordarAcceso } from "@/nucleo/publico/acceso";
import { mensajeParaElPublico } from "@/nucleo/publico/errores";
import { origenDelPedido } from "@/nucleo/publico/origen";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import tienda from "../index";
import { tieneAcceso } from "../acceso";
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
  try {
    const [revision, { lista }] = [await revisarCarrito(tenantId, leerCarrito(crudo)), await pasarelaLista(tienda, tenantId)];
    return { ...revision, disponible: lista };
  } catch (e) {
    // Sin revisión no se puede seguir: el fan ve la frase, no el error.
    return { lineas: [], problemas: [mensajeParaElPublico(e, "tienda: carrito")], subtotal: 0, envio: 0, envios: [], total: 0, disponible: false };
  }
}

export type EstadoCheckout = { problemas?: string[]; pedidoId?: string; redireccion?: string };

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
    // Este navegador queda con acceso al pedido: al volver de la pasarela lo ve y puede pagarlo.
    await recordarAcceso(`pedido-${pedido.id}`, pedido.token);
    try {
      // El fan va directo a la pasarela de la banda, con el cobro creado con SUS credenciales.
      return { pedidoId: pedido.id, redireccion: await iniciarCobro(tienda, tenantId, pedido.id, await origenDelPedido()) };
    } catch (e) {
      console.error(`[tienda] no se pudo crear el cobro del pedido ${pedido.id}: ${e instanceof Error ? e.message : e}`);
      return { pedidoId: pedido.id }; // el pedido queda PENDIENTE; desde su página se puede reintentar
    }
  } catch (e) {
    if (e instanceof ErrorCompra) return { problemas: e.problemas };
    // La banda no puede cobrar (sin cuenta conectada): el fan no tiene por qué saber más.
    if (e instanceof ErrorPasarela) return { problemas: ["La tienda no está recibiendo pedidos en este momento. Probá más tarde."] };
    return { problemas: [mensajeParaElPublico(e, "tienda: checkout")] };
  }
}

/** Reintentar el pago de un pedido PENDIENTE (desde su página). */
export async function pagarAccion(pedidoId: string): Promise<{ redireccion?: string; error?: string }> {
  const tenantId = await banda();
  if (!(await tieneAcceso(tenantId, pedidoId, await accesoRecordado(`pedido-${pedidoId}`)))) {
    return { error: "Para pagar este pedido, abrí el link que te mandamos por mail." };
  }
  try {
    return { redireccion: await iniciarCobro(tienda, tenantId, pedidoId, await origenDelPedido()) };
  } catch (e) {
    if (e instanceof ErrorPasarela) return { error: "No pudimos abrir el pago. Probá de nuevo en un rato: no se te cobró nada." };
    return { error: mensajeParaElPublico(e, "tienda: pagar") };
  }
}

/** Canjea el token del link del mail por el acceso en este navegador. */
export async function canjearPedidoAccion(pedidoId: string, token: string): Promise<boolean> {
  const tenantId = await banda();
  if (!(await tieneAcceso(tenantId, pedidoId, token))) return false;
  await recordarAcceso(`pedido-${pedidoId}`, token);
  return true;
}
