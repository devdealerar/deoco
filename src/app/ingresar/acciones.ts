"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { exigirPlataforma } from "@/nucleo/acceso/panel";
import { signIn, signOut } from "@/nucleo/auth";

/** Solo rutas internas: evita redirecciones abiertas a otros sitios. */
function destinoSeguro(volver: FormDataEntryValue | null) {
  return typeof volver === "string" && volver.startsWith("/") && !volver.startsWith("//") ? volver : "/";
}

export async function ingresar(form: FormData) {
  await exigirPlataforma();
  const volver = destinoSeguro(form.get("volver"));
  try {
    await signIn("credentials", {
      email: form.get("email"),
      contrasena: form.get("contrasena"),
      redirectTo: volver,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      redirect(`/ingresar?error=1&volver=${encodeURIComponent(volver)}`);
    }
    throw e; // la redirección de éxito de signIn también viaja como excepción
  }
}

export async function salir() {
  await exigirPlataforma();
  await signOut({ redirectTo: "/ingresar" });
}
