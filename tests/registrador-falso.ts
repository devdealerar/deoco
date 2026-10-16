// Servidor local que imita lo que Deoco usa de la API de GoDaddy (revendedor con subcuentas): las
// escrituras contestan 202 y quedan como acciones que las pruebas terminan a mano (`terminar`),
// como lo haría GoDaddy. Simula dominio tomado, falta de saldo, datos inválidos y caídas.
import { createServer, type Server } from "node:http";

export const CLAVE_GD = "gd-clave";
export const SECRETO_GD = "gd-secreto";

export type DominioGd = { domain: string; customerId: string; expiresAt: string; locked: boolean; nameServers: string[]; authCode: string; contacts?: unknown };
export type AccionGd = { type: string; status: string; reason?: { code: string; message: string } };
type Pendiente = { tipo: string; dominio: string; customerId: string; aplicar: () => void };

export class RegistradorFalso {
  /** Dominios ya registrados por cualquiera (no disponibles). */
  tomados = new Set<string>();
  /** Precio de costo (millonésimas de USD por año) por TLD. */
  precios: Record<string, number> = { com: 11_990_000, ar: 0 };
  sinSaldo = false;
  /** Lo que tarda en contestar cada pedido (para las pruebas de carga). */
  demoraMs = 0;
  /** Próximas respuestas forzadas (p. ej. 503), en orden. */
  fallas: number[] = [];
  clientes = new Map<string, { shopperId: string; email: string }>();
  dominios = new Map<string, DominioGd>();
  acciones = new Map<string, AccionGd>();
  pendientes: Pendiente[] = [];
  pedidos: { metodo: string; ruta: string; cuerpo?: unknown; shopper?: string }[] = [];
  private servidor?: Server;
  base = "";
  private n = 0;

  async iniciar(puerto = 0) {
    this.servidor = createServer((req, res) => {
      let cuerpo = "";
      req.on("data", (c) => (cuerpo += c));
      req.on("end", () => setTimeout(() => {
        const url = new URL(req.url ?? "/", "http://x");
        const datos = cuerpo ? JSON.parse(cuerpo) : undefined;
        const json = (estado: number, d?: unknown) => {
          res.writeHead(estado, { "content-type": "application/json" });
          res.end(d === undefined ? "" : JSON.stringify(d));
        };
        const error = (estado: number, code: string, message: string, fields?: unknown) => json(estado, { code, message, fields });
        this.pedidos.push({ metodo: req.method ?? "", ruta: url.pathname, cuerpo: datos, shopper: req.headers["x-shopper-id"] as string | undefined });
        if (req.headers.authorization !== `sso-key ${CLAVE_GD}:${SECRETO_GD}`) return error(401, "UNABLE_TO_AUTHENTICATE", "Unauthorized");
        const forzada = this.fallas.shift();
        if (forzada) return error(forzada, "INTERNAL_SERVER_ERROR", "Algo falló");
        const p = url.pathname;

        if (p === "/v1/domains/available" && req.method === "GET") {
          const d = url.searchParams.get("domain") ?? "";
          const precio = this.precios[d.split(".").pop() ?? ""];
          const libre = !this.tomados.has(d) && !this.dominios.has(d);
          return json(200, { domain: d, available: libre, definitive: true, ...(libre && precio ? { price: precio, currency: "USD", period: 1 } : {}) });
        }
        if (p === "/v1/domains/agreements" && req.method === "GET") {
          return json(200, [{ agreementKey: "DNRA", title: "Domain Name Registration Agreement", url: "https://www.godaddy.com/agreements/dnra" }]);
        }
        if (p === "/v1/shoppers/subaccount" && req.method === "POST") {
          const customerId = `cust-${++this.n}`;
          const shopperId = `shop-${this.n}`;
          this.clientes.set(customerId, { shopperId, email: datos.email });
          return json(201, { customerId, shopperId });
        }
        const v2 = p.match(/^\/v2\/customers\/([^/]+)\/domains\/(register|[^/]+)(?:\/(.+))?$/);
        if (v2) {
          const [, customerId, segundo, resto] = v2;
          if (!this.clientes.has(customerId)) return error(404, "NOT_FOUND", "Customer not found");
          if (segundo === "register" && req.method === "POST") {
            const d = datos.domain as string;
            if (this.tomados.has(d) || this.dominios.has(d)) return error(422, "UNAVAILABLE_DOMAIN", `${d} is not available`);
            if (this.sinSaldo) return error(402, "INSUFFICIENT_FUNDS", "Not enough account balance");
            const tel = datos.contacts?.registrant?.phone as string | undefined;
            if (!tel || !/^\+\d{1,3}\.\d+$/.test(tel)) return error(422, "INVALID_BODY", "Invalid phone", [{ path: "contacts.registrant.phone", code: "INVALID_PHONE" }]);
            return this.aceptar(res, customerId, d, "REGISTER", () => {
              const vence = new Date();
              vence.setFullYear(vence.getFullYear() + (datos.period ?? 1));
              this.dominios.set(d, { domain: d, customerId, expiresAt: vence.toISOString(), locked: true, nameServers: datos.nameServers ?? [], authCode: `AUTH-${d}` });
            });
          }
          const dominio = decodeURIComponent(segundo);
          const reg = this.dominios.get(dominio);
          if (!resto && req.method === "GET") {
            if (!reg || reg.customerId !== customerId) return error(404, "NOT_FOUND", "Domain not found");
            return json(200, { domain: reg.domain, expiresAt: reg.expiresAt, locked: reg.locked, nameServers: reg.nameServers });
          }
          const accion = resto?.match(/^actions\/(.+)$/);
          if (accion && req.method === "GET") {
            const a = this.acciones.get(`${customerId}|${dominio}|${accion[1]}`);
            return a ? json(200, a) : error(404, "NOT_FOUND", "Action not found");
          }
          if (resto === "transfer" && req.method === "POST") {
            if (this.sinSaldo) return error(402, "INSUFFICIENT_FUNDS", "Not enough account balance");
            return this.aceptar(res, customerId, dominio, "TRANSFER", () => {
              const vence = new Date();
              vence.setFullYear(vence.getFullYear() + 1);
              this.tomados.delete(dominio);
              this.dominios.set(dominio, { domain: dominio, customerId, expiresAt: vence.toISOString(), locked: true, nameServers: [], authCode: `AUTH-${dominio}` });
            });
          }
          if (!reg || reg.customerId !== customerId) return error(404, "NOT_FOUND", "Domain not found");
          if (resto === "nameServers" && req.method === "PUT") {
            return this.aceptar(res, customerId, dominio, "DOMAIN_UPDATE_NAME_SERVERS", () => void (reg.nameServers = datos.nameServers));
          }
          if (resto === "renew" && req.method === "POST") {
            if (this.sinSaldo) return error(402, "INSUFFICIENT_FUNDS", "Not enough account balance");
            if (new Date(datos.expires).getTime() !== new Date(reg.expiresAt).getTime()) return error(409, "EXPIRATION_MISMATCH", "expires does not match");
            return this.aceptar(res, customerId, dominio, "RENEW", () => {
              const v = new Date(reg.expiresAt);
              v.setFullYear(v.getFullYear() + (datos.period ?? 1));
              reg.expiresAt = v.toISOString();
            });
          }
          if (resto === "contacts" && req.method === "PATCH") {
            return this.aceptar(res, customerId, dominio, "DOMAIN_UPDATE_CONTACTS", () => void (reg.contacts = datos));
          }
        }
        const v1 = p.match(/^\/v1\/domains\/([^/]+)$/);
        if (v1) {
          const reg = this.dominios.get(decodeURIComponent(v1[1]));
          const cuenta = reg && this.clientes.get(reg.customerId);
          if (!reg || cuenta?.shopperId !== req.headers["x-shopper-id"]) return error(404, "NOT_FOUND", "Domain not found");
          if (req.method === "PATCH") {
            if (typeof datos.locked === "boolean") reg.locked = datos.locked;
            return json(204);
          }
          if (req.method === "GET") return json(200, { domain: reg.domain, locked: reg.locked, authCode: reg.authCode });
        }
        return error(404, "NOT_FOUND", `No route ${req.method} ${p}`);
      }, this.demoraMs));
    });
    await new Promise<void>((ok) => this.servidor!.listen(puerto, "127.0.0.1", ok));
    this.base = `http://127.0.0.1:${(this.servidor.address() as { port: number }).port}`;
    return this;
  }

