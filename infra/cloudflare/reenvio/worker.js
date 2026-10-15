// Email Worker de reenvío de Deoco (docs/diseno-dominios.md §5). Lo que llega a una dirección
// de una banda (merch@labanda.com, por Email Routing de Cloudflare) se reenvía MANDANDO UN MAIL
// NUEVO por Resend al destino que eligió la banda. No usa forward(): así no hay destinos que
// verificar ni el tope de 200 destinos por cuenta de Cloudflare.
//
// El remitente original no puede ir en el From (Resend solo manda desde dominios verificados y
// SPF/DMARC lo rechazarían): va el nombre visible ("Juan (vía labanda.com)") y el Reply-To, así
// "Responder" desde la casilla de la banda le escribe al fan.
//
// Bindings (wrangler.toml): DESTINOS (KV: dirección → destino, lo escribe la app; también los
// contadores diarios). Secretos: RESEND_API_KEY. Opcional: RESEND_API (pruebas).
import PostalMime from "postal-mime";

/** Reenvíos por dirección y por día: frena el uso del reenvío para mandar spam a un tercero. */
export const TOPE_DIARIO = 200;
/** Más grande que esto, se reenvía el texto con un aviso (sin adjuntos). A confirmar con Resend. */
export const TAMANO_MAXIMO = 20 * 1024 * 1024;

const limpiar = (t) => String(t ?? "").replace(/["\r\n<>]/g, "").trim().slice(0, 80);

function aBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Mails automáticos (respuestas automáticas, rebotes): no se reenvían, para no armar bucles. */
function esAutomatico(message) {
  const auto = (message.headers.get("auto-submitted") ?? "no").toLowerCase();
  const de = (message.from ?? "").toLowerCase();
  return auto !== "no" || de === "" || de.startsWith("mailer-daemon@") || de.startsWith("postmaster@");
}

const reenvio = {
  async email(message, env) {
    const para = String(message.to).toLowerCase();
    const dominio = para.split("@")[1] ?? "";
    const destino = await env.DESTINOS.get(para);
    if (!destino) {
      message.setReject("Esta dirección no recibe correo.");
      return;
    }
    // Lo que manda el propio reenvío (o un automático) no vuelve a entrar.
    if (String(message.from).toLowerCase() === `reenvio@${dominio}` || esAutomatico(message)) return;

    const clave = `cuenta:${para}:${new Date().toISOString().slice(0, 10)}`;
    const cuenta = Number((await env.DESTINOS.get(clave)) ?? 0);
    if (cuenta >= TOPE_DIARIO) {
      message.setReject("Esta dirección recibió demasiados mensajes hoy. Probá mañana.");
      return;
    }
    await env.DESTINOS.put(clave, String(cuenta + 1), { expirationTtl: 2 * 86400 });

    const grande = (message.rawSize ?? 0) > TAMANO_MAXIMO;
    const correo = await PostalMime.parse(message.raw);
    const nombre = limpiar(correo.from?.name || correo.from?.address || message.from);
    const responderA = correo.replyTo?.[0]?.address || correo.from?.address || message.from;
    const aviso = grande ? "\n\n[Este mensaje traía adjuntos demasiado grandes para reenviarlos.]" : "";
    const html = grande ? null : correo.html || null;
    const texto = `${correo.text || ""}${aviso}`.trim();
    const cuerpo = {
      from: `"${nombre} (vía ${dominio})" <reenvio@${dominio}>`,
      to: [destino],
      reply_to: responderA,
      subject: correo.subject || "(sin asunto)",
      ...(html ? { html } : {}),
      text: texto || (html ? undefined : "(sin texto)"),
      ...(!grande && correo.attachments?.length
        ? { attachments: correo.attachments.map((a) => ({ filename: a.filename || "adjunto", content: aBase64(a.content), content_type: a.mimeType })) }
        : {}),
      headers: { "X-Deoco-Original-From": String(message.from), "X-Deoco-Original-To": para },
    };
    const r = await fetch(`${env.RESEND_API ?? "https://api.resend.com"}/emails`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    // Si Resend falla, el Worker falla: Cloudflare no da el mensaje por entregado (a confirmar en
    // el ensayo real que el remitente lo reintente). No se cuenta como reenviado.
    if (!r.ok) {
      await env.DESTINOS.put(clave, String(cuenta), { expirationTtl: 2 * 86400 });
      throw new Error(`Resend respondió ${r.status}`);
    }
  },
};

export default reenvio;
