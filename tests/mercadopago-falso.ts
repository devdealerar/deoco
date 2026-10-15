// Servidor local que imita la API de Mercado Pago (lo que usa la tienda). Cada pago pertenece
// a una cuenta (su access token), como en Mercado Pago: otra cuenta no lo ve.
import { createServer, type Server } from "node:http";

export type PreferenciaRecibida = { token: string; cuerpo: Record<string, unknown>; id: string };
export type PagoFalso = {
  status: string;
  external_reference: string;
  transaction_amount: number;
  currency_id: string;
  token: string;
  payment_type_id?: string;
  transaction_amount_refunded?: number;
};
/** Una devolución pedida: con su clave de idempotencia (repetida, no devuelve dos veces). */
export type DevolucionFalsa = { pagoId: string; clave: string; id: string; status: string };

/** Una suscripción (preapproval) de la cuenta de Deoco. `status`: pending | authorized | paused | cancelled. */
export type SuscripcionFalsa = {
  token: string;
  status: string;
  external_reference: string;
  reason: string;
  payer_email: string;
  back_url: string;
  monto: number;
  start_date?: string;
  next_payment_date?: string;
  payment_method_id?: string;
};
/** Un cobro mensual de una suscripción (authorized_payment) y su pago. */
export type CobroFalso = { token: string; preapproval_id: string; transaction_amount: number; status: string; payment_status?: string; debit_date: string };

export class MercadoPagoFalso {
  suscripciones = new Map<string, SuscripcionFalsa>();
  cobros = new Map<string, CobroFalso>();
  preferencias: PreferenciaRecibida[] = [];
  pagos = new Map<string, PagoFalso>();
  cuentas = new Map<string, { nickname: string; email: string }>();
  consultas: { token: string; ruta: string }[] = [];
  devoluciones: DevolucionFalsa[] = [];
  /** Lo que contesta la próxima devolución: un error HTTP, "in_process" o lo normal ("approved"). */
  devolucionResponde: { estado: number; cuerpo: unknown } | "in_process" | "approved" = "approved";
  private servidor?: Server;
  base = "";

  async iniciar(puerto = 0) {
    this.servidor = createServer((req, res) => {
      let cuerpo = "";
      req.on("data", (c) => (cuerpo += c));
      req.on("end", () => {
        const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
        const url = new URL(req.url ?? "/", "http://x");
        const json = (estado: number, datos: unknown) => {
          res.writeHead(estado, { "content-type": "application/json" });
          res.end(JSON.stringify(datos));
        };
        if (req.method === "POST" && url.pathname === "/checkout/preferences") {
          if (!token) return json(401, { message: "unauthorized" });
          const id = `pref-${this.preferencias.length + 1}`;
          this.preferencias.push({ token, cuerpo: JSON.parse(cuerpo || "{}"), id });
          return json(201, { id, init_point: `${this.base}/checkout?pref=${id}` });
        }
        if (req.method === "POST" && url.pathname === "/preapproval") {
          if (!token) return json(401, { message: "unauthorized" });
          const c = JSON.parse(cuerpo || "{}");
          const id = `sus-${this.suscripciones.size + 1}-${Math.random().toString(36).slice(2, 8)}`;
          this.suscripciones.set(id, {
            token,
            status: c.status ?? "pending",
            external_reference: c.external_reference,
            reason: c.reason,
            payer_email: c.payer_email,
            back_url: c.back_url,
            monto: c.auto_recurring?.transaction_amount,
            start_date: c.auto_recurring?.start_date,
          });
          return json(201, { id, init_point: `${this.base}/suscribir?id=${id}`, status: "pending" });
        }
        const sus = /^\/preapproval\/([\w-]+)$/.exec(url.pathname);
        if (sus) {
          const s = this.suscripciones.get(sus[1]);
          if (!s || s.token !== token) return json(404, { message: "not found" });
          if (req.method === "PUT") {
            const c = JSON.parse(cuerpo || "{}");
            if (c.status) s.status = c.status;
            if (c.auto_recurring?.transaction_amount) s.monto = c.auto_recurring.transaction_amount;
          }
          return json(200, this.vistaSuscripcion(sus[1]));
        }
        // Pantalla de la pasarela: "carga la tarjeta" y vuelve (la autorización la hace la prueba).
        if (req.method === "GET" && url.pathname === "/suscribir") {
          const s = this.suscripciones.get(url.searchParams.get("id") ?? "");
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          return res.end(`<!doctype html><title>Mercado Pago (falso)</title><h1 data-pasarela-suscripcion>Suscribite con Mercado Pago</h1><p>${s?.reason ?? ""}</p><a href="${s?.back_url ?? "/"}">Volver</a>`);
        }
        const cobro = /^\/authorized_payments\/([\w-]+)$/.exec(url.pathname);
        if (req.method === "GET" && cobro) {
          const c = this.cobros.get(cobro[1]);
          if (!c || c.token !== token) return json(404, { message: "not found" });
          return json(200, {
            id: cobro[1],
            preapproval_id: c.preapproval_id,
            status: c.status,
            transaction_amount: c.transaction_amount,
            debit_date: c.debit_date,
            payment: c.payment_status ? { id: Number(cobro[1].replace(/\D/g, "") || 1), status: c.payment_status } : null,
          });
        }
        if (req.method === "GET" && url.pathname === "/checkout") {
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          return res.end(`<!doctype html><title>Mercado Pago (falso)</title><h1 data-pasarela>Pagá con Mercado Pago</h1><p>${url.searchParams.get("pref")}</p>`);
        }
        if (req.method === "GET" && url.pathname === "/v1/payments/search") {
          const ref = url.searchParams.get("external_reference");
          const results = [...this.pagos.entries()]
            .filter(([, p]) => p.token === token && p.external_reference === ref)
            .map(([id, { token: _, ...visible }]) => ({ id: Number(id), ...visible }));
          return json(200, { results, paging: { total: results.length } });
        }
        const devolucion = /^\/v1\/payments\/(\d+)\/refunds$/.exec(url.pathname);
        if (req.method === "POST" && devolucion) {
          const p = this.pagos.get(devolucion[1]);
          if (!p || p.token !== token) return json(404, { message: "Payment not found" });
          const clave = String(req.headers["x-idempotency-key"] ?? "");
          if (!clave) return json(400, { message: "X-Idempotency-Key requerido" });
          const ya = this.devoluciones.find((d) => d.clave === clave);
          if (ya) return json(201, { id: Number(ya.id), status: ya.status });
          const r = this.devolucionResponde;
          if (typeof r === "object") return json(r.estado, r.cuerpo);
          const d: DevolucionFalsa = { pagoId: devolucion[1], clave, id: String(9000 + this.devoluciones.length), status: r };
          this.devoluciones.push(d);
          if (r === "approved") Object.assign(p, { status: "refunded", transaction_amount_refunded: p.transaction_amount });
          return json(201, { id: Number(d.id), status: r });
        }
        const pago = /^\/v1\/payments\/(\d+)$/.exec(url.pathname);
        if (req.method === "GET" && pago) {
          this.consultas.push({ token, ruta: url.pathname });
          const p = this.pagos.get(pago[1]);
          if (!p || p.token !== token) return json(404, { message: "Payment not found" });
          const { token: _, ...visible } = p;
          return json(200, { id: Number(pago[1]), ...visible });
        }
        if (req.method === "GET" && url.pathname === "/users/me") {
          const c = this.cuentas.get(token);
          return c ? json(200, { id: 1, ...c }) : json(401, { message: "invalid_token" });
        }
        json(404, { message: "no existe" });
      });
    });
    await new Promise<void>((ok) => this.servidor!.listen(puerto, "127.0.0.1", ok));
    this.base = `http://127.0.0.1:${(this.servidor.address() as { port: number }).port}`;
    return this;
  }

