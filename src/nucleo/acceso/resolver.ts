import type { Rol } from "./roles";
import { conTenant } from "@/nucleo/db/con-tenant";
import { usuarioPropio } from "./usuario";

/** Quién es el usuario dentro de una banda, resuelto en cada pedido. */
export type Acceso = {
  usuarioId: string;
  tenantId: string;
  /** Rol de su membresía en esta banda; null si entra solo por ser staff. */
  rol: Rol | null;
  esStaff: boolean;
};

/** usuario + tenant → membresía → rol. null si no tiene membresía ni es staff. */
export async function resolverAcceso(usuarioId: string, tenantId: string): Promise<Acceso | null> {
  const usuario = await usuarioPropio(usuarioId);
  if (!usuario) return null;
  const membresia = await conTenant(tenantId, (tx) =>
    tx.membresia.findUnique({
      where: { usuarioId_tenantId: { usuarioId, tenantId } },
      select: { rol: true },
    }),
  );
  if (!membresia && !usuario.esStaff) return null;
  return { usuarioId, tenantId, rol: membresia?.rol ?? null, esStaff: usuario.esStaff };
}

/** Entra sin membresía, solo por ser staff de Deoco. */
export function esAccesoStaff(a: Acceso) {
  return a.esStaff && a.rol === null;
}
