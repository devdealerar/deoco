import { createHmac, timingSafeEqual } from "node:crypto";
import { emitir } from "@/nucleo/eventos/bus";
import type { AvisoEntrante, RespuestaAviso } from "@/nucleo/modulos/contrato";
import { leerSecreto } from "@/nucleo/secretos";
import prueba from "./index";

/**
 * Aviso de ejemplo, como el de una pasarela: firma HMAC-SHA256 del cuerpo crudo con el token
 * que cargó el titular (cabecera `x-firma`, en hex). Rápido e idempotente: verifica, emite
 * con `unica` = id del pago y responde. El trabajo pesado lo hace el suscripto, después.
 */
export async function avisoDePago(aviso: AvisoEntrante): Promise<RespuestaAviso> {
  const token = await leerSecreto(prueba, aviso.tenantId, "token");
  if (!token) return { estado: 409, cuerpo: "La banda no cargó el token" };

  const esperada = createHmac("sha256", token).update(aviso.cuerpo).digest();
  const recibida = Buffer.from(aviso.cabeceras.get("x-firma") ?? "", "hex");
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) {
    return { estado: 401, cuerpo: "Firma inválida" };
  }

  const datos = aviso.json() as { id?: unknown } | null;
  if (typeof datos?.id !== "string" || !datos.id) return { estado: 400, cuerpo: "Falta el id" };

  const { repetido } = await emitir("prueba.verificada", aviso.tenantId, { desde: "aviso", pago: datos.id }, undefined, {
    unica: `pago:${datos.id}`,
  });
  return { cuerpo: { recibido: true, repetido } };
}
