"use server";

import { revalidatePath } from "next/cache";
import { exigirTitular } from "@/nucleo/acceso/panel";
import { devolverPagoDeLaBanda, ErrorPasarela, marcarPagoDevuelto } from "@/nucleo/pagos";
import type { EstadoFormulario } from "@/ui";
import { texto } from "@/ui/servidor";

// Pagos para devolver: solo el titular, en cualquier estado de la banda (también en solo
// lectura o archivada: es plata de un comprador). La banda sale del pedido, nunca del formulario.
async function comoTitular(slug: string, fn: (c: { tenantId: string; usuarioId: string }) => Promise<EstadoFormulario>): Promise<EstadoFormulario> {
  const volver = `/b/${slug}/devoluciones`;
  const acceso = await exigirTitular(volver);
  try {
    const r = await fn({ tenantId: acceso.tenantId, usuarioId: acceso.usuarioId });
    revalidatePath(volver);
    return r;
  } catch (e) {
    if (e instanceof ErrorPasarela) return { error: e.message };
    throw e;
  }
}

export async function devolverAccion(slug: string, id: string, _: EstadoFormulario, fd: FormData) {
  return comoTitular(slug, async (c) => {
    if (fd.get("confirmar") !== "on") return { error: "Para devolverlo, confirmalo: la plata sale de tu cuenta." };
    const r = await devolverPagoDeLaBanda(c.tenantId, id, c.usuarioId);
    return { ok: r.hecha ? "Devuelto: la plata volvió desde tu cuenta al comprador." : "Pedido a la pasarela: la devolución está en proceso." };
  });
}

export async function marcarAccion(slug: string, id: string, _: EstadoFormulario, fd: FormData) {
  return comoTitular(slug, async (c) => {
    await marcarPagoDevuelto(c.tenantId, id, c.usuarioId, texto(fd, "nota", 300));
    return { ok: "Marcado como resuelto." };
  });
}
