"use server";

import { redirect } from "next/navigation";
import { exigirPlataforma, usuarioDeSesion } from "@/nucleo/acceso/panel";
import { cambiarClave, ErrorClave } from "@/nucleo/auth/clave";
import type { EstadoFormulario } from "@/ui";

export async function guardarClave(volver: string, _: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  await exigirPlataforma();
  const usuarioId = await usuarioDeSesion();
  if (!usuarioId) redirect("/ingresar?volver=/clave");
  try {
    await cambiarClave(usuarioId, String(fd.get("actual") ?? ""), String(fd.get("nueva") ?? ""), String(fd.get("repetida") ?? ""));
  } catch (e) {
    if (e instanceof ErrorClave) return { error: e.message };
    throw e;
  }
  redirect(volver.startsWith("/") && !volver.startsWith("//") ? volver : "/");
}