  private vistaSuscripcion(id: string) {
    const s = this.suscripciones.get(id)!;
    return {
      id,
      status: s.status,
      external_reference: s.external_reference,
      reason: s.reason,
      payer_email: s.payer_email,
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: s.monto, currency_id: "ARS", start_date: s.start_date },
      next_payment_date: s.next_payment_date ?? null,
      payment_method_id: s.payment_method_id ?? null,
    };
  }

  /** Quien paga cargó su tarjeta: la suscripción queda autorizada. */
  autorizar(id: string, medio = "visa", proximo = new Date(Date.now() + 30 * 86_400_000)) {
    const s = this.suscripciones.get(id)!;
    Object.assign(s, { status: "authorized", payment_method_id: medio, next_payment_date: proximo.toISOString() });
  }

  /** Un cobro mensual de esa suscripción: `aprobado` → approved; si no, rejected. */
  cobrar(suscripcionId: string, aprobado: boolean, id = `cob-${this.cobros.size + 1}-${Math.random().toString(36).slice(2, 8)}`) {
    const s = this.suscripciones.get(suscripcionId)!;
    this.cobros.set(id, {
      token: s.token,
      preapproval_id: suscripcionId,
      transaction_amount: s.monto,
      status: "processed",
      payment_status: aprobado ? "approved" : "rejected",
      debit_date: new Date().toISOString(),
    });
    return id;
  }

  /**
   * Quien paga completa el pago de una preferencia (de pagos únicos): devuelve el id del pago.
   * `monto` en pesos (por defecto, el de la preferencia).
   */
  pagar(prefId: string, opciones: { aprobado?: boolean; monto?: number; medio?: string } = {}) {
    const pref = this.preferencias.find((p) => p.id === prefId)!;
    const item = (pref.cuerpo.items as { unit_price: number }[])[0];
    const id = String(1_000_000 + this.pagos.size + 1);
    this.pagos.set(id, {
      token: pref.token,
      status: opciones.aprobado === false ? "rejected" : "approved",
      external_reference: String(pref.cuerpo.external_reference),
      transaction_amount: opciones.monto ?? item.unit_price,
      currency_id: "ARS",
      payment_type_id: opciones.medio ?? "credit_card",
      transaction_amount_refunded: 0,
    });
    return id;
  }

  /** Termina una devolución que había quedado en proceso. */
  terminarDevolucion(pagoId: string) {
    const p = this.pagos.get(pagoId)!;
    Object.assign(p, { status: "refunded", transaction_amount_refunded: p.transaction_amount });
    for (const d of this.devoluciones) if (d.pagoId === pagoId) d.status = "approved";
  }

  limpiar() {
    this.devoluciones = [];
    this.devolucionResponde = "approved";
    this.suscripciones.clear();
    this.cobros.clear();
    this.preferencias = [];
    this.pagos.clear();
    this.consultas = [];
  }

  cerrar() {
    return new Promise<void>((ok) => this.servidor?.close(() => ok()) ?? ok());
  }
}
