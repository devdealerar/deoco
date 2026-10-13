import { headers } from "next/headers";
import type { EstadoTenant } from "@/generated/prisma/client";
import { CABECERA } from "./cabeceras";

export type ContextoTenant = {
  tenantId: string;
  estado: EstadoTenant;
  /** El proxy dejó pasar solo porque es una ruta de pago con el tenant suspendido. */
  soloTitular: boolean;
};

/** Tenant del pedido actual (Server Components, rutas, acciones). null en app.<raiz>. */
export async function tenantDelPedido(): Promise<ContextoTenant | null> {
  const h = await headers();
  const tenantId = h.get(CABECERA.tenantId);
  if (!tenantId) return null;
  return {
    tenantId,
    estado: h.get(CABECERA.estado) as EstadoTenant,
    soloTitular: h.get(CABECERA.soloTitular) === "1",
  };
}
