import type { EstadoTenant } from "@/generated/prisma/client";
import { prisma } from "@/nucleo/db/cliente";
import { conTenant } from "@/nucleo/db/con-tenant";

export type TenantResuelto = {
  id: string;
  slug: string;
  estado: EstadoTenant;
  /** Solo por host: el dominio principal de la banda (siempre verificado), si tiene. */
  principal?: string | null;
};

/**
 * Funciones SECURITY DEFINER: el único acceso sin tenant fijado (todavía no se
 * sabe cuál es). Devuelven solo el id; el resto se lee después bajo RLS.
 */
async function idPor(funcion: "host" | "slug", valor: string): Promise<string | null> {
  if (!valor) return null;
  const [fila] =
    funcion === "host"
      ? await prisma.$queryRaw<{ id: string | null }[]>`SELECT resolver_tenant_por_host(${valor}) AS id`
      : await prisma.$queryRaw<{ id: string | null }[]>`SELECT resolver_tenant_por_slug(${valor}) AS id`;
  return fila?.id ?? null;
}

async function cargar(id: string | null): Promise<TenantResuelto | null> {
  if (!id) return null;
  return conTenant(id, (tx) =>
    tx.tenant.findUnique({ where: { id }, select: { id: true, slug: true, estado: true } }),
  );
}

/** Sitio público: `labanda.deoco.com` o el dominio propio. Solo dominios verificados. Una consulta. */
export async function resolverTenantPorHost(host: string): Promise<TenantResuelto | null> {
  if (!host) return null;
  const [fila] = await prisma.$queryRaw<TenantResuelto[]>`
    SELECT id, slug, estado, principal FROM resolver_banda_por_host(${host})`;
  return fila ?? null;
}

/** Panel: `app.deoco.com/b/<slug>/...`. */
export async function resolverTenantPorSlug(slug: string): Promise<TenantResuelto | null> {
  return cargar(await idPor("slug", slug));
}
