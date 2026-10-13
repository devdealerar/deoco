// Cuentas externas: usuarios que no son de una banda sino de algo de un módulo (el proveedor
// de la tienda). Entran por app.<raiz>/portal/<modulo>; nunca ven un panel de banda (no
// tienen membresía). El núcleo no sabe qué es la "referencia": la interpreta el módulo.
//
// Lectura entre bandas: conCuentaExterna() marca la transacción con el módulo y la referencia
// (verificadas contra la tabla) y las políticas de SOLO LECTURA del módulo dejan ver las filas
// de esa referencia en cualquier banda (`app_referencia_externa('<modulo>')`). Nada más.
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { Prisma } from "@/generated/prisma/client";
import { claveTemporal } from "@/nucleo/auth/clave-temporal";
import { hashearContrasena } from "@/nucleo/auth/contrasena";
import { prisma } from "@/nucleo/db/cliente";
import type { TxTenant } from "@/nucleo/db/con-tenant";
import { registro as registroGlobal } from "@/nucleo/modulos";
import type { Modulo } from "@/nucleo/modulos/contrato";
import type { Registro } from "@/nucleo/modulos/registro";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { usuarioActivo } from "./panel";

export class ErrorCuentaExterna extends Error {}

function conCuentas(modulo: Modulo, reg: Registro) {
  if (reg.modulo(modulo.id) !== modulo) throw new ErrorCuentaExterna(`"${modulo.id}" no es un módulo registrado.`);
  if (!modulo.cuentasExternas) throw new ErrorCuentaExterna(`"${modulo.id}" no declara cuentasExternas.`);
}

/** Portales a los que entra el usuario (módulos registrados con cuentas externas). */
export async function portalesDe(usuarioId: string, reg: Registro = registroGlobal()) {
  const filas = await prisma.cuentaExterna.findMany({ where: { usuarioId }, select: { moduloId: true } });
  return filas.flatMap(({ moduloId }) => {
    const etiqueta = reg.modulo(moduloId)?.cuentasExternas?.etiqueta;
    return etiqueta ? [{ moduloId, etiqueta, href: `/portal/${moduloId}` }] : [];
  });
}

/** Referencia de la cuenta externa del usuario en ese módulo, o null. */
export async function referenciaExterna(usuarioId: string, moduloId: string): Promise<string | null> {
  const c = await prisma.cuentaExterna.findUnique({ where: { usuarioId_moduloId: { usuarioId, moduloId } }, select: { referencia: true } });
  return c?.referencia ?? null;
}

/**
 * Acceso a una página del portal (`/portal/<modulo>/...`). En un host de banda, o sin cuenta
 * externa en ese módulo: 404. Sin sesión: al login (y vuelve).
 */
export const accesoExterno = cache(async (moduloId: string, volver: string): Promise<{ usuarioId: string; referencia: string }> => {
  if (await tenantDelPedido()) notFound();
  const usuarioId = await usuarioActivo();
  if (!usuarioId) redirect(`/ingresar?volver=${encodeURIComponent(volver)}`);
  const referencia = await referenciaExterna(usuarioId, moduloId);
  if (!referencia) notFound();
  return { usuarioId, referencia };
});

/**
 * Corre `fn` en una transacción marcada con la cuenta externa del usuario en ese módulo: las
 * políticas de lectura del módulo dejan ver las filas de su referencia en todas las bandas.
 * No fija banda: las tablas de banda sin política externa no muestran nada.
 */
export async function conCuentaExterna<T>(
  usuarioId: string,
  modulo: Modulo,
  fn: (tx: TxTenant, referencia: string) => Promise<T>,
  reg: Registro = registroGlobal(),
): Promise<T> {
  conCuentas(modulo, reg);
  return prisma.$transaction(async (tx) => {
    const cuenta = await tx.cuentaExterna.findUnique({
      where: { usuarioId_moduloId: { usuarioId, moduloId: modulo.id } },
      select: { referencia: true },
    });
    if (!cuenta) throw new ErrorCuentaExterna("Este usuario no tiene cuenta externa en este módulo.");
    await tx.$executeRaw`SELECT set_config('app.externo_modulo', ${modulo.id}, true), set_config('app.externo_ref', ${cuenta.referencia}, true)`;
    return fn(tx, cuenta.referencia);
  });
}

