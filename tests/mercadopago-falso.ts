// Servidor local que imita la API de Mercado Pago (lo que usa la tienda). Cada pago pertenece
// a una cuenta (su access token), como en Mercado Pago: otra cuenta no lo ve.
import { createServer, type Server } from "node:http";

export type PreferenciaRecibida = { token: string; cuerpo: Record<string, unknown>; id: string };
export type PagoFalso = { status: string; external_reference: string; transaction_amount: number; currency_id: string; token: string };

export class MercadoPagoFalso {
  preferencias: PreferenciaRecibida[] = [];
  pagos = new Map<string, PagoFalso>();
  cuentas = new Map<string, { nickname: string; email: string }>();
  consultas: { token: string; ruta: string }[] = [];
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
        if (req.method === "GET" && url.pathname === "/checkout") {
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          return res.end(`<!doctype html><title>Mercado Pago (falso)</title><h1 data-pasarela>Pagá con Mercado Pago</h1><p>${url.searchParams.get("pref")}</p>`);
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

  limpiar() {
    this.preferencias = [];
    this.pagos.clear();
    this.consultas = [];
  }

  cerrar() {
    return new Promise<void>((ok) => this.servidor?.close(() => ok()) ?? ok());
  }
}
