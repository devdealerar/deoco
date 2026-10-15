"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { exigirPlataforma, usuarioActivo } from "@/nucleo/acceso/panel";
import { confirmarRegistro, crearBandaPropia, ErrorAutogestion, solicitarRegistro } from "@/nucleo/autogestion";
import { ipDelVisitante } from "@/nucleo/publico/visitante";
import type { EstadoFormulario } from "@/ui";

/** La IP de quien pide (detrás de Cloudflare: CF-Connecting-IP). Solo para frenar abusos. */
async function ip() {
  return ipDelVisitante(await headers());
}
const campo = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function registrarseAccion(_: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  await exigirPlataforma();
  const email = campo(fd, "email").trim().toLowerCase();
  try {
    await solicitarRegistro(
      { nombre: campo(fd, "nombre"), email, contrasena: campo(fd, "contrasena"), repetida: campo(fd, "repetida"), trampa: campo(fd, "sitio_web") },
      await ip(),
    );
  } catch (e) {
    if (e instanceof ErrorAutogestion) return { error: e.message };
    throw e;
  }
  return { ok: `Te mandamos un mail a ${email}. Abrí el link que tiene para confirmar tu email y seguir (si no lo ves en unos minutos, revisá el spam).` };
}

/** El token del link (llega desde el navegador, nunca en la URL). true: cuenta creada. */
export async function confirmarAccion(token: string): Promise<boolean> {
  await exigirPlataforma();
  return (await confirmarRegistro(token)) !== null;
}

export async function crearBandaAccion(_: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  await exigirPlataforma();
  const usuarioId = await usuarioActivo();
  if (!usuarioId) redirect("/ingresar?volver=/registro/banda");
  let destino: string;
  try {
    destino = (await crearBandaPropia(usuarioId, { nombre: campo(fd, "nombre"), subdominio: campo(fd, "subdominio"), opcion: campo(fd, "opcion") || undefined }, await ip())).redireccion;
  } catch (e) {
    if (e instanceof ErrorAutogestion) return { error: e.message };
    throw e;
  }
  redirect(destino);
}
