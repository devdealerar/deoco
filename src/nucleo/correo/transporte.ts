// Transporte de correo: cómo sale un mensaje. El resto del núcleo no sabe cuál es.
//   DEOCO_CORREO=smtp     → SMTP (Resend, Postmark, SES… cualquiera: DEOCO_SMTP_URL)
//   DEOCO_CORREO=memoria  → no sale: queda en una bandeja en memoria (desarrollo y pruebas)
// Sin DEOCO_CORREO: memoria en desarrollo; en producción, ninguno (quedan PENDIENTES).
import { createTransport, type Transporter } from "nodemailer";
import { dominioRaiz } from "@/nucleo/tenant/hosts";

export type MensajeSaliente = {
  de: { nombre: string; direccion: string };
  para: string;
  responderA?: string;
  asunto: string;
  html: string;
  texto: string;
  /** Para rastrear el envío en el proveedor (cabecera X-Deoco-Correo). */
  id: string;
  /** Con `cid`, se ve dentro del html como <img src="cid:…">. */
  adjuntos?: { nombre: string; tipo: string; cid?: string; contenido: Buffer }[];
};

export interface TransporteCorreo {
  readonly nombre: string;
  enviar(m: MensajeSaliente): Promise<void>;
}

class TransporteSmtp implements TransporteCorreo {
  readonly nombre = "smtp";
  private transporte: Transporter;
  constructor(url: string) {
    this.transporte = createTransport(url);
  }
  async enviar(m: MensajeSaliente) {
    await this.transporte.sendMail({
      from: { name: m.de.nombre, address: m.de.direccion },
      to: m.para,
      replyTo: m.responderA,
      subject: m.asunto,
      html: m.html,
      text: m.texto,
      headers: { "X-Deoco-Correo": m.id },
      attachments: (m.adjuntos ?? []).map((a) => ({ filename: a.nombre, contentType: a.tipo, cid: a.cid, content: a.contenido })),
    });
  }
}

const bandeja: MensajeSaliente[] = (globalThis as { __deocoBandeja?: MensajeSaliente[] }).__deocoBandeja ??= [];

class TransporteMemoria implements TransporteCorreo {
  readonly nombre = "memoria";
  async enviar(m: MensajeSaliente) {
    bandeja.push(m);
    if (process.env.NODE_ENV === "development") console.log(`[correo] (memoria) a ${m.para}: ${m.asunto}`);
  }
}

/** Lo que "salió" con el transporte en memoria. Para pruebas y desarrollo. */
export function bandejaDeSalida(): readonly MensajeSaliente[] {
  return bandeja;
}
export function vaciarBandeja() {
  bandeja.length = 0;
}

export function problemasDeCorreo(env: Record<string, string | undefined>): string[] {
  const modo = env.DEOCO_CORREO;
  if (!modo) return [];
  if (modo === "memoria") return [];
  if (modo !== "smtp") return [`DEOCO_CORREO="${modo}" no existe (smtp o memoria).`];
  const p: string[] = [];
  if (!env.DEOCO_SMTP_URL) p.push("DEOCO_CORREO=smtp necesita DEOCO_SMTP_URL (p. ej. smtps://resend:<clave>@smtp.resend.com:465).");
  else if (!/^smtps?:\/\//.test(env.DEOCO_SMTP_URL)) p.push("DEOCO_SMTP_URL tiene que empezar con smtp:// o smtps://.");
  if (!env.DEOCO_CORREO_REMITENTE) p.push("DEOCO_CORREO=smtp necesita DEOCO_CORREO_REMITENTE (p. ej. tiendas@deocoartist.com).");
  return p;
}

let elegido: { clave: string; transporte: TransporteCorreo | null } | undefined;

/** null = sin transporte configurado (producción sin DEOCO_CORREO): los correos esperan. */
export function transporte(): TransporteCorreo | null {
  const modo = process.env.DEOCO_CORREO ?? (process.env.NODE_ENV === "production" ? "" : "memoria");
  const clave = `${modo}|${process.env.DEOCO_SMTP_URL ?? ""}`;
  if (elegido?.clave !== clave) {
    elegido = {
      clave,
      transporte:
        modo === "smtp" && process.env.DEOCO_SMTP_URL
          ? new TransporteSmtp(process.env.DEOCO_SMTP_URL)
          : modo === "memoria"
            ? new TransporteMemoria()
            : null,
    };
  }
  return elegido.transporte;
}

export function remitente(): string {
  return process.env.DEOCO_CORREO_REMITENTE ?? `no-responder@${dominioRaiz()}`;
}
