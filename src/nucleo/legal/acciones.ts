"use server";

import { cookies, headers } from "next/headers";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { origenDelPedido } from "@/nucleo/publico/origen";
import { mensajeParaElPublico } from "@/nucleo/publico/errores";
import { COOKIE_CONSENTIMIENTO, registrarConsentimiento, valorDeCookie } from "./cookies";
import { confirmarPedidoDeDatos, pedirSobreMisDatos } from "./derechos";
import { ErrorLegal } from "./index";

// Acciones del sitio público de la banda (anónimas): la banda sale del host del pedido.
async function bandaDelSitio() {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "publico") throw new Error("Solo en el sitio de una banda.");
  return ctx.tenantId;
}

/** El visitante decide sobre las cookies (aceptar, rechazar, configurar o cambiar). */
export async function decidirCookiesAccion(d: { analitica: boolean; marketing: boolean }): Promise<void> {
  const tenantId = await bandaDelSitio();
  const jar = await cookies();
  const c = await registrarConsentimiento(tenantId, jar.get(COOKIE_CONSENTIMIENTO)?.value, { analitica: !!d.analitica, marketing: !!d.marketing });
  const segura = (await headers()).get("x-forwarded-proto") === "https" || process.env.NODE_ENV === "production";
  jar.set(COOKIE_CONSENTIMIENTO, valorDeCookie(c), { path: "/", maxAge: 365 * 86_400, sameSite: "lax", httpOnly: false, secure: segura });
}

export type EstadoPedidoDatos = { ok?: string; error?: string };

/** El fan pide algo sobre sus datos desde el formulario del sitio. */
export async function pedirDatosAccion(_: EstadoPedidoDatos, fd: FormData): Promise<EstadoPedidoDatos> {
  try {
    const tenantId = await bandaDelSitio();
    const campo = (n: string) => String(fd.get(n) ?? "");
    await pedirSobreMisDatos(tenantId, { tipo: campo("tipo"), email: campo("email"), nombre: campo("nombre"), detalle: campo("detalle") }, await origenDelPedido());
    return { ok: "Listo. Te mandamos un mail: abrí el link para confirmar que el email es tuyo y el pedido empieza a correr." };
  } catch (e) {
    if (e instanceof ErrorLegal) return { error: e.message };
    return { error: mensajeParaElPublico(e, "pedido de datos") };
  }
}

/** El fan abrió el link del mail (el token llega desde el "#", nunca en la URL). */
export async function confirmarDatosAccion(token: string): Promise<{ codigo: string; vence: string; tipo: string } | null> {
  const tenantId = await bandaDelSitio();
  const r = await confirmarPedidoDeDatos(tenantId, token);
  return r ? { codigo: r.codigo, vence: r.venceEn.toISOString(), tipo: r.tipo } : null;
}
