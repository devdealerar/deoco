"use server";

import { revalidatePath } from "next/cache";
import { exigirTitular } from "@/nucleo/acceso/panel";
import { pedirExportacion } from "@/nucleo/exportacion";
import type { EstadoFormulario } from "@/ui";

/** Pedir la exportación: sin trámite ni confirmación; solo el titular, en cualquier estado. */
export async function pedirExportacionAccion(slug: string, _: EstadoFormulario): Promise<EstadoFormulario> {
  const acceso = await exigirTitular(`/b/${slug}/exportar`);
  const r = await pedirExportacion(acceso.tenantId, acceso.usuarioId);
  revalidatePath(`/b/${slug}/exportar`);
  return { ok: r.yaEstaba ? "Ya hay una armándose: te avisamos por mail cuando esté." : "Listo: la estamos armando. Te avisamos por mail cuando esté (y aparece acá)." };
}