  /** 202 y una acción en curso; `terminar()` la aplica (o la hace fallar). */
  private aceptar(res: import("node:http").ServerResponse, customerId: string, dominio: string, tipo: string, aplicar: () => void) {
    this.acciones.set(`${customerId}|${dominio}|${tipo}`, { type: tipo, status: "PENDING" });
    this.pendientes.push({ tipo, dominio, customerId, aplicar });
    res.writeHead(202, { "content-type": "application/json" });
    res.end("");
  }

  /** Termina las acciones en curso (todas, o las de un tipo): GoDaddy las procesó. */
  terminar(tipo?: string, falla?: string) {
    for (const pe of this.pendientes.filter((x) => !tipo || x.tipo === tipo)) {
      const clave = `${pe.customerId}|${pe.dominio}|${pe.tipo}`;
      if (falla) this.acciones.set(clave, { type: pe.tipo, status: "FAILED", reason: { code: "FAILED", message: falla } });
      else {
        pe.aplicar();
        this.acciones.set(clave, { type: pe.tipo, status: "SUCCESS" });
      }
    }
    this.pendientes = this.pendientes.filter((x) => tipo && x.tipo !== tipo);
  }

  /** La banda se llevó el dominio a otro registrador: ya no está en la subcuenta. */
  transferidoAfuera(dominio: string) {
    this.dominios.delete(dominio);
    this.tomados.add(dominio);
  }

  usar(env: Record<string, string | undefined> = process.env) {
    env.DEOCO_REGISTRADOR = "godaddy";
    env.DEOCO_GODADDY_KEY = CLAVE_GD;
    env.DEOCO_GODADDY_SECRET = SECRETO_GD;
    env.DEOCO_GODADDY_API = this.base;
    // Las pruebas hacen muchos pedidos seguidos: sin el tope de 60 por minuto (la cola se prueba aparte).
    env.DEOCO_GODADDY_POR_MINUTO = "100000";
  }

  limpiar() {
    this.demoraMs = 0;
    this.tomados.clear();
    this.sinSaldo = false;
    this.fallas = [];
    this.clientes.clear();
    this.dominios.clear();
    this.acciones.clear();
    this.pendientes = [];
    this.pedidos = [];
  }

  async cerrar() {
    await new Promise<void>((ok) => (this.servidor ? this.servidor.close(() => ok()) : ok()));
  }
}
