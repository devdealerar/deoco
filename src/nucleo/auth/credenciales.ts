import { prisma } from "@/nucleo/db/cliente";
import { hashearContrasena, verificarContrasena } from "./contrasena";

// Se verifica contra un hash aunque el email no exista, para que el tiempo de
// respuesta no revele qué emails están registrados.
let hashDeRelleno: Promise<string> | undefined;

/** Email + contraseña → id del usuario, o null. `usuario` no tiene RLS (identidad global). */
export async function verificarCredenciales(
  email: string,
  contrasena: string,
): Promise<{ id: string } | null> {
  const usuario = await prisma.usuario.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, hashContrasena: true },
  });
  if (!usuario) {
    hashDeRelleno ??= hashearContrasena("relleno-para-tiempo-constante");
    await verificarContrasena(await hashDeRelleno, contrasena);
    return null;
  }
  const ok = await verificarContrasena(usuario.hashContrasena, contrasena);
  return ok ? { id: usuario.id } : null;
}
