"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { exigirTitular } from "@/nucleo/acceso/panel";
import { ErrorPasarela } from "@/nucleo/pagos";
import type { EstadoFormulario } from "@/ui";
import { comprarComplemento } from "../complementos";
import { cancelar, elegirPlan, ErrorComercial } from "../cuenta";

/** Plan y pago: solo el titular (ni otro rol ni el staff); la banda sale del pedido. */
async function comoTitular(slug: string, fn: (tenantId: string, usuarioId: string) => Promise<string | { redireccion: string }>): Promise<EstadoFormulario> {
  const volver = `/b/${slug}/pago`;
  const acceso = await exigirTitular(volver);
  let r;
  try {
    r = await fn(acceso.tenantId, acceso.usuarioId);
  } catch (e) {
    if (e instanceof ErrorComercial) return { error: e.message };
    if (e instanceof ErrorPasarela) {
      console.error(`[comercial] pasarela de la cuota (${acceso.tenantId}):`, e.message);
      return { error: "No pudimos conectar con Mercado Pago. Probá de nuevo en un rato." };
    }
    throw e;
  }
  // A la pasarela de Deoco, desde el servidor (fuera del try: redirect() lanza).
  if (typeof r !== "string") redirect(r.redireccion);
  revalidatePath(`/b/${slug}`, "layout");
  return { ok: r };
}

export async function elegirPlanAccion(slug: string, planId: string, _: EstadoFormulario, _fd: FormData) {
  return comoTitular(slug, async (tenantId) => {
    const r = await elegirPlan(tenantId, slug, planId);
    return "mensaje" in r ? r.mensaje : r;
  });
}

export async function cancelarAccion(slug: string, _: EstadoFormulario, fd: FormData) {
  return comoTitular(slug, async (tenantId) => {
    if (fd.get("confirmar") !== "on") throw new ErrorComercial("Para cancelar, confirmalo: marcá la casilla de arriba del botón.");
    return cancelar(tenantId);
  });
}

/** Comprar un complemento suelto para un mes: a la pasarela de Deoco (pago único). */
export async function comprarComplementoAccion(slug: string, complementoId: string, _: EstadoFormulario, fd: FormData) {
  return comoTitular(slug, (tenantId, usuarioId) => comprarComplemento(tenantId, slug, complementoId, String(fd.get("mes") ?? ""), usuarioId));
}
