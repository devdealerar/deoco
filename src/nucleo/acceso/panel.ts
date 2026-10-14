// Helpers para Server Components, Route Handlers y Server Actions del panel.
// Cada pedido resuelve: sesión (solo id de usuario) + tenant del proxy → membresía → rol.
import { forbidden, notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { EstadoTenant } from "@/generated/prisma/client";
import { auth } from "@/nucleo/auth";
import { registro } from "@/nucleo/modulos";
import { modulosPrendidos } from "@/nucleo/modulos/encendido";
import { accesoTienePermiso } from "@/nucleo/permisos/puede";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { registrarAccesoStaff } from "./registro-staff";
import { type Acceso, esAccesoStaff, resolverAcceso } from "./resolver";
import { usuarioPropio } from "./usuario";

export type AccesoPanel = Acceso & { estado: EstadoTenant; viaStaff: boolean };

/** Id del usuario logueado, o null. La sesión no tiene nada más. */
export const usuarioDeSesion = cache(async (): Promise<string | null> => {
  return (await auth())?.user?.id ?? null;
});

/**
 * Usuario logueado y habilitado: si todavía tiene la clave temporal que le dio el staff,
 * lo manda a /clave (no usa nada hasta cambiarla). null si no hay sesión.
 */
export const usuarioActivo = cache(async (): Promise<string | null> => {
  const usuarioId = await usuarioDeSesion();
  if (!usuarioId) return null;
  const usuario = await usuarioPropio(usuarioId);
  if (!usuario) return null;
  if (usuario.claveTemporal) redirect("/clave");
  return usuarioId;
});

/** Rutas de la plataforma (selector, login, auth): 404 en los hosts de banda. */
export async function exigirPlataforma() {
  if ((await tenantDelPedido())?.superficie === "publico") notFound();
}

/**
 * Acceso al panel de la banda del pedido (`/b/<slug>/...`).
 * Sin sesión → login. Sin membresía (y sin ser staff) → 403.
 * `volver`: ruta a la que vuelve después del login.
 */
export const accesoPanel = cache(async (volver: string): Promise<AccesoPanel> => {
  const ctx = await tenantDelPedido();
  if (!ctx || ctx.superficie !== "panel") notFound();

  const usuarioId = await usuarioActivo();
  if (!usuarioId) redirect(`/ingresar?volver=${encodeURIComponent(volver)}`);

  const acceso = await resolverAcceso(usuarioId, ctx.tenantId);
  if (!acceso) forbidden();

  // Marca del proxy `soloTitular` (ruta de pago con la banda suspendida):
  // cualquier rol que no sea TITULAR → 403. El staff tampoco pasa.
  if (ctx.soloTitular && acceso.rol !== "TITULAR") forbidden();

  const viaStaff = esAccesoStaff(acceso);
  if (viaStaff) {
    await registrarAccesoStaff({ usuarioId, tenantId: ctx.tenantId, ruta: volver, fecha: new Date() });
  }
  return { ...acceso, estado: ctx.estado, viaStaff };
});

/** Módulos prendidos para la banda, una sola consulta por pedido. */
export const prendidosDelPedido = cache(modulosPrendidos);

/** Igual que puede(), pero con el acceso y los módulos ya resueltos en este pedido. */
async function tienePermiso(acceso: AccesoPanel, permiso: string): Promise<boolean> {
  const def = registro().permiso(permiso);
  if (!def || !(await prendidosDelPedido(acceso.tenantId)).has(def.moduloId)) return false;
  return accesoTienePermiso(acceso, def);
}

/** 403 si el usuario no tiene `permiso` en la banda del pedido (o su módulo está apagado). */
export async function exigirPermiso(permiso: string, volver: string): Promise<AccesoPanel> {
  const acceso = await accesoPanel(volver);
  if (!(await tienePermiso(acceso, permiso))) forbidden();
  return acceso;
}

/** Para mostrar u ocultar cosas según permiso, sin cortar el render. */
export async function puedeEnPedido(permiso: string, volver: string): Promise<boolean> {
  return tienePermiso(await accesoPanel(volver), permiso);
}

/** 403 salvo rol TITULAR. El staff no pasa. */
export async function exigirTitular(volver: string): Promise<AccesoPanel> {
  const acceso = await accesoPanel(volver);
  if (acceso.rol !== "TITULAR") forbidden();
  return acceso;
}
