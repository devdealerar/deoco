// Links firmados con vencimiento: para darle un archivo PRIVADO de la banda a un tercero sin
// sesión (el archivo de impresión al proveedor). Van a la plataforma, no al sitio:
//   https://app.<raiz>/descargas/<tenantId>/<archivoId>/<nombre>?vence=<epoch>&firma=<hmac>
// La firma cubre banda + archivo + vencimiento: cambiar cualquiera la invalida.
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { conTenant } from "@/nucleo/db/con-tenant";
import { registro as registroGlobal } from "@/nucleo/modulos";
import type { Modulo } from "@/nucleo/modulos/contrato";
import type { Registro } from "@/nucleo/modulos/registro";
import { origenPlataforma } from "@/nucleo/tenant/hosts";

export class ErrorFirma extends Error {}

const DIA = 24 * 60 * 60;
export const VALIDEZ_MAXIMA = 30 * DIA;

/** Clave propia, derivada de AUTH_SECRET: un link firmado no sirve para otra cosa. */
function clave(): Buffer {
  const secreto = process.env.AUTH_SECRET;
  if (!secreto) throw new ErrorFirma("Falta AUTH_SECRET para firmar links.");
  return Buffer.from(hkdfSync("sha256", secreto, "deoco", "deoco/archivos-firmados/v1", 32));
}

const firmar = (tenantId: string, archivoId: string, vence: number) =>
  createHmac("sha256", clave()).update(`${tenantId}/${archivoId}/${vence}`).digest("base64url");

/**
 * Link firmado a un archivo del módulo, válido `validoPorSegundos` (por defecto 7 días, hasta
 * 30). El módulo pasa SU contrato y solo puede firmar archivos suyos.
 */
export async function urlFirmada(
  modulo: Modulo,
  tenantId: string,
  archivoId: string,
  opciones: { validoPorSegundos?: number; ahora?: Date } = {},
  reg: Registro = registroGlobal(),
): Promise<string> {
  if (reg.modulo(modulo.id) !== modulo) throw new ErrorFirma(`"${modulo.id}" no es un módulo registrado.`);
  const validez = opciones.validoPorSegundos ?? 7 * DIA;
  if (!(validez > 0 && validez <= VALIDEZ_MAXIMA)) throw new ErrorFirma("La validez va de 1 segundo a 30 días.");
  const archivo = await conTenant(tenantId, (tx) =>
    tx.archivo.findUnique({ where: { id: archivoId }, select: { nombre: true, moduloId: true } }),
  );
  if (!archivo || archivo.moduloId !== modulo.id) throw new ErrorFirma("Ese archivo no es de este módulo en esta banda.");
  const vence = Math.floor((opciones.ahora ?? new Date()).getTime() / 1000) + Math.floor(validez);
  const q = new URLSearchParams({ vence: String(vence), firma: firmar(tenantId, archivoId, vence) });
  return `${origenPlataforma()}/descargas/${tenantId}/${archivoId}/${encodeURIComponent(archivo.nombre)}?${q}`;
}

/** "ok", "vencido" o "invalido" (firma que no corresponde, mal formada o alterada). */
export function verificarFirma(
  tenantId: string,
  archivoId: string,
  venceCrudo: string | null,
  firma: string | null,
  ahora = new Date(),
): "ok" | "vencido" | "invalido" {
  if (!venceCrudo || !firma || !/^\d{1,12}$/.test(venceCrudo)) return "invalido";
  const vence = Number(venceCrudo);
  const esperada = Buffer.from(firmar(tenantId, archivoId, vence));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return "invalido";
  return vence * 1000 < ahora.getTime() ? "vencido" : "ok";
}
