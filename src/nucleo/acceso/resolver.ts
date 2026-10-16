import type { Rol } from "./roles";
import { conTenant } from "@/nucleo/db/con-tenant";
import { sesionDeSoporte, type SesionDeSoporte } from "./soporte";
import { usuarioPropio } from "./usuario";

/** Quién es el usuario dentro de una banda, resuelto en cada pedido. */
export type Acceso = {
  usuarioId: string;
  tenantId: string;
  /** Rol de su membresía en esta banda; null si entra solo por ser staff. */
  rol: Rol | null;
  esStaff: boolean;
  /**
   * Staff sin membresía: su sesión de soporte vigente (D3). Sin ella, el staff no tiene ningún
   * permiso en la banda; con ella, los de GESTOR (nunca la plata ni el control de la cuenta).
   */
  soporte: SesionDeSoporte | null;
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
  const soporte = !membresia && usuario.esStaff ? await sesionDeSoporte(usuarioId, tenantId) : null;
  return { usuarioId, tenantId, rol: membresia?.rol ?? null, esStaff: usuario.esStaff, soporte };
}

/** Entra sin membresía, solo por ser staff de Deoco. */
export function esAccesoStaff(a: Acceso) {
  return a.esStaff && a.rol === null;
}
