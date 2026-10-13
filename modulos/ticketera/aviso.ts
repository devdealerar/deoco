import type { AvisoEntrante, RespuestaAviso } from "@/nucleo/modulos/contrato";
import { cobroDelAviso } from "@/nucleo/pagos";
import { registrarPago } from "./compras";
import ticketera from "./index";

/**
 * Aviso de pago de la pasarela: app.<raiz>/avisos/<tenantId>/ticketera/pago/<pasarela>. El
 * núcleo consulta el cobro a la API (fuente de verdad); acá se registra. Idempotente.
 */
export async function avisoDePago(aviso: AvisoEntrante): Promise<RespuestaAviso> {
  const r = await cobroDelAviso(ticketera, aviso);
  if ("respuesta" in r) return r.respuesta;
  return { cuerpo: { resultado: await registrarPago(aviso.tenantId, r.pasarela, r.cobro) } };
}
