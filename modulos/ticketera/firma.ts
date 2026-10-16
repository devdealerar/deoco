// Código de la entrada (va en el QR y se tipea en la puerta): único y FIRMADO (documento maestro
// §9). 20 caracteres de un alfabeto sin 0/O/1/I: 10 al azar + 10 de firma (HMAC-SHA256 con una
// clave por banda, derivada de DEOCO_CLAVE_QR). La puerta verifica la firma antes de tocar la
// base: un código inventado, o el de otra banda, ni se busca.
import { createHmac, hkdfSync, randomInt, timingSafeEqual } from "node:crypto";

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LARGO = 10;
/** Largo del código firmado (al azar + firma). Los de antes de la firma tienen LARGO_VIEJO. */
export const LARGO_FIRMADO = 2 * LARGO;
export const LARGO_VIEJO = LARGO;

/** La parte al azar: 10 caracteres (50 bits). */
export const nuevoCodigo = () => Array.from({ length: LARGO }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");

/** Clave de la banda: así un código de una banda no vale en otra, ni sirve para otra cosa. */
function claveDeBanda(tenantId: string): Buffer {
  const cruda = Buffer.from(process.env.DEOCO_CLAVE_QR ?? "", "base64");
  if (cruda.length < 32) throw new Error("Falta DEOCO_CLAVE_QR (32 bytes en base64: `openssl rand -base64 32`): sin ella no se firman las entradas.");
  return Buffer.from(hkdfSync("sha256", cruda, "deoco", `deoco/ticketera/qr/v1/${tenantId}`, 32));
}

/** Los primeros 50 bits del HMAC, en el alfabeto del código. */
function firma(tenantId: string, base: string): string {
  const d = createHmac("sha256", claveDeBanda(tenantId)).update(base).digest();
  let bits = 0;
  let n = 0;
  let r = "";
  for (const byte of d) {
    bits = (bits << 8) | byte;
    n += 8;
    while (n >= 5 && r.length < LARGO) {
      r += ALFABETO[(bits >> (n - 5)) & 31];
      n -= 5;
    }
    if (r.length === LARGO) break;
  }
  return r;
}

/** El código completo de una entrada: la parte al azar y su firma. */
export const codigoFirmado = (tenantId: string, base: string) => base + firma(tenantId, base);

/** ¿La firma del código (ya normalizado, 20 caracteres) es de esta banda? Sin tocar la base. */
export function firmaValida(tenantId: string, codigo: string): boolean {
  if (codigo.length !== LARGO_FIRMADO) return false;
  const esperada = Buffer.from(firma(tenantId, codigo.slice(0, LARGO)));
  const recibida = Buffer.from(codigo.slice(LARGO));
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

/** Para mostrar y tipear: de a cinco, con guiones (la puerta los ignora). */
export const formatearCodigo = (codigo: string) => codigo.match(/.{1,5}/g)?.join("-") ?? codigo;
