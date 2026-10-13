"use server";

import type { EstadoFormulario } from "@/ui";
import { accionAdmin } from "../_servidor/accion";
import { reprocesar } from "../_servidor/eventos";

export async function reprocesarAccion(tenantId: string, eventoId: string, _: EstadoFormulario) {
  return accionAdmin(async (staffId) => {
    const estado = await reprocesar(staffId, tenantId, eventoId);
    return estado === "PROCESADO" ? "Reprocesado: entregado." : "Reprocesado, pero volvió a fallar.";
  });
}
