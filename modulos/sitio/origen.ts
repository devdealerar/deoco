import { conTenant } from "@/nucleo/db/con-tenant";

/** El sitio público de la banda (`https://labanda.com`), por su dominio principal. */
export async function origenPublico(tenantId: string): Promise<string | null> {
  const d = await conTenant(tenantId, (tx) => tx.dominio.findFirst({ where: { esPrincipal: true }, select: { dominio: true } }));
  if (!d) return null;
  return process.env.NODE_ENV === "production" ? `https://${d.dominio}` : `http://${d.dominio}:${process.env.PORT ?? 3000}`;
}
