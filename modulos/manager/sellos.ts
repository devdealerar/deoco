// Los sellos y sus personas (cuentas externas del módulo; las da el staff al vender el plan Sello).
import { crearCuentaExterna, cuentasDeReferencia, ErrorCuentaExterna, quitarCuentaExterna } from "@/nucleo/acceso/externas";
import type { ContextoStaff, LeerComoStaff } from "@/nucleo/acceso/staff";
import { prisma } from "@/nucleo/db/cliente";
import type { TxTenant } from "@/nucleo/db/con-tenant";
import manager from "./index";

export class ErrorManager extends Error {}
type ComoStaff = <T>(accion: string, fn: (tx: TxTenant, ctx: ContextoStaff) => Promise<T>) => Promise<T>;

export const sellos = () => prisma.managerSello.findMany({ orderBy: { nombre: "asc" } });

export async function crearSello(comoStaff: ComoStaff, nombre: string) {
  const n = nombre.trim().slice(0, 120);
  if (!n) throw new ErrorManager("Falta el nombre del sello o representante.");
  return comoStaff("manager.sello_creado", async (tx, ctx) => {
    const s = await tx.managerSello.create({ data: { nombre: n } });
    ctx.detalle({ selloId: s.id, nombre: n });
    return s;
  });
}

export const accesosDeSello = (leer: LeerComoStaff, selloId: string) => leer((tx) => cuentasDeReferencia(tx, manager, selloId));

export async function darAcceso(comoStaff: ComoStaff, selloId: string, datos: { email: string; nombre: string }) {
  return comoStaff("manager.acceso_creado", async (tx, ctx) => {
    const sello = await tx.managerSello.findUnique({ where: { id: selloId } });
    if (!sello) throw new ErrorManager("Ese sello no existe.");
    try {
      const r = await crearCuentaExterna(tx, manager, { referencia: sello.id, email: datos.email, nombre: datos.nombre, creadoPor: ctx.usuarioId });
      ctx.detalle({ selloId, sello: sello.nombre, email: r.email, usuarioNuevo: r.claveTemporal !== null });
      return r;
    } catch (e) {
      if (e instanceof ErrorCuentaExterna) throw new ErrorManager(e.message);
      throw e;
    }
  });
}

export async function quitarAcceso(comoStaff: ComoStaff, cuentaId: string) {
  return comoStaff("manager.acceso_quitado", async (tx, ctx) => {
    try {
      await quitarCuentaExterna(tx, manager, cuentaId);
      ctx.detalle({ cuentaId });
    } catch (e) {
      if (e instanceof ErrorCuentaExterna) throw new ErrorManager(e.message);
      throw e;
    }
  });
}
