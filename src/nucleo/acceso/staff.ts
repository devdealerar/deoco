// conStaff(): lo que el staff de Deoco escribe desde las rutas de módulos del back office
// (rutasAdmin), p. ej. el catálogo base de la tienda. Corre con la conexión de la app
// (deoco_app, sujeta a RLS): las tablas globales (deoco_tabla_global) solo aceptan
// escrituras en una transacción marcada como de staff, y la marca solo la pone esta función
// después de verificar al usuario. Toda llamada deja su fila en la auditoría.
import { notFound } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/nucleo/db/cliente";
import type { TxTenant } from "@/nucleo/db/con-tenant";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { usuarioDeSesion } from "./panel";

export class ErrorStaff extends Error {}

export type ContextoStaff = {
  usuarioId: string;
  /** Qué se hizo, para la auditoría (ids, nombres; nunca credenciales). */
  detalle(d: Prisma.InputJsonValue): void;
};

const ACCION = /^[a-z][a-z0-9-]*\.[a-z0-9_.-]+$/;

/** Como staff, `usuarioId` verificado. Fuera de un pedido (pruebas, scripts) o detrás de conStaff(). */
export async function conStaffComo<T>(
  usuarioId: string,
  accion: string,
  fn: (tx: TxTenant, ctx: ContextoStaff) => Promise<T>,
): Promise<T> {
  if (!ACCION.test(accion)) throw new ErrorStaff(`Acción de auditoría inválida: "${accion}" (modulo.accion).`);
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { esStaff: true } });
  if (!usuario?.esStaff) throw new ErrorStaff("Solo el staff de Deoco.");
  let detalle: Prisma.InputJsonValue = {};
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.staff', 'si', true)`;
    const r = await fn(tx, { usuarioId, detalle: (d) => void (detalle = d) });
    // createMany: INSERT sin RETURNING. La política solo deja insertar estas filas, no leerlas
    // (la auditoría la lee el back office con su conexión).
    await tx.auditoria.createMany({ data: [{ usuarioId, tenantId: null, accion, detalle }] });
    return r;
  });
}

/**
 * Como staff, el usuario de la sesión. Cualquier otro caso (sin sesión, no staff, host de
 * una banda) es 404, igual que /admin.
 */
export async function conStaff<T>(accion: string, fn: (tx: TxTenant, ctx: ContextoStaff) => Promise<T>): Promise<T> {
  if (await tenantDelPedido()) notFound();
  const usuarioId = await usuarioDeSesion();
  if (!usuarioId) notFound();
  try {
    return await conStaffComo(usuarioId, accion, fn);
  } catch (e) {
    if (e instanceof ErrorStaff && e.message === "Solo el staff de Deoco.") notFound();
    throw e;
  }
}