export type CuentaExternaVista = { id: string; email: string; nombre: string; claveTemporal: boolean; creadoEn: Date };

/** Cuentas vinculadas a esa referencia (para el back office del módulo). */
export async function cuentasDeReferencia(modulo: Modulo, referencia: string, reg: Registro = registroGlobal()): Promise<CuentaExternaVista[]> {
  conCuentas(modulo, reg);
  const filas = await prisma.cuentaExterna.findMany({
    where: { moduloId: modulo.id, referencia },
    include: { usuario: { select: { email: true, nombre: true, claveTemporal: true } } },
    orderBy: { creadoEn: "asc" },
  });
  return filas.map((f) => ({ id: f.id, email: f.usuario.email, nombre: f.usuario.nombre, claveTemporal: f.usuario.claveTemporal, creadoEn: f.creadoEn }));
}

const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

async function exigirStaff(tx: TxTenant) {
  const [{ es }] = await tx.$queryRaw<{ es: boolean }[]>`SELECT app_es_staff() AS es`;
  if (!es) throw new ErrorCuentaExterna("Las cuentas externas las da el staff (conStaff).");
}

/**
 * Da acceso al portal del módulo. `tx`: una transacción de conStaff (queda auditada). Si el
 * email no tiene usuario, se crea con clave temporal (se devuelve para pasársela; la cambia
 * al entrar). Un usuario del staff no puede ser cuenta externa.
 */
export async function crearCuentaExterna(
  tx: TxTenant,
  modulo: Modulo,
  datos: { referencia: string; email: string; nombre: string; creadoPor: string },
  reg: Registro = registroGlobal(),
): Promise<{ email: string; claveTemporal: string | null }> {
  conCuentas(modulo, reg);
  await exigirStaff(tx);
  const email = datos.email.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) throw new ErrorCuentaExterna(`"${datos.email}" no es un email válido.`);
  if (!datos.referencia) throw new ErrorCuentaExterna("Falta la referencia.");
  let usuario = await tx.usuario.findUnique({ where: { email }, select: { id: true, esStaff: true } });
  let clave: string | null = null;
  if (usuario?.esStaff) throw new ErrorCuentaExterna(`${email} es del staff de Deoco: no puede ser una cuenta externa.`);
  if (!usuario) {
    const nombre = datos.nombre.trim();
    if (!nombre) throw new ErrorCuentaExterna(`No hay ningún usuario con el email ${email}: completá su nombre para crearlo.`);
    clave = claveTemporal();
    usuario = await tx.usuario.create({
      data: { email, nombre: nombre.slice(0, 120), hashContrasena: await hashearContrasena(clave), claveTemporal: true },
      select: { id: true, esStaff: true },
    });
  }
  try {
    // createMany: sin RETURNING (la política deja escribir al staff; leer, a todos).
    await tx.cuentaExterna.createMany({
      data: [{ usuarioId: usuario.id, moduloId: modulo.id, referencia: datos.referencia, creadoPor: datos.creadoPor }],
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ErrorCuentaExterna(`${email} ya tiene una cuenta en este portal.`);
    }
    throw e;
  }
  return { email, claveTemporal: clave };
}

/** Quita el acceso (el usuario queda, sin portal). `tx`: de conStaff. */
export async function quitarCuentaExterna(tx: TxTenant, modulo: Modulo, cuentaId: string, reg: Registro = registroGlobal()) {
  conCuentas(modulo, reg);
  await exigirStaff(tx);
  const { count } = await tx.cuentaExterna.deleteMany({ where: { id: cuentaId, moduloId: modulo.id } });
  if (count === 0) throw new ErrorCuentaExterna("Esa cuenta no existe en este módulo.");
}
