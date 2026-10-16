// Avisos del newsletter (en app.<raiz>/avisos/<banda>/fans/…):
// - GET /abierto/<entrega>: la imagen de 1 píxel del mail. Marca la primera apertura (ni IP ni navegador).
// - POST /baja/<entrega>?t=<token>: la baja en un clic del cliente de correo (RFC 8058). El token
//   solo sirve para darse de baja.
import type { AvisoEntrante, RespuestaAviso } from "@/nucleo/modulos/contrato";
import { darDeBaja } from "./contactos";
import { marcarAbierta } from "./envios";

// GIF transparente de 1×1.
const PIXEL = Uint8Array.from(Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"));

export async function avisoAbierto(a: AvisoEntrante): Promise<RespuestaAviso> {
  await marcarAbierta(a.tenantId, a.params.entrega ?? "").catch(() => undefined);
  return { cuerpo: PIXEL, tipo: "image/gif" };
}

export async function avisoBaja(a: AvisoEntrante): Promise<RespuestaAviso> {
  const ok = await darDeBaja(a.tenantId, a.consulta.get("t") ?? "", a.params.entrega);
  return ok ? { cuerpo: "Listo: no te llegan más mails de novedades." } : { estado: 404, cuerpo: "Ese link no es válido." };
}
