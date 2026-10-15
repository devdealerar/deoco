"use server";

import type { EstadoFormulario } from "@/ui";
import { accionAdmin } from "../_servidor/accion";
import { reintentar } from "../_servidor/compras";

export async function reintentarAccion(tenantId: string, compraId: string, _: EstadoFormulario) {
  return accionAdmin(async (staffId) => {
    await reintentar(staffId, tenantId, compraId);
    return "Reintentado.";
  });
}
