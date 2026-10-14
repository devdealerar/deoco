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
import { usuarioPropio } from "./usuario";

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
  const usuario = await usuarioPropio(usuarioId);
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
 * Lectura como staff, sin auditoría (no cambia nada): lo que solo el staff ve, como las personas
 * con acceso a un portal (cuentasDeReferencia). `usuarioId` verificado; fuera de un pedido.
 */
export async function leerComoStaffComo<T>(usuarioId: string, fn: (tx: TxTenant) => Promise<T>): Promise<T> {
  if (!(await usuarioPropio(usuarioId))?.esStaff) throw new ErrorStaff("Solo el staff de Deoco.");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.staff', 'si', true)`;
    return fn(tx);
  });
}

/** leerComoStaffComo() con el usuario de la sesión. No staff (o host de banda) → 404. */
export async function leerComoStaff<T>(fn: (tx: TxTenant) => Promise<T>): Promise<T> {
  if (await tenantDelPedido()) notFound();
  const usuarioId = await usuarioDeSesion();
  if (!usuarioId || !(await usuarioPropio(usuarioId))?.esStaff) notFound();
  return leerComoStaffComo(usuarioId, fn);
}

export type LeerComoStaff = typeof leerComoStaff;

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
