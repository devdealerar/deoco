// Servidor local que imita lo que Deoco usa de la API v4 de Cloudflare: custom hostnames en la
// zona de la plataforma (Cloudflare for SaaS) y la lectura de zonas con su certificado
// universal. Las pruebas cambian el estado a mano (`activar`, `zonas.set`) como lo haría
// Cloudflare al ver el CNAME o los nameservers.
import { createServer, type Server } from "node:http";

export type HostnameFalso = {
  id: string;
  hostname: string;
  status: string;
  ssl: { status: string; validation_records?: { txt_name: string; txt_value: string }[] };
};
export type ZonaFalsa = { id: string; status: string; name_servers: string[]; certificado: string | null };

export const TOKEN_CF = "cf-token-de-prueba";
export const ZONA_CF = "zona-plataforma";

export class CloudflareFalso {
  hostnames = new Map<string, HostnameFalso>();
  zonas = new Map<string, ZonaFalsa>();
  pedidos: { metodo: string; ruta: string }[] = [];
  /** Próximas respuestas forzadas (p. ej. 503), en orden. */
  fallas: number[] = [];
  /** Hostnames que Cloudflare rechaza (error de datos). */
  rechazados = new Set<string>();
  private servidor?: Server;
  base = "";
  private n = 0;

  async iniciar(puerto = 0) {
    this.servidor = createServer((req, res) => {
      let cuerpo = "";
      req.on("data", (c) => (cuerpo += c));
      req.on("end", () => {
        const url = new URL(req.url ?? "/", "http://x");
        const json = (estado: number, datos: unknown) => {
          res.writeHead(estado, { "content-type": "application/json" });
          res.end(JSON.stringify(datos));
        };
        const ok = (result: unknown) => json(200, { success: true, errors: [], messages: [], result });
        const error = (estado: number, code: number, message: string) => json(estado, { success: false, errors: [{ code, message }], result: null });
        this.pedidos.push({ metodo: req.method ?? "", ruta: url.pathname });
        if (req.headers.authorization !== `Bearer ${TOKEN_CF}`) return error(403, 10000, "Authentication error");
        const forzada = this.fallas.shift();
        if (forzada) return error(forzada, 10001, "Service unavailable");

        const ch = url.pathname.match(/^\/zones\/([^/]+)\/custom_hostnames(?:\/([^/]+))?$/);
        if (ch) {
          if (ch[1] !== ZONA_CF) return error(404, 1001, "Invalid zone identifier");
          const id = ch[2];
          if (!id && req.method === "POST") {
            const { hostname } = JSON.parse(cuerpo || "{}") as { hostname: string };
            if (this.rechazados.has(hostname)) return error(400, 1407, "Invalid custom hostname.");
            if ([...this.hostnames.values()].some((h) => h.hostname === hostname)) return error(409, 1406, "Duplicate custom hostname found.");
            const h: HostnameFalso = { id: `ch-${++this.n}`, hostname, status: "pending", ssl: { status: "initializing" } };
            this.hostnames.set(h.id, h);
            return ok(h);
          }
          if (!id && req.method === "GET") {
            const buscado = url.searchParams.get("hostname");
            return ok([...this.hostnames.values()].filter((h) => !buscado || h.hostname === buscado));
          }
          const h = id ? this.hostnames.get(id) : undefined;
          if (!h) return error(404, 1436, "The custom hostname was not found.");
          if (req.method === "GET") return ok(h);
          if (req.method === "DELETE") {
            this.hostnames.delete(h.id);
            return ok({ id: h.id });
          }
        }
        const certs = url.pathname.match(/^\/zones\/([^/]+)\/ssl\/certificate_packs$/);
        if (certs && req.method === "GET") {
          const z = this.zonas.get(certs[1]);
          if (!z) return error(404, 1001, "Invalid zone identifier");
          return ok(z.certificado ? [{ id: `cp-${z.id}`, type: "universal", status: z.certificado }] : []);
        }
        const zona = url.pathname.match(/^\/zones\/([^/]+)$/);
        if (zona && req.method === "GET") {
          const z = this.zonas.get(zona[1]);
          if (!z) return error(404, 1001, "Invalid zone identifier");
          return ok({ id: z.id, status: z.status, name_servers: z.name_servers });
        }
        return error(404, 7003, "Could not route");
      });
    });
    await new Promise<void>((ok) => this.servidor!.listen(puerto, "127.0.0.1", ok));
    this.base = `http://127.0.0.1:${(this.servidor.address() as { port: number }).port}`;
    return this;
  }

  /** Configura el entorno para que la app use este servidor. */
  usar(env: Record<string, string | undefined> = process.env) {
    env.DEOCO_CLOUDFLARE_API = this.base;
    env.DEOCO_CLOUDFLARE_TOKEN = TOKEN_CF;
    env.DEOCO_CLOUDFLARE_ZONA = ZONA_CF;
  }

  /** El custom hostname de `dominio`. */
  de(dominio: string): HostnameFalso | undefined {
    return [...this.hostnames.values()].find((h) => h.hostname === dominio);
  }

  /** Cloudflare vio el CNAME (`status`) y emitió el certificado (`ssl`). */
  activar(dominio: string, estado: { status?: string; ssl?: string } = {}) {
    const h = this.de(dominio);
    if (!h) throw new Error(`no hay custom hostname para ${dominio}`);
    h.status = estado.status ?? "active";
    h.ssl.status = estado.ssl ?? "active";
  }

  limpiar() {
    this.hostnames.clear();
    this.zonas.clear();
    this.pedidos = [];
    this.fallas = [];
    this.rechazados.clear();
  }

  async cerrar() {
    await new Promise<void>((ok) => (this.servidor ? this.servidor.close(() => ok()) : ok()));
  }
}
