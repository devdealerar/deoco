import type { AvisoEntrante, RespuestaAviso } from "@/nucleo/modulos/contrato";
import tienda from "./index";
import { registrarPago } from "./pagos";
import { credencialesDe, pasarelaDe } from "./pasarelas";
import { ErrorPasarela } from "./pasarelas/tipos";

/**
 * Aviso de pago de la pasarela: app.<raiz>/avisos/<tenantId>/tienda/pago/<pasarela>.
 * Rápido e idempotente: del aviso solo se toma el id del cobro; el cobro se consulta a la API
 * con las credenciales de la banda y eso decide. Un aviso repetido no cambia nada.
 */
export async function avisoDePago(aviso: AvisoEntrante): Promise<RespuestaAviso> {
  const pasarela = pasarelaDe(aviso.params.pasarela);
  if (!pasarela) return { estado: 404, cuerpo: "Pasarela desconocida" };
  const cred = await credencialesDe(tienda, aviso.tenantId, pasarela);
  if (!pasarela.obligatorias.every((c) => cred[c])) return { estado: 409, cuerpo: "La banda no tiene la pasarela conectada" };

  let cobroId: string | null;
  try {
    cobroId = pasarela.leerAviso(aviso, cred);
  } catch (e) {
    if (e instanceof ErrorPasarela) return { estado: 401, cuerpo: e.message };
    throw e;
  }
  if (!cobroId) return { cuerpo: "ignorado" }; // no es un aviso de pago (200: que no reintente)

  // Si la API no responde, tira: 500 y la pasarela reintenta más tarde.
  const cobro = await pasarela.consultarCobro(cred, cobroId);
  const resultado = await registrarPago(aviso.tenantId, pasarela.id, cobro);
  return { cuerpo: { resultado } };
}
