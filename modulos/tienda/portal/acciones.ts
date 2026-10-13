"use server";

import { revalidatePath } from "next/cache";
import { accesoExterno } from "@/nucleo/acceso/externas";
import type { EstadoFormulario } from "@/ui";
import { ErrorFormulario, texto } from "@/ui/servidor";
import { despacharOrden, ErrorProveedor, saldarDeudas } from "../proveedor";

/** Toda acción del panel del proveedor: su cuenta externa (si no, 404) y errores como mensaje. */
async function accion(fn: (usuarioId: string) => Promise<string>): Promise<EstadoFormulario> {
  const { usuarioId } = await accesoExterno("tienda", "/portal/tienda");
  try {
    const ok = await fn(usuarioId);
    revalidatePath("/portal/tienda", "layout");
    return { ok };
  } catch (e) {
    if (e instanceof ErrorProveedor || e instanceof ErrorFormulario) return { error: e.message };
    throw e;
  }
}

export async function despacharAccion(ordenId: string, _: EstadoFormulario, fd: FormData) {
  return accion(async (usuarioId) => {
    await despacharOrden(usuarioId, ordenId, texto(fd, "seguimiento", 80));
    return "Orden despachada. Le avisamos al comprador por mail.";
  });
}

export async function saldarAccion(tenantId: string, _: EstadoFormulario, fd: FormData) {
  return accion(async (usuarioId) => {
    const ids = [...fd.keys()].filter((k) => k.startsWith("deuda-")).map((k) => k.slice("deuda-".length));
    const n = await saldarDeudas(usuarioId, tenantId, ids, texto(fd, "nota", 300));
    return n === 1 ? "1 deuda marcada saldada." : `${n} deudas marcadas saldadas.`;
  });
}
