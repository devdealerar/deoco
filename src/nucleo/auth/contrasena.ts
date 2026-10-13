import { hash, verify } from "@node-rs/argon2";

/** Hash argon2id con los parámetros por defecto de la librería. */
export function hashearContrasena(contrasena: string): Promise<string> {
  return hash(contrasena);
}

export async function verificarContrasena(hashGuardado: string, contrasena: string): Promise<boolean> {
  try {
    return await verify(hashGuardado, contrasena);
  } catch {
    return false; // hash con formato inválido
  }
}
