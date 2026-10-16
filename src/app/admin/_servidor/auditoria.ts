import type { Prisma } from "@/generated/prisma/client";
// Sirve tanto en una transacción de la conexión de administración como en una de
// conTenant (app, bajo RLS: ahí solo filas de esa banda).
type Tx = Prisma.TransactionClient;

/**
 * Registra una acción del back office. Va en la MISMA transacción que la acción: si la
 * acción se revierte, no queda registro; si queda la acción, queda su registro.
 */
export async function auditar(
  tx: Tx,
  fila: { usuarioId: string; tenantId?: string | null; accion: string; detalle?: Prisma.InputJsonValue },
) {
  await tx.auditoria.create({
    data: { usuarioId: fila.usuarioId, tenantId: fila.tenantId ?? null, accion: fila.accion, detalle: fila.detalle ?? {} },
  });
}

export type FiltroAuditoria = {
  /** Slug de la banda (exacto). */
  banda?: string;
  /** Prefijo de la acción ("banda.", "membresia.quitada"). */
  accion?: string;
  /** Email de quien la hizo (contiene). */
  quien?: string;
  pagina: number;
};

/** La auditoría de toda la plataforma (solo staff): 50 por página, la más nueva primero, filtrada en la base. */
export async function listarAuditoria(f: FiltroAuditoria) {
  const { dbAdmin } = await import("./db");
  const { POR_PAGINA, desde, literal, paginado } = await import("./listado");
  const db = dbAdmin();
  const tenant = f.banda ? await db.tenant.findUnique({ where: { slug: f.banda.toLowerCase() }, select: { id: true } }) : null;
  const usuarios = f.quien
    ? (await db.usuario.findMany({ where: { email: { contains: literal(f.quien), mode: "insensitive" } }, select: { id: true }, take: 100 })).map((u) => u.id)
    : null;
  const where: Prisma.AuditoriaWhereInput = {
    ...(f.banda ? { tenantId: tenant?.id ?? "00000000-0000-0000-0000-000000000000" } : {}),
    ...(f.accion ? { accion: { startsWith: f.accion } } : {}),
    ...(usuarios ? { usuarioId: { in: usuarios } } : {}),
  };
  const p = paginado(await db.auditoria.count({ where }), f.pagina);
  const filas = await db.auditoria.findMany({ where, orderBy: [{ fecha: "desc" }, { id: "desc" }], skip: desde(p.pagina), take: POR_PAGINA });
  const [personas, bandas] = await Promise.all([
    db.usuario.findMany({ where: { id: { in: [...new Set(filas.map((x) => x.usuarioId).filter((x): x is string => !!x))] } }, select: { id: true, email: true } }),
    db.tenant.findMany({ where: { id: { in: [...new Set(filas.map((x) => x.tenantId).filter((x): x is string => !!x))] } }, select: { id: true, slug: true, nombre: true } }),
  ]);
  const email = new Map(personas.map((x) => [x.id, x.email]));
  const banda = new Map(bandas.map((x) => [x.id, x]));
  return {
    filas: filas.map((x) => ({ ...x, quien: x.usuarioId ? (email.get(x.usuarioId) ?? x.usuarioId) : null, banda: x.tenantId ? (banda.get(x.tenantId) ?? null) : null })),
    ...p,
  };
}
