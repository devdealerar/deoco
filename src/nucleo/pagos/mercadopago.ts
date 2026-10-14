// Mercado Pago, Checkout Pro, con la cuenta de la banda (su access token). La plata entra a
// la cuenta de la banda: Deoco no está en el medio ni cobra comisión.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { AvisoEntrante } from "@/nucleo/modulos/contrato";
import {
  type CobroConsultado,
  type CobroDeSuscripcion,
  type Credenciales,
  type EstadoDeCobro,
  type EstadoSuscripcion,
  ErrorPasarela,
  type Pasarela,
  type SuscripcionConsultada,
  type SuscripcionesPasarela,
} from "./tipos";

/** En pruebas apunta a un servidor local que imita a Mercado Pago. */
const api = () => process.env.DEOCO_MERCADOPAGO_API ?? "https://api.mercadopago.com";
const TOKEN = "mercadopago_access_token";
const SECRETO_AVISOS = "mercadopago_secreto_avisos";

const pesos = (centavos: number) => Math.round(centavos) / 100;

async function llamar<T>(cred: Credenciales, metodo: "GET" | "POST" | "PUT", ruta: string, cuerpo?: unknown): Promise<T> {
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
function firmaValida(aviso: Pick<AvisoEntrante, "cabeceras">, secreto: string, dataId: string): boolean {
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

// ── Suscripciones (preapproval): SOLO la cuota de Deoco, con la cuenta de Deoco ─────────────
// Sin plan asociado y en estado "pending": quien paga carga su medio de pago en Mercado Pago
// (init_point). Avisos: "subscription_preapproval" (la suscripción cambió) y
// "subscription_authorized_payment" (un cobro mensual). Siempre se reconsulta la API.

const ESTADOS_SUSCRIPCION: Record<string, EstadoSuscripcion> = {
  pending: "pendiente",
  authorized: "activa",
  paused: "pausada",
  cancelled: "cancelada",
};

type Preapproval = {
  id: string;
  status: string;
  external_reference?: string | null;
  auto_recurring?: { transaction_amount?: number };
  next_payment_date?: string | null;
  payment_method_id?: string | null;
};

const fecha = (t: string | null | undefined) => {
  const d = t ? new Date(t) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

const suscripciones: SuscripcionesPasarela = {
  async crear(cred, sus) {
    const r = await llamar<{ id: string; init_point: string }>(cred, "POST", "/preapproval", {
      reason: sus.motivo,
      external_reference: sus.referencia,
      payer_email: sus.email,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: pesos(sus.monto),
        currency_id: "ARS",
        ...(sus.inicio ? { start_date: sus.inicio.toISOString() } : {}),
      },
      back_url: sus.vuelta,
      status: "pending",
    });
    if (!r.init_point || !r.id) throw new ErrorPasarela("Mercado Pago no devolvió adónde cargar el medio de pago.");
    return { suscripcionId: r.id, redireccion: r.init_point };
  },

  async consultar(cred, id): Promise<SuscripcionConsultada> {
    const p = await llamar<Preapproval>(cred, "GET", `/preapproval/${encodeURIComponent(id)}`);
    return {
      suscripcionId: String(p.id),
      estado: ESTADOS_SUSCRIPCION[p.status] ?? "pendiente",
      estadoPasarela: p.status,
      referencia: p.external_reference || null,
      monto: Math.round(Number(p.auto_recurring?.transaction_amount ?? 0) * 100),
      proximoCobro: fecha(p.next_payment_date),
      medioDePago: p.payment_method_id || null,
    };
  },

  async cambiarMonto(cred, id, monto) {
    await llamar(cred, "PUT", `/preapproval/${encodeURIComponent(id)}`, {
      auto_recurring: { transaction_amount: pesos(monto), currency_id: "ARS" },
    });
  },

  async cancelar(cred, id) {
    await llamar(cred, "PUT", `/preapproval/${encodeURIComponent(id)}`, { status: "cancelled" });
  },

  leerAviso(aviso, cred) {
    const cuerpo = (aviso.json() ?? {}) as { type?: string; data?: { id?: unknown } };
    const tipo = cuerpo.type ?? aviso.consulta.get("type") ?? aviso.consulta.get("topic");
    const cual = tipo === "subscription_preapproval" ? "suscripcion" : tipo === "subscription_authorized_payment" ? "cobro" : null;
    if (!cual) return null;
    const id = String(cuerpo.data?.id ?? aviso.consulta.get("data.id") ?? aviso.consulta.get("id") ?? "");
    if (!/^[\w-]{1,64}$/.test(id)) return null;
    const secreto = cred[SECRETO_AVISOS];
    if (secreto && !firmaValida(aviso, secreto, aviso.consulta.get("data.id") ?? id)) throw new ErrorPasarela("Firma del aviso inválida.");
    return { tipo: cual, id };
  },

  async consultarCobro(cred, id): Promise<CobroDeSuscripcion> {
    // Un "pago autorizado" (la factura del mes) y, si ya se intentó, su pago.
    const a = await llamar<{
      id: number | string;
      preapproval_id?: string;
      status?: string;
      transaction_amount?: number;
      debit_date?: string;
      date_created?: string;
      payment?: { id?: number | string; status?: string } | null;
    }>(cred, "GET", `/authorized_payments/${encodeURIComponent(id)}`);
    const estadoPago = a.payment?.status;
    // El estado del PAGO manda; sin pago todavía, la factura sigue pendiente (o se canceló).
    const estado: EstadoDeCobro = estadoPago ? (ESTADOS[estadoPago] ?? "pendiente") : a.status === "cancelled" ? "rechazado" : "pendiente";
    return {
      cobroId: String(a.id),
      suscripcionId: a.preapproval_id ?? null,
      estado,
      estadoPasarela: estadoPago ?? a.status ?? "",
      monto: Math.round(Number(a.transaction_amount ?? 0) * 100),
      fecha: fecha(a.debit_date ?? a.date_created),
    };
  },
};

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

  suscripciones,
};
