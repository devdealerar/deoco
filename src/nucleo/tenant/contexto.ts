import { headers } from "next/headers";
import type { EstadoTenant } from "@/generated/prisma/client";
import { CABECERA } from "./cabeceras";
import type { Superficie } from "./reglas";

export type ContextoTenant = {
  tenantId: string;
  estado: EstadoTenant;
  superficie: Superficie;
  /** El proxy dejó pasar solo porque es la ruta de pago con el tenant suspendido. */
  soloTitular: boolean;
};

/** Tenant del pedido actual (Server Components, rutas, acciones). null si no hay. */
export async function tenantDelPedido(): Promise<ContextoTenant | null> {
  const h = await headers();
  const tenantId = h.get(CABECERA.tenantId);
  if (!tenantId) return null;
  return {
    tenantId,
    estado: h.get(CABECERA.estado) as EstadoTenant,
    superficie: h.get(CABECERA.superficie) as Superficie,
    soloTitular: h.get(CABECERA.soloTitular) === "1",
  };
}
