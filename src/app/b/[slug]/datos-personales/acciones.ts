"use server";

import { revalidatePath } from "next/cache";
import { exigirTitular } from "@/nucleo/acceso/panel";
import { ErrorLegal } from "@/nucleo/legal";
import { resolverPedidoDeDatos } from "@/nucleo/legal/derechos";
import type { EstadoFormulario } from "@/ui";
import { texto } from "@/ui/servidor";

/** El titular responde un pedido sobre datos (también con la banda suspendida o archivada). */
export async function resolverPedidoAccion(slug: string, id: string, _: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const acceso = await exigirTitular(`/b/${slug}/datos-personales`);
  const estado = fd.get("estado") === "rechazado" ? "rechazado" : "resuelto";
  if (estado === "resuelto" && fd.get("confirmar") !== "on") return { error: "Confirmalo: se le manda la respuesta al fan (y si pidió borrar, se borra)." };
  try {
    const ok = await resolverPedidoDeDatos(acceso.tenantId, id, acceso.usuarioId, { estado, respuesta: texto(fd, "respuesta", 2000) });
    revalidatePath(`/b/${slug}/datos-personales`);
    return { ok };
  } catch (e) {
    if (e instanceof ErrorLegal) return { error: e.message };
    throw e;
  }
}
