"use server";

import type { EstadoFormulario } from "@/ui";
import { ErrorFormulario, email, texto } from "@/ui/servidor";
import { mensajeVerificacion } from "../../../_dominios/mensajes";
import { accionAdmin } from "../../_servidor/accion";
import {
  agregarDominio,
  cambiarEstado,
  cambiarRol,
  invitar,
  marcarPrincipal,
  quitarMiembro,
  verificarDominio,
} from "../../_servidor/bandas";
import { apagar, prender } from "../../_servidor/modulos";

export async function estadoAccion(tenantId: string, _: EstadoFormulario, fd: FormData) {
  return accionAdmin(async (staffId) => {
    await cambiarEstado(staffId, tenantId, String(fd.get("estado")), fd.get("confirmarArchivo") === "on");
    return "Estado actualizado.";
  });
}

export async function prenderAccion(tenantId: string, moduloId: string, _: EstadoFormulario) {
  return accionAdmin(async (staffId) => {
    await prender(staffId, tenantId, moduloId);
    return `"${moduloId}" prendido.`;
  });
}

export async function apagarAccion(tenantId: string, moduloId: string, _: EstadoFormulario) {
  return accionAdmin(async (staffId) => {
    await apagar(staffId, tenantId, moduloId);
    return `"${moduloId}" apagado.`;
  });
}

export async function dominioAccion(tenantId: string, _: EstadoFormulario, fd: FormData) {
  return accionAdmin(async (staffId) => {
    await agregarDominio(staffId, tenantId, texto(fd, "dominio", 253));
    return "Dominio registrado (sin verificar).";
  });
}

export async function verificarAccion(tenantId: string, dominioId: string, _: EstadoFormulario) {
  return accionAdmin(async (staffId) => {
    const m = mensajeVerificacion(await verificarDominio(staffId, tenantId, dominioId));
    if ("error" in m) throw new ErrorFormulario(m.error);
    return m.ok;
  });
}

export async function principalAccion(tenantId: string, dominioId: string, _: EstadoFormulario) {
  return accionAdmin(async (staffId) => {
    await marcarPrincipal(staffId, tenantId, dominioId);
    return "Dominio principal actualizado.";
  });
}

export async function invitarAccion(tenantId: string, _: EstadoFormulario, fd: FormData) {
  return accionAdmin(async (staffId) => {
    const correo = email(fd, "email");
    if (!correo) return "Falta el email.";
    const r = await invitar(staffId, tenantId, { email: correo, nombre: texto(fd, "nombre", 120), rol: String(fd.get("rol")) });
    return r.claveTemporal
      ? `${r.email} invitado. Clave temporal: ${r.claveTemporal} (se muestra una sola vez; la cambia al entrar).`
      : `${r.email} invitado: ya tenía usuario, entra con su clave.`;
  });
}

export async function rolAccion(tenantId: string, membresiaId: string, _: EstadoFormulario, fd: FormData) {
  return accionAdmin(async (staffId) => {
    await cambiarRol(staffId, tenantId, membresiaId, String(fd.get("rol")));
    return "Rol cambiado.";
  });
}

export async function quitarAccion(tenantId: string, membresiaId: string, _: EstadoFormulario, fd: FormData) {
  return accionAdmin(async (staffId) => {
    await quitarMiembro(staffId, tenantId, membresiaId, fd.get("confirmar") === "on");
    return "Quitado de la banda.";
  });
}
