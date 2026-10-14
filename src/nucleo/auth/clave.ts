import { conUsuario } from "@/nucleo/db/con-usuario";
import { hashearContrasena, verificarContrasena } from "./contrasena";

export const LARGO_MINIMO_CLAVE = 10;

/** Clave que no se puede usar: su mensaje se muestra tal cual. */
export class ErrorClave extends Error {}

/**
 * Cambio de clave del propio usuario (también el obligatorio tras una clave temporal).
 * Exige la clave actual. Deja la cuenta sin marca de temporal.
 */
export async function cambiarClave(usuarioId: string, actual: string, nueva: string, repetida: string) {
  const hash = await conUsuario(usuarioId, (tx) => tx.usuario.findUnique({ where: { id: usuarioId }, select: { hashContrasena: true } }));
  if (!hash || !(await verificarContrasena(hash.hashContrasena, actual))) {
    throw new ErrorClave("La clave actual no es correcta.");
  }
  if (nueva.length < LARGO_MINIMO_CLAVE) throw new ErrorClave(`La clave nueva tiene que tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`);
  if (nueva !== repetida) throw new ErrorClave("Las dos claves nuevas no coinciden.");
  if (nueva === actual) throw new ErrorClave("La clave nueva tiene que ser distinta de la actual.");
  const hashNuevo = await hashearContrasena(nueva);
  // Solo la propia fila (RLS) y solo estas columnas (privilegios de deoco_app).
  await conUsuario(usuarioId, (tx) =>
    tx.usuario.update({ where: { id: usuarioId }, data: { hashContrasena: hashNuevo, claveTemporal: false }, select: { id: true } }),
  );
}
