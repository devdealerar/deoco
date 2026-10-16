// Tokens de acceso sin cuenta (el link del mail y la cookie del navegador que compró: entradas,
// pedido). En la base NUNCA va el token en claro: el hash (sha256) para comprobarlo y, para volver
// a armar el link del mail, el token cifrado con DEOCO_CLAVE_SECRETOS (atado a la cosa). Quien lea
// la base (una copia, el back office) no puede abrir la compra de nadie.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cifrar, descifrar } from "@/nucleo/secretos/cifrado";

export const hashDeToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** El contexto del cifrado: la banda, el módulo y la cosa (un cifrado copiado a otra fila no sirve). */
export const contextoDeToken = (tenantId: string, moduloId: string, id: string) => `acceso:${tenantId}:${moduloId}:${id}`;

/** Token nuevo: el valor (para el navegador y el mail), su hash y su cifrado (para la base). */
export function nuevoTokenDeAcceso(contexto: string, bytes = 32): { token: string; hash: string; cifrado: Uint8Array<ArrayBuffer> } {
  const token = randomBytes(bytes).toString("hex");
  return { token, hash: hashDeToken(token), cifrado: cifrar(token, contexto) };
}

/** ¿El token es el de ese hash? En tiempo constante. */
export function tokenCoincide(token: string | null | undefined, hash: string): boolean {
  if (!token) return false;
  const a = Buffer.from(hashDeToken(token));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** El token para armar el link del mail. null si no hay cifrado (filas de antes) o no se puede leer. */
export function tokenParaEnlace(cifrado: Uint8Array | null | undefined, contexto: string): string | null {
  if (!cifrado) return null;
  try {
    return descifrar(cifrado, contexto);
  } catch {
    return null;
  }
}
