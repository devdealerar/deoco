// Servidor local que imita lo que Deoco usa de la API de Resend para los dominios de envío de
// las bandas: alta (con los registros que pide), consulta, verificación y baja. Las pruebas
// marcan un dominio como verificado a mano (`verificar`), como lo haría Resend al ver el DNS.
import { createServer, type Server } from "node:http";

export const TOKEN_RESEND = "re_prueba";

export type DominioFalso = {
  id: string;
  name: string;
  status: string;
  records: { record: string; name: string; type: string; value: string; priority?: number }[];
};

export class ResendFalso {
  dominios = new Map<string, DominioFalso>();
  verificaciones: string[] = [];
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
        if (req.headers.authorization !== `Bearer ${TOKEN_RESEND}`) return json(401, { name: "missing_api_key" });
        if (url.pathname === "/domains" && req.method === "POST") {
          const { name } = JSON.parse(cuerpo || "{}") as { name: string };
          if ([...this.dominios.values()].some((d) => d.name === name)) return json(403, { name: "validation_error", message: `The ${name} domain has been registered already.` });
          const d: DominioFalso = {
            id: `dom-${++this.n}`,
            name,
            status: "not_started",
            records: [
              { record: "SPF", name: "send", type: "MX", value: "feedback-smtp.us-east-1.amazonses.com", priority: 10 },
              { record: "SPF", name: "send", type: "TXT", value: '"v=spf1 include:amazonses.com ~all"' },
              { record: "DKIM", name: "resend._domainkey", type: "TXT", value: `p=CLAVE${this.n}` },
            ],
          };
          this.dominios.set(d.id, d);
          return json(200, d);
        }
        if (url.pathname === "/domains" && req.method === "GET") return json(200, { data: [...this.dominios.values()] });
        const m = url.pathname.match(/^\/domains\/([^/]+)(\/verify)?$/);
        const d = m ? this.dominios.get(m[1]) : undefined;
        if (!d) return json(404, { name: "not_found" });
        if (m![2] && req.method === "POST") {
          this.verificaciones.push(d.id);
          if (d.status === "not_started") d.status = "pending";
          return json(200, { object: "domain", id: d.id });
        }
        if (req.method === "GET") return json(200, d);
        if (req.method === "DELETE") {
          this.dominios.delete(d.id);
          return json(200, { object: "domain", id: d.id, deleted: true });
        }
        return json(404, { name: "not_found" });
      });
    });
    await new Promise<void>((ok) => this.servidor!.listen(puerto, "127.0.0.1", ok));
    this.base = `http://127.0.0.1:${(this.servidor.address() as { port: number }).port}`;
    return this;
  }

  usar(env: Record<string, string | undefined> = process.env) {
    env.DEOCO_RESEND_API = this.base;
    env.DEOCO_RESEND_TOKEN = TOKEN_RESEND;
  }

  de(nombre: string) {
    return [...this.dominios.values()].find((d) => d.name === nombre);
  }

  /** Resend vio los registros: el dominio queda verificado. */
  verificar(nombre: string) {
    this.de(nombre)!.status = "verified";
  }

  limpiar() {
    this.dominios.clear();
    this.verificaciones = [];
  }

  async cerrar() {
    await new Promise<void>((ok) => (this.servidor ? this.servidor.close(() => ok()) : ok()));
  }
}
