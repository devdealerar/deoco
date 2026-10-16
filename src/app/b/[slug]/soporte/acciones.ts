"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { usuarioActivo } from "@/nucleo/acceso/panel";
import { ErrorSoporte, iniciarSoporte, terminarSoporte } from "@/nucleo/acceso/soporte";
import { usuarioPropio } from "@/nucleo/acceso/usuario";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import type { EstadoFormulario } from "@/ui";

/** Solo el staff, en el panel de una banda (la banda sale del pedido, nunca del formulario). */
async function comoStaff() {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "panel") notFound();
  const usuarioId = await usuarioActivo();
  if (!usuarioId || !(await usuarioPropio(usuarioId))?.esStaff) notFound();
  return { usuarioId, tenantId: ctx.tenantId };
}

const destino = (slug: string, volver: string) => (volver.startsWith(`/b/${slug}`) && !volver.startsWith(`/b/${slug}/soporte`) ? volver : `/b/${slug}`);

export async function iniciarSoporteAccion(slug: string, volver: string, _: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const { usuarioId, tenantId } = await comoStaff();
  try {
    await iniciarSoporte(usuarioId, tenantId, String(fd.get("motivo") ?? ""), Number(fd.get("minutos")));
  } catch (e) {
    if (e instanceof ErrorSoporte) return { error: e.message };
    throw e;
  }
  // El marco (layout) ya estaba dibujado sin la sesión: se rehace para que muestre el aviso.
  revalidatePath(`/b/${slug}`, "layout");
  redirect(destino(slug, volver));
}

export async function terminarSoporteAccion(slug: string, _: EstadoFormulario): Promise<EstadoFormulario> {
  const { usuarioId, tenantId } = await comoStaff();
  await terminarSoporte(usuarioId, tenantId);
  revalidatePath(`/b/${slug}`, "layout");
  redirect(`/b/${slug}/soporte`);
}
