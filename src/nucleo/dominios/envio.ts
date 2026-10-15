// El proveedor de envío de correo desde los dominios de las bandas (hoy Resend), detrás de una
// interfaz (docs/diseno-dominios.md §6). Da de alta el dominio, dice qué registros DNS crear y
// si ya está verificado. Credencial de la plataforma, del entorno (nunca de `secreto`):
//   DEOCO_RESEND_TOKEN  API key de Resend (la misma cuenta que DEOCO_SMTP_URL)
//   DEOCO_RESEND_API    (pruebas) servidor local que imita la API
import type { RegistroDns } from "./proveedor";
import { ErrorProveedor } from "./proveedor";

export type EstadoEnvio = "pendiente" | "verificado" | "fallido";

/** Un dominio de envío. `registros`: nombres completos (send.labanda.com), listos para el DNS. */
export type DominioEnvio = { id: string; estado: EstadoEnvio; registros: (RegistroDns & { prioridad?: number })[] };

export interface DominioDeEnvio {
  /** Da de alta el dominio (si ya está en la cuenta, devuelve el que hay). */
  crear(dominio: string): Promise<DominioEnvio>;
  /** null: no existe. */
  consultar(id: string): Promise<DominioEnvio | null>;
  /** Le pide que mire los registros ya. */
  verificar(id: string): Promise<void>;
  borrar(id: string): Promise<void>;
}

type DominioResend = {
  id: string;
  name: string;
  status?: string;
  records?: { record?: string; name: string; type: string; value: string; priority?: number }[];
};

/** Resend como DominioDeEnvio. */
class Resend implements DominioDeEnvio {
  constructor(private readonly cfg: { token: string; api: string }) {}

  private async llamar<T>(metodo: "GET" | "POST" | "DELETE", ruta: string, cuerpo?: unknown): Promise<T | null> {
    let r: Response;
    try {
      r = await fetch(`${this.cfg.api}${ruta}`, {
        method: metodo,
        headers: { authorization: `Bearer ${this.cfg.token}`, "content-type": "application/json" },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      throw new ErrorProveedor(`Resend no respondió (${metodo} ${ruta}): ${e instanceof Error ? e.message : e}`, "temporal");
    }
    if (r.status === 404) return null;
    if (!r.ok) {
      // El mensaje de Resend sirve para diagnosticar; la clave nunca aparece en él.
      const detalle = (await r.text().catch(() => "")).slice(0, 300);
      throw new ErrorProveedor(`Resend respondió ${r.status} en ${metodo} ${ruta}: ${detalle}`, r.status >= 500 || r.status === 429 ? "temporal" : "datos");
    }
    return (await r.json().catch(() => ({}))) as T;
  }

  async crear(dominio: string): Promise<DominioEnvio> {
    try {
      const d = await this.llamar<DominioResend>("POST", "/domains", { name: dominio });
      return aDominio(d!, dominio);
    } catch (e) {
      if (!(e instanceof ErrorProveedor) || e.tipo !== "datos") throw e;
      // Ya está en la cuenta (una banda que lo vuelve a configurar): el que hay.
      const lista = await this.llamar<{ data: DominioResend[] }>("GET", "/domains");
      const ya = lista?.data.find((x) => x.name === dominio);
      if (!ya) throw e;
      return (await this.consultar(ya.id)) ?? aDominio(ya, dominio);
    }
  }

  async consultar(id: string): Promise<DominioEnvio | null> {
    const d = await this.llamar<DominioResend>("GET", `/domains/${encodeURIComponent(id)}`);
    return d ? aDominio(d, d.name) : null;
  }

  async verificar(id: string): Promise<void> {
    await this.llamar("POST", `/domains/${encodeURIComponent(id)}/verify`);
  }

  async borrar(id: string): Promise<void> {
    await this.llamar("DELETE", `/domains/${encodeURIComponent(id)}`);
  }
}

const PARA: Record<string, string> = {
  DKIM: "Firma tus mails (que no caigan en spam).",
  SPF: "Autoriza a Deoco a mandar desde tu dominio.",
  DMARC: "Política de tu dominio para los mails.",
};

function aDominio(d: DominioResend, dominio: string): DominioEnvio {
  const estado: EstadoEnvio = d.status === "verified" ? "verificado" : d.status === "failed" ? "fallido" : "pendiente";
  const registros = (d.records ?? []).map((r) => ({
    tipo: r.type,
    // Resend da el nombre relativo al dominio ("send", "resend._domainkey").
    nombre: r.name === "@" || r.name === "" ? dominio : r.name.endsWith(`.${dominio}`) || r.name === dominio ? r.name : `${r.name}.${dominio}`,
    valor: r.value.replace(/^"(.*)"$/, "$1"),
    para: `${PARA[r.record ?? ""] ?? "Lo pide el envío de correo."}${r.priority !== undefined ? ` Prioridad ${r.priority}.` : ""}`,
    ...(r.priority !== undefined ? { prioridad: r.priority } : {}),
  }));
  return { id: d.id, estado, registros };
}

/** El proveedor de envío configurado, o null si este servidor no manda desde dominios de bandas. */
export function dominioDeEnvio(env: Record<string, string | undefined> = process.env): DominioDeEnvio | null {
  const token = env.DEOCO_RESEND_TOKEN?.trim();
  if (!token) return null;
  return new Resend({ token, api: env.DEOCO_RESEND_API?.trim() || "https://api.resend.com" });
}
