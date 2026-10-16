import { prisma } from "@/nucleo/db/cliente";
import { hashearContrasena, verificarContrasena } from "./contrasena";

// Se verifica contra un hash aunque el email no exista, para que el tiempo de
// respuesta no revele qué emails están registrados.
let hashDeRelleno: Promise<string> | undefined;

/**
 * Email + contraseña → id del usuario, o null. Todavía no hay sesión: `usuario` tiene RLS, así
 * que se lee por usuario_para_ingresar(), que devuelve solo id y hash.
 */
export async function verificarCredenciales(
  email: string,
  contrasena: string,
): Promise<{ id: string } | null> {
  const [usuario] = await prisma.$queryRaw<{ id: string; hash: string }[]>`
    SELECT id, hash FROM usuario_para_ingresar(${email.trim().toLowerCase()})`;
  if (!usuario) {
    hashDeRelleno ??= hashearContrasena("relleno-para-tiempo-constante");
    await verificarContrasena(await hashDeRelleno, contrasena);
    return null;
  }
  const ok = await verificarContrasena(usuario.hash, contrasena);
  return ok ? { id: usuario.id } : null;
}

/** La versión de sesión vigente de una persona (null si no existe). Ver `jwt` en ./index.ts. */
export async function versionDeSesion(usuarioId: string): Promise<number | null> {
  if (!/^[0-9a-f-]{36}$/i.test(usuarioId)) return null;
  const [fila] = await prisma.$queryRaw<{ v: number | null }[]>`SELECT version_de_sesion(${usuarioId}::uuid) AS v`;
  return fila?.v ?? null;
}
