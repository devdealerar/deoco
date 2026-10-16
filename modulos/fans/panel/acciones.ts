"use server";

import { redirect } from "next/navigation";
import { accionesDelPanel } from "@/nucleo/acceso/acciones";
import { puedeEnPedido } from "@/nucleo/acceso/panel";
import type { EstadoFormulario } from "@/ui";
import { ErrorFormulario, obligatorio } from "@/ui/servidor";
import fans from "../index";
import { bajaDesdeElPanel, ErrorFans } from "../contactos";
import { cancelarEnvio, guardarBorrador, mandarEnvio } from "../envios";

const conEdicion = accionesDelPanel(() => fans, [ErrorFans, ErrorFormulario]);

const datos = (fd: FormData) => ({ asunto: obligatorio(fd, "asunto", "el asunto", 150), cuerpo: obligatorio(fd, "cuerpo", "el texto", 20000) });

export async function crearEnvioAccion(slug: string, _: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  let id = "";
  const r = await conEdicion(slug, async ({ tenantId, usuarioId }) => {
    id = await guardarBorrador(tenantId, usuarioId, datos(fd));
    return "Borrador guardado.";
  });
  if (r.error) return r;
  redirect(`/b/${slug}/fans/envios/${id}`);
}

export async function guardarEnvioAccion(slug: string, id: string, _: EstadoFormulario, fd: FormData) {
  return conEdicion(slug, async ({ tenantId, usuarioId }) => {
    await guardarBorrador(tenantId, usuarioId, { id, ...datos(fd) });
    return "Borrador guardado.";
  });
}

export async function mandarEnvioAccion(slug: string, id: string, _: EstadoFormulario, fd: FormData) {
  if (fd.get("confirmar") !== "on") return { error: "Para mandarlo, confirmalo: un envío no se puede deshacer." };
  return conEdicion(slug, async ({ tenantId, usuarioId }) => {
    const { destinatarios } = await mandarEnvio(tenantId, id, usuarioId);
    return `Saliendo a ${destinatarios} ${destinatarios === 1 ? "suscripto" : "suscriptos"}.`;
  });
}

export async function cancelarEnvioAccion(slug: string, id: string, _: EstadoFormulario) {
  return conEdicion(slug, async ({ tenantId, usuarioId }) => {
    await cancelarEnvio(tenantId, id, usuarioId);
    return "Cancelado: lo que no salió, ya no sale.";
  });
}

/** Dar de baja a alguien que lo pidió por otro medio. Ver la base es del titular. */
export async function bajaContactoAccion(slug: string, contactoId: string, _: EstadoFormulario) {
  if (!(await puedeEnPedido("fans.contactos.ver", `/b/${slug}/fans`))) return { error: "Tu rol no puede ver la base de fans." };
  return conEdicion(slug, async ({ tenantId, usuarioId }) => {
    await bajaDesdeElPanel(tenantId, contactoId, usuarioId);
    return "Dado de baja del newsletter.";
  });
}
