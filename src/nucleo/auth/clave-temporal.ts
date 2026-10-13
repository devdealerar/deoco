import { randomInt } from "node:crypto";

/** Clave temporal legible (sin 0/O/1/l): se muestra una sola vez al staff. */
export function claveTemporal() {
  const letras = "abcdefghjkmnpqrstuvwxyz23456789";
  const bloque = () => Array.from({ length: 4 }, () => letras[randomInt(letras.length)]).join("");
  return `${bloque()}-${bloque()}-${bloque()}`;
}
