"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ErrorEquipo } from "@/nucleo/acceso/equipo";
import { responderInvitacion } from "@/nucleo/acceso/invitaciones";
import { usuarioActivo } from "@/nucleo/acceso/panel";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import type { EstadoFormulario } from "@/ui";

// Aceptar o rechazar una invitación, desde el selector de bandas (app.<raiz>, con sesión).
export async function responderInvitacionAccion(tenantId: string, invitacionId: string, acepta: boolean, _: EstadoFormulario): Promise<EstadoFormulario> {
  if ((await tenantDelPedido())?.superficie === "publico") return { error: "Solo en Deoco." };
  const usuarioId = await usuarioActivo();
  if (!usuarioId) redirect("/ingresar");
  try {
    await responderInvitacion(usuarioId, tenantId, invitacionId, acepta);
  } catch (e) {
    if (e instanceof ErrorEquipo) return { error: e.message };
    throw e;
  }
  revalidatePath("/");
  return { ok: acepta ? "Listo: ya sos parte de la banda." : "Invitación rechazada." };
}
