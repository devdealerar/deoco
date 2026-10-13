import { cobroDelAviso } from "@/nucleo/pagos";
import type { AvisoEntrante, RespuestaAviso } from "@/nucleo/modulos/contrato";
import tienda from "./index";
import { registrarPago } from "./pagos";

/**
 * Aviso de pago de la pasarela: app.<raiz>/avisos/<tenantId>/tienda/pago/<pasarela>.
 * Rápido e idempotente: el núcleo consulta el cobro a la API con las credenciales de la banda
 * (del aviso solo toma el id) y eso decide. Un aviso repetido no cambia nada.
 */
export async function avisoDePago(aviso: AvisoEntrante): Promise<RespuestaAviso> {
  const r = await cobroDelAviso(tienda, aviso);
  if ("respuesta" in r) return r.respuesta;
  return { cuerpo: { resultado: await registrarPago(aviso.tenantId, r.pasarela, r.cobro) } };
}
