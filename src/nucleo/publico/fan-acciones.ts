"use server";

import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { origenDelPedido } from "./origen";
import { canjearLinkDelFan, cerrarSesionDelFan, pedirLinkDelFan, recordarSesionDelFan } from "./fan";

// Acciones de /mis-compras (anónimas): la banda sale del host del pedido.
async function bandaDelSitio() {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "publico") throw new Error("Solo en el sitio de una banda.");
  return ctx.tenantId;
}

export type EstadoLinkFan = { ok?: boolean; error?: string; email?: string };

export async function pedirLinkAccion(_: EstadoLinkFan, fd: FormData): Promise<EstadoLinkFan> {
  const tenantId = await bandaDelSitio();
  const email = String(fd.get("email") ?? "").slice(0, 200);
  if (!email.trim()) return { error: "Poné tu email.", email };
  await pedirLinkDelFan(tenantId, email, await origenDelPedido());
  // La misma respuesta tenga o no compras: no se revela qué emails compraron.
  return { ok: true };
}

export async function canjearLinkAccion(token: string): Promise<boolean> {
  const sesion = await canjearLinkDelFan(await bandaDelSitio(), token);
  if (!sesion) return false;
  await recordarSesionDelFan(sesion);
  return true;
}

export async function salirAccion(): Promise<void> {
  await cerrarSesionDelFan(await bandaDelSitio());
}
