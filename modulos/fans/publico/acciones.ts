"use server";

import { mensajeParaElPublico } from "@/nucleo/publico/errores";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { confirmarSuscripcion, darDeBaja, ErrorFans, pedirSuscripcion } from "../contactos";

/** Solo en el sitio público de una banda: la banda sale del host, nunca del navegador. */
async function banda(): Promise<string> {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "publico") throw new Error("Solo en el sitio de una banda.");
  return ctx.tenantId;
}

export type EstadoSuscripcion = { ok?: boolean; error?: string; email?: string; nombre?: string };

export async function suscribirseAccion(_: EstadoSuscripcion, fd: FormData): Promise<EstadoSuscripcion> {
  const tenantId = await banda();
  // Con un error, lo escrito vuelve al formulario (React lo vacía al terminar la acción).
  const escrito = { email: String(fd.get("email") ?? "").slice(0, 200), nombre: String(fd.get("nombre") ?? "").slice(0, 120) };
  // La casilla va sin marcar: sin ella no hay consentimiento (art. 5 de la Ley 25.326).
  if (fd.get("acepto") !== "si") return { ...escrito, error: "Para suscribirte, marcá la casilla." };
  try {
    await pedirSuscripcion(tenantId, { email: String(fd.get("email") ?? ""), nombre: String(fd.get("nombre") ?? ""), origen: "formulario" });
    // La misma respuesta esté o no en la base: no se revela quién está suscripto.
    return { ok: true };
  } catch (e) {
    if (e instanceof ErrorFans) return { ...escrito, error: e.message };
    return { ...escrito, error: mensajeParaElPublico(e, "fans: suscripción") };
  }
}

export async function confirmarAccion(token: string): Promise<boolean> {
  return confirmarSuscripcion(await banda(), token);
}

export async function bajaAccion(entregaId: string | null, token: string): Promise<boolean> {
  return darDeBaja(await banda(), token, entregaId ?? undefined);
}
