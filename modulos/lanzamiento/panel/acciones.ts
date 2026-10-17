"use server";

import { redirect } from "next/navigation";
import { accionesDelPanel } from "@/nucleo/acceso/acciones";
import { ErrorArchivo } from "@/nucleo/archivos";
import type { EstadoFormulario } from "@/ui";
import { archivo, ErrorFormulario, obligatorio, texto } from "@/ui/servidor";
import lanzamiento from "../index";
import { cancelarCampania, crearCampania, ErrorLanzamiento, marcarHito, moverFecha, subirPieza, terminarCampania } from "../campanias";

const conEdicion = accionesDelPanel(() => lanzamiento, [ErrorLanzamiento, ErrorFormulario, ErrorArchivo]);

export async function crearCampaniaAccion(slug: string, _: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  let id = "";
  const r = await conEdicion(slug, async ({ tenantId, usuarioId }) => {
    id = await crearCampania(tenantId, usuarioId, { titulo: obligatorio(fd, "titulo", "el nombre", 120), tipo: texto(fd, "tipo", 20), fecha: obligatorio(fd, "fecha", "la fecha", 10) });
  });
  if (r.error) return r;
  redirect(`/b/${slug}/lanzamientos/${id}`);
}

export async function moverFechaAccion(slug: string, id: string, _: EstadoFormulario, fd: FormData) {
  return conEdicion(slug, async ({ tenantId, usuarioId }) => {
    const dias = await moverFecha(tenantId, usuarioId, id, obligatorio(fd, "fecha", "la fecha", 10));
    return dias === 0 ? "La fecha no cambió." : `Fecha movida ${Math.abs(dias)} ${Math.abs(dias) === 1 ? "día" : "días"} ${dias > 0 ? "para adelante" : "para atrás"}: todos los hitos se corrieron lo mismo.`;
  });
}

export async function marcarHitoAccion(slug: string, hitoId: string, hecho: boolean, _: EstadoFormulario) {
  return conEdicion(slug, async ({ tenantId, usuarioId }) => {
    await marcarHito(tenantId, usuarioId, hitoId, hecho);
    return hecho ? "Hecho." : "Vuelve a pendiente.";
  });
}

export async function subirPiezaAccion(slug: string, piezaId: string, _: EstadoFormulario, fd: FormData) {
  return conEdicion(slug, async ({ tenantId }) => {
    const f = archivo(fd, "archivo");
    if (!f) throw new ErrorFormulario("Elegí la imagen.");
    const r = await subirPieza(tenantId, piezaId, { nombre: f.name, datos: Buffer.from(await f.arrayBuffer()) }, lanzamiento.id);
    return r.conforme ? `Subida: ${r.ancho}×${r.alto}, cumple la medida.` : `Subida, pero no cumple la medida (${r.ancho}×${r.alto}): queda marcada "no conforme". La campaña sigue.`;
  });
}

export async function cancelarCampaniaAccion(slug: string, id: string, _: EstadoFormulario, fd: FormData) {
  if (fd.get("confirmar") !== "on") return { error: "Para cancelarla, confirmalo." };
  return conEdicion(slug, async ({ tenantId, usuarioId }) => {
    await cancelarCampania(tenantId, usuarioId, id);
    return "Campaña cancelada: queda archivada, con sus piezas y archivos.";
  });
}

export async function terminarCampaniaAccion(slug: string, id: string, _: EstadoFormulario) {
  return conEdicion(slug, async ({ tenantId, usuarioId }) => {
    await terminarCampania(tenantId, usuarioId, id);
    return "Campaña terminada.";
  });
}
