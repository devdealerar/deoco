"use server";

import { revalidatePath } from "next/cache";
import { exigirTitular } from "@/nucleo/acceso/panel";
import { ErrorSecreto } from "@/nucleo/secretos";
import { borrarSecreto, guardarSecreto } from "@/nucleo/secretos/carga";
import type { EstadoFormulario } from "@/ui";

/** Solo el titular; la banda sale del pedido. El valor nunca vuelve en la respuesta. */
async function comoTitular(slug: string, fn: (usuarioId: string, tenantId: string) => Promise<string>): Promise<EstadoFormulario> {
  const volver = `/b/${slug}/credenciales`;
  const acceso = await exigirTitular(volver);
  try {
    const ok = await fn(acceso.usuarioId, acceso.tenantId);
    revalidatePath(volver);
    return { ok };
  } catch (e) {
    if (e instanceof ErrorSecreto) return { error: e.message };
    throw e;
  }
}

export async function guardarAccion(slug: string, moduloId: string, clave: string, _: EstadoFormulario, fd: FormData) {
  return comoTitular(slug, async (usuarioId, tenantId) => {
    await guardarSecreto(usuarioId, tenantId, moduloId, clave, String(fd.get("valor") ?? ""));
    return "Guardada.";
  });
}

export async function borrarAccion(slug: string, moduloId: string, clave: string, _: EstadoFormulario, fd: FormData) {
  return comoTitular(slug, async (usuarioId, tenantId) => {
    if (fd.get("confirmar") !== "on") throw new ErrorSecreto("Para borrarla, confirmalo: el módulo deja de poder usarla.");
    await borrarSecreto(usuarioId, tenantId, moduloId, clave);
    return "Borrada.";
  });
}
