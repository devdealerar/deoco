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

/** Sitio público: `labanda.deoco.com` o el dominio propio. Solo dominios verificados. */
export async function resolverTenantPorHost(host: string): Promise<TenantResuelto | null> {
  const id = await idPor("host", host);
  if (!id) return null;
  return conTenant(id, async (tx) => {
    const t = await tx.tenant.findUnique({ where: { id }, select: { id: true, slug: true, estado: true } });
    if (!t) return null;
    const principal = await tx.dominio.findFirst({ where: { esPrincipal: true }, select: { dominio: true } });
    return { ...t, principal: principal?.dominio ?? null };
  });
}

/** Panel: `app.deoco.com/b/<slug>/...`. */
export async function resolverTenantPorSlug(slug: string): Promise<TenantResuelto | null> {
  return cargar(await idPor("slug", slug));
}
