import type { EstadoTenant } from "@/generated/prisma/client";
import { prisma } from "@/nucleo/db/cliente";
import { conTenant } from "@/nucleo/db/con-tenant";

export type TenantResuelto = { id: string; estado: EstadoTenant };

/**
 * Host → tenant. Primero `resolver_tenant_por_host` (único acceso a `dominio`
 * sin tenant fijado, devuelve solo el id); después el estado, ya bajo RLS.
 */
export async function resolverTenantPorHost(host: string): Promise<TenantResuelto | null> {
  if (!host) return null;
  const [fila] = await prisma.$queryRaw<{ id: string | null }[]>`
    SELECT resolver_tenant_por_host(${host}) AS id`;
  if (!fila?.id) return null;
  const id = fila.id;
  const tenant = await conTenant(id, (tx) =>
    tx.tenant.findUnique({ where: { id }, select: { id: true, estado: true } }),
  );
  return tenant;
}
