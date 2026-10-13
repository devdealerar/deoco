// Cifrado de secretos: AES-256-GCM con la clave DEOCO_CLAVE_SECRETOS (32 bytes en base64).
// Formato: [versión=1][iv 12][tag 16][texto cifrado]. El "contexto" (banda/módulo/clave) va
// como dato autenticado: un cifrado copiado a otra fila no se descifra.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class ErrorSecreto extends Error {}

const VERSION = 1;

/**
 * null si la variable falta o no son 32 bytes en base64. `variable`: la actual, o la anterior
 * durante una rotación (DEOCO_CLAVE_SECRETOS_ANTERIOR, ver docs/despliegue.md).
 */
export function claveMaestra(
  env: Record<string, string | undefined> = process.env,
  variable: "DEOCO_CLAVE_SECRETOS" | "DEOCO_CLAVE_SECRETOS_ANTERIOR" = "DEOCO_CLAVE_SECRETOS",
): Buffer | null {
  const cruda = env[variable]?.trim();
  if (!cruda) return null;
  const clave = Buffer.from(cruda, "base64");
  return clave.length === 32 ? clave : null;
}

function exigirClave(): Buffer {
  const clave = claveMaestra();
  if (!clave) {
    throw new ErrorSecreto(
      "Falta DEOCO_CLAVE_SECRETOS (32 bytes en base64, `openssl rand -base64 32`): sin ella no se pueden guardar ni leer credenciales.",
    );
  }
  return clave;
}

export function cifrar(valor: string, contexto: string): Uint8Array<ArrayBuffer> {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", exigirClave(), iv);
  c.setAAD(Buffer.from(contexto));
  const datos = Buffer.concat([c.update(valor, "utf8"), c.final()]);
  return new Uint8Array(Buffer.concat([Buffer.from([VERSION]), iv, c.getAuthTag(), datos]));
}

export function descifrar(cifrado: Uint8Array, contexto: string): string {
  const b = Buffer.from(cifrado);
  if (b[0] !== VERSION || b.length < 29) throw new ErrorSecreto("Credencial guardada con un formato desconocido.");
  // Durante una rotación, lo que todavía no se recifró está con la anterior.
  const claves = [exigirClave(), claveMaestra(process.env, "DEOCO_CLAVE_SECRETOS_ANTERIOR")].filter((c) => c !== null);
  for (const clave of claves) {
    try {
      const d = createDecipheriv("aes-256-gcm", clave, b.subarray(1, 13));
      d.setAAD(Buffer.from(contexto));
      d.setAuthTag(b.subarray(13, 29));
      return Buffer.concat([d.update(b.subarray(29)), d.final()]).toString("utf8");
    } catch {
      // probar con la siguiente
    }
  }
  // Sin detalles: ni el valor ni el cifrado van a un mensaje o a un log.
  throw new ErrorSecreto("No se pudo descifrar la credencial (¿cambió DEOCO_CLAVE_SECRETOS?). Hay que volver a cargarla.");
}

/** "…a1b2" si es largo (los últimos 4 no lo delatan); si es corto, nada. */
export function pistaDe(valor: string): string {
  return valor.length >= 16 ? `…${valor.slice(-4)}` : "";
}
