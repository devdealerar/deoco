"use server";

import { conStaff } from "@/nucleo/acceso/staff";
import type { EstadoFormulario } from "@/ui";

/** Acción de staff de ejemplo: corre marcada como staff y deja su fila en la auditoría. */
export async function probarStaff(_: EstadoFormulario): Promise<EstadoFormulario> {
  const marcada = await conStaff("prueba.staff_probado", async (tx, ctx) => {
    const [{ staff }] = await tx.$queryRaw<{ staff: boolean }[]>`SELECT app_es_staff() AS staff`;
    ctx.detalle({ staff });
    return staff;
  });
  return { ok: marcada ? "La transacción corrió como staff." : "No corrió como staff." };
}
