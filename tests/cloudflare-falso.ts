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
export type RegistroFalso = { id: string; type: string; name: string; content: string; proxied: boolean };
export type ZonaFalsa = { id: string; name?: string; status: string; name_servers: string[]; certificado: string | null; registros?: RegistroFalso[] };

export const TOKEN_CF = "cf-token-de-prueba";
export const ZONA_CF = "zona-plataforma";
export const CUENTA_CF = "cuenta-deoco";
export const NAMESERVERS = ["ana.ns.cloudflare.com", "bob.ns.cloudflare.com"];

export class CloudflareFalso {
  hostnames = new Map<string, HostnameFalso>();
  zonas = new Map<string, ZonaFalsa>();
  pedidos: { metodo: string; ruta: string }[] = [];
  /** Próximas respuestas forzadas (p. ej. 503), en orden. */
  fallas: number[] = [];
  /** Hostnames o zonas que Cloudflare rechaza (error de datos). */
  rechazados = new Set<string>();
  /** Dominios que todavía no están registrados (no se puede crear su zona). */
  sinRegistrar = new Set<string>();
  /** Lo que cada dominio tiene en su DNS actual: lo trae `jump_start` al crear la zona. */
  dnsAnterior = new Map<string, Omit<RegistroFalso, "id">[]>();
  activaciones: string[] = [];
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
        if (url.pathname === "/zones" && req.method === "POST") {
          const c = JSON.parse(cuerpo || "{}") as { name: string; account?: { id?: string }; jump_start?: boolean };
          if (c.account?.id !== CUENTA_CF) return error(403, 1000, "Invalid account");
          if (this.sinRegistrar.has(c.name)) return error(400, 1049, `${c.name} is not a registered domain`);
          if (this.rechazados.has(c.name)) return error(400, 1099, "Invalid zone name");
          if ([...this.zonas.values()].some((z) => z.name === c.name)) return error(400, 1061, `${c.name} already exists`);
          const registros = c.jump_start ? (this.dnsAnterior.get(c.name) ?? []).map((r) => ({ ...r, id: `r-${++this.n}` })) : [];
          const z: ZonaFalsa = { id: `z-${++this.n}`, name: c.name, status: "pending", name_servers: [...NAMESERVERS], certificado: null, registros };
          this.zonas.set(z.id, z);
          return ok({ id: z.id, name: z.name, status: z.status, name_servers: z.name_servers });
        }
        if (url.pathname === "/zones" && req.method === "GET") {
          const nombre = url.searchParams.get("name");
          return ok([...this.zonas.values()].filter((z) => z.name === nombre).map((z) => ({ id: z.id, name: z.name, status: z.status, name_servers: z.name_servers })));
        }
        const rec = url.pathname.match(/^\/zones\/([^/]+)\/dns_records(?:\/([^/]+))?$/);
        if (rec) {
          const z = this.zonas.get(rec[1]);
          if (!z) return error(404, 1001, "Invalid zone identifier");
          z.registros ??= [];
          if (req.method === "GET") return ok(z.registros);
          if (req.method === "POST") {
            const c = JSON.parse(cuerpo || "{}") as { type: string; name: string; content: string; proxied?: boolean };
            if (z.registros.some((r) => r.type === c.type && r.name === c.name && r.content === c.content)) return error(400, 81058, "An identical record already exists.");
            z.registros.push({ id: `r-${++this.n}`, type: c.type, name: c.name, content: c.content, proxied: Boolean(c.proxied) });
            return ok({});
          }
          if (req.method === "DELETE" && rec[2]) {
            z.registros = z.registros.filter((r) => r.id !== rec[2]);
            return ok({ id: rec[2] });
          }
        }
        const act = url.pathname.match(/^\/zones\/([^/]+)\/activation_check$/);
        if (act && req.method === "PUT") {
          this.activaciones.push(act[1]);
          return ok({ id: act[1] });
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
    env.DEOCO_CLOUDFLARE_CUENTA = CUENTA_CF;
    env.DEOCO_IP_PUBLICA = "203.0.113.10";
  }

  /** La zona de `dominio`. */
  zonaDe(dominio: string): ZonaFalsa | undefined {
    return [...this.zonas.values()].find((z) => z.name === dominio);
  }

  /** La banda cambió los nameservers: Cloudflare activa la zona (y emite el certificado universal). */
  activarZona(dominio: string, certificado: string | null = "active") {
    const z = this.zonaDe(dominio);
    if (!z) throw new Error(`no hay zona para ${dominio}`);
    z.status = "active";
    z.certificado = certificado;
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
    this.sinRegistrar.clear();
    this.dnsAnterior.clear();
    this.activaciones = [];
  }

  async cerrar() {
    await new Promise<void>((ok) => (this.servidor ? this.servidor.close(() => ok()) : ok()));
  }
}
