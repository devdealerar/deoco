"use server";

import { exigirPermiso } from "@/nucleo/acceso/panel";
import { emitir } from "@/nucleo/eventos/bus";

/** Emite el evento de ejemplo. El usuario recibe la respuesta sin esperar al suscripto. */
export async function emitirVerificacion(slug: string) {
  const acceso = await exigirPermiso("prueba.contenido.ver", `/b/${slug}/prueba`);
  await emitir("prueba.verificada", acceso.tenantId, { desde: "panel" }, acceso.usuarioId);
}
