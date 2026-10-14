// Aviso de la pasarela de la CUOTA (la cuenta de Mercado Pago de Deoco), en
// app.<raiz>/avisos/plataforma/comercial/cuota/<pasarela>. No es de una banda: la banda sale de
// la suscripción (su referencia es el id de la banda), consultada a la API, nunca del cuerpo.
import type { AvisoEntrante, RespuestaAviso } from "@/nucleo/modulos/contrato";
import { ErrorPasarela } from "@/nucleo/pagos";
import { consultarCobroCuota, consultarSuscripcion, leerAvisoCuota, pasarelaDeLaCuota } from "@/nucleo/pagos/cuota";
import { registrarCobro, sincronizar } from "./cuenta";
import comercial from "./index";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function avisoDeCuota(aviso: Omit<AvisoEntrante, "tenantId">): Promise<RespuestaAviso | void> {
  if (aviso.params.pasarela !== pasarelaDeLaCuota().id) return { estado: 404, cuerpo: "no" };
  let que;
  try {
    que = leerAvisoCuota(comercial, aviso);
  } catch (e) {
    if (e instanceof ErrorPasarela) return { estado: 401, cuerpo: "firma" };
    throw e;
  }
  if (!que) return; // otro tipo de aviso: se ignora (200, para que no reintente)

  if (que.tipo === "suscripcion") {
    const s = await consultarSuscripcion(comercial, que.id);
    if (s.referencia && UUID.test(s.referencia)) await sincronizar(s.referencia, s);
    return;
  }
  const cobro = await consultarCobroCuota(comercial, que.id);
  if (!cobro.suscripcionId) return;
  const s = await consultarSuscripcion(comercial, cobro.suscripcionId);
  if (!s.referencia || !UUID.test(s.referencia)) return;
  await sincronizar(s.referencia, s);
  await registrarCobro(s.referencia, cobro);
}
