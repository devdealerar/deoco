import type { EstadoTenant } from "@/generated/prisma/client";
import type { Rol } from "./roles";
import { prisma } from "@/nucleo/db/cliente";

export type BandaVisible = {
  tenantId: string;
  slug: string;
  nombre: string;
  estado: EstadoTenant;
  rol: Rol | null;
  /** El usuario la ve solo por ser staff de Deoco. */
  accesoStaff: boolean;
};

/** Bandas para el selector de app.<raiz>. Ver función SQL bandas_visibles. */
export async function bandasVisibles(usuarioId: string): Promise<BandaVisible[]> {
  const filas = await prisma.$queryRaw<
    { tenant_id: string; slug: string; nombre: string; estado: EstadoTenant; rol: Rol | null; acceso_staff: boolean }[]
  >`SELECT * FROM bandas_visibles(${usuarioId}::uuid)`;
  return filas.map((f) => ({
    tenantId: f.tenant_id,
    slug: f.slug,
    nombre: f.nombre,
    estado: f.estado,
    rol: f.rol,
    accesoStaff: f.acceso_staff,
  }));
}
