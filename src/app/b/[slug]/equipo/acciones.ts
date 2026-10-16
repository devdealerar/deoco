"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cambiarRolEnEquipo, dejarLaBanda, ErrorEquipo, pasarTitularidad, quitarDelEquipo } from "@/nucleo/acceso/equipo";
import { accesoPanel, exigirTitular } from "@/nucleo/acceso/panel";
import type { EstadoFormulario } from "@/ui";

// Equipo (núcleo): lo maneja el titular; dejar la banda, cualquiera que sea parte. Abierto también
// con la cuota impaga (sacar a alguien o irse nunca se bloquea). La banda sale del pedido.
async function comoTitular(slug: string, fn: (c: { tenantId: string; usuarioId: string }) => Promise<string>): Promise<EstadoFormulario> {
  const volver = `/b/${slug}/equipo`;
  const acceso = await exigirTitular(volver);
  try {
    const ok = await fn({ tenantId: acceso.tenantId, usuarioId: acceso.usuarioId });
    revalidatePath(volver);
    return { ok };
  } catch (e) {
    if (e instanceof ErrorEquipo) return { error: e.message };
    throw e;
  }
}

export async function cambiarRolAccion(slug: string, membresiaId: string, _: EstadoFormulario, fd: FormData) {
  return comoTitular(slug, async (c) => {
    await cambiarRolEnEquipo(c.usuarioId, c.tenantId, membresiaId, String(fd.get("rol") ?? ""));
    return "Rol cambiado: vale desde su próximo movimiento.";
  });
}

export async function quitarAccion(slug: string, membresiaId: string, _: EstadoFormulario, fd: FormData) {
  return comoTitular(slug, async (c) => {
    if (fd.get("confirmar") !== "on") throw new ErrorEquipo("Para sacarla de la banda, confirmalo: pierde el acceso al panel.");
    await quitarDelEquipo(c.usuarioId, c.tenantId, membresiaId);
    return "Listo: ya no es parte de la banda.";
  });
}

export async function pasarTitularidadAccion(slug: string, membresiaId: string, _: EstadoFormulario, fd: FormData) {
  return comoTitular(slug, async (c) => {
    if (fd.get("confirmar") !== "on") throw new ErrorEquipo("Para pasarle la titularidad, confirmalo: vos quedás como editor.");
    await pasarTitularidad(c.usuarioId, c.tenantId, membresiaId);
    return "Titularidad pasada. Vos quedaste como editor.";
  });
}

export async function dejarAccion(slug: string, _: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const acceso = await accesoPanel(`/b/${slug}/equipo`);
  if (acceso.viaStaff) return { error: "Entraste como staff: no sos parte de esta banda." };
  if (fd.get("confirmar") !== "on") return { error: "Para dejar la banda, confirmalo: perdés el acceso a su panel." };
  try {
    await dejarLaBanda(acceso.usuarioId, acceso.tenantId);
  } catch (e) {
    if (e instanceof ErrorEquipo) return { error: e.message };
    throw e;
  }
  redirect("/");
}
