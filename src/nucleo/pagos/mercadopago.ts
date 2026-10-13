// Mercado Pago, Checkout Pro, con la cuenta de la banda (su access token). La plata entra a
// la cuenta de la banda: Deoco no está en el medio ni cobra comisión.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { AvisoEntrante } from "@/nucleo/modulos/contrato";
import { type CobroConsultado, type Credenciales, type EstadoDeCobro, ErrorPasarela, type Pasarela } from "./tipos";

/** En pruebas apunta a un servidor local que imita a Mercado Pago. */
const api = () => process.env.DEOCO_MERCADOPAGO_API ?? "https://api.mercadopago.com";
const TOKEN = "mercadopago_access_token";
const SECRETO_AVISOS = "mercadopago_secreto_avisos";

const pesos = (centavos: number) => Math.round(centavos) / 100;

async function llamar<T>(cred: Credenciales, metodo: "GET" | "POST", ruta: string, cuerpo?: unknown): Promise<T> {
  const token = cred[TOKEN];
  if (!token) throw new ErrorPasarela("Falta el access token de Mercado Pago.");
  const r = await fetch(`${api()}${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) {
    // El mensaje de Mercado Pago sirve para diagnosticar; el token nunca aparece en él.
    const detalle = (await r.text().catch(() => "")).slice(0, 300);
    throw new ErrorPasarela(`Mercado Pago respondió ${r.status} en ${metodo} ${ruta.split("?")[0]}: ${detalle}`);
  }
  return (await r.json()) as T;
}

const ESTADOS: Record<string, EstadoDeCobro> = {
  approved: "aprobado",
  authorized: "pendiente",
  pending: "pendiente",
  in_process: "pendiente",
  in_mediation: "pendiente",
  rejected: "rechazado",
  cancelled: "rechazado",
  refunded: "devuelto",
  charged_back: "devuelto",
};

/**
 * Firma de los avisos de Mercado Pago (cabecera x-signature "ts=…,v1=…"): HMAC-SHA256 con el
 * secreto de avisos de la aplicación sobre "id:<data.id>;request-id:<x-request-id>;ts:<ts>;".
 */
function firmaValida(aviso: AvisoEntrante, secreto: string, dataId: string): boolean {
  const partes = Object.fromEntries(
    (aviso.cabeceras.get("x-signature") ?? "").split(",").map((p) => p.trim().split("=") as [string, string]),
  );
  if (!partes.ts || !partes.v1) return false;
  const requestId = aviso.cabeceras.get("x-request-id") ?? "";
  const manifiesto = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${partes.ts};`;
  const esperada = Buffer.from(createHmac("sha256", secreto).update(manifiesto).digest("hex"));
  const recibida = Buffer.from(partes.v1);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

export const mercadoPago: Pasarela = {
  id: "mercadopago",
  nombre: "Mercado Pago",
  credenciales: [
    {
      clave: TOKEN,
      etiqueta: "Mercado Pago · Access token",
      ayuda: "Mercado Pago → Tus integraciones → tu aplicación → Credenciales de producción → Access token (APP_USR-…).",
    },
    {
      clave: SECRETO_AVISOS,
      etiqueta: "Mercado Pago · Clave secreta de webhooks (opcional)",
      ayuda: "Tus integraciones → tu aplicación → Webhooks → clave secreta. Con ella se verifica la firma de cada aviso.",
    },
  ],
  obligatorias: [TOKEN],
  comoDevolver: "En Mercado Pago: Tu actividad → el pago → Devolver dinero.",

  async crearCobro(cred, cobro) {
    const r = await llamar<{ id: string; init_point: string }>(cred, "POST", "/checkout/preferences", {
      items: [
        ...cobro.items.map((i) => ({ title: i.titulo, quantity: i.cantidad, unit_price: pesos(i.precioUnitario), currency_id: "ARS" })),
        ...cobro.extras.filter((e) => e.monto > 0).map((e) => ({ title: e.titulo, quantity: 1, unit_price: pesos(e.monto), currency_id: "ARS" })),
      ],
      payer: { name: cobro.comprador.nombre, email: cobro.comprador.email },
      back_urls: { success: cobro.urls.exito, failure: cobro.urls.fallo, pending: cobro.urls.pendiente },
      auto_return: "approved",
      notification_url: cobro.urls.aviso,
      external_reference: cobro.referencia,
    });
    if (!r.init_point || !r.id) throw new ErrorPasarela("Mercado Pago no devolvió adónde pagar.");
    return { redireccion: r.init_point, preferenciaId: r.id };
  },

  leerAviso(aviso, cred) {
    // Webhook: { type: "payment", data: { id } } (y ?type=payment&data.id=…). IPN: ?topic=payment&id=….
    const cuerpo = (aviso.json() ?? {}) as { type?: string; action?: string; data?: { id?: unknown } };
    const tipo = cuerpo.type ?? aviso.consulta.get("type") ?? aviso.consulta.get("topic");
    if (tipo !== "payment") return null;
    const id = String(cuerpo.data?.id ?? aviso.consulta.get("data.id") ?? aviso.consulta.get("id") ?? "");
    if (!/^\d{1,20}$/.test(id)) return null;
    const secreto = cred[SECRETO_AVISOS];
    if (secreto && !firmaValida(aviso, secreto, aviso.consulta.get("data.id") ?? id)) {
      throw new ErrorPasarela("Firma del aviso inválida.");
    }
    return id;
  },

  async consultarCobro(cred, cobroId): Promise<CobroConsultado> {
    const p = await llamar<{
      id: number | string;
      status: string;
      external_reference: string | null;
      transaction_amount: number;
      currency_id: string;
    }>(cred, "GET", `/v1/payments/${encodeURIComponent(cobroId)}`);
    return {
      cobroId: String(p.id),
      estado: ESTADOS[p.status] ?? "pendiente",
      estadoPasarela: p.status,
      referencia: p.external_reference || null,
      monto: Math.round(Number(p.transaction_amount) * 100),
      moneda: p.currency_id,
    };
  },

  async probarConexion(cred) {
    const u = await llamar<{ nickname?: string; email?: string; id?: number }>(cred, "GET", "/users/me");
    return { cuenta: [u.nickname, u.email].filter(Boolean).join(" · ") || `cuenta ${u.id}` };
  },
};
