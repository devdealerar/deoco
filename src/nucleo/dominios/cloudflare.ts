// Cloudflare como ProveedorDns: custom hostnames (Cloudflare for SaaS) en la zona de la
// plataforma y lectura de zonas de nuestra cuenta. Solo la API v4 y fetch.
import { ErrorProveedor, type Hostname, type ProveedorDns, type RegistroDns, type Zona } from "./proveedor";

type Respuesta<T> = { success: boolean; errors?: { code: number; message: string }[]; result: T };

type HostnameCf = {
  id: string;
  hostname: string;
  status?: string;
  ssl?: { status?: string; validation_records?: { txt_name?: string; txt_value?: string }[] };
  ownership_verification?: { type?: string; name?: string; value?: string };
};

/** Error de Cloudflare cuando el custom hostname ya existe en la zona. */
const DUPLICADO = 1406;

export class Cloudflare implements ProveedorDns {
  constructor(private readonly cfg: { token: string; zona: string; api: string }) {}

  /** null si respondió 404. */
  private async llamar<T>(metodo: "GET" | "POST" | "DELETE", ruta: string, cuerpo?: unknown): Promise<Respuesta<T> | null> {
    let r: Response;
    try {
      r = await fetch(`${this.cfg.api}${ruta}`, {
        method: metodo,
        headers: { authorization: `Bearer ${this.cfg.token}`, "content-type": "application/json" },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      throw new ErrorProveedor(`Cloudflare no respondió (${metodo} ${ruta.split("?")[0]}): ${e instanceof Error ? e.message : e}`, "temporal");
    }
    if (r.status === 404) return null;
    const datos = (await r.json().catch(() => null)) as Respuesta<T> | null;
    if (r.ok && datos?.success) return datos;
    // El mensaje de Cloudflare sirve para diagnosticar; el token nunca aparece en él.
    const errores = datos?.errors ?? [];
    const detalle = errores.map((e) => `${e.code} ${e.message}`).join("; ") || `HTTP ${r.status}`;
    const error = new ErrorProveedor(`Cloudflare: ${detalle} (${metodo} ${ruta.split("?")[0]})`, r.status >= 500 || r.status === 429 ? "temporal" : "datos");
    if (errores.some((e) => e.code === DUPLICADO)) Object.assign(error, { duplicado: true });
    throw error;
  }

  private base = () => `/zones/${this.cfg.zona}/custom_hostnames`;

  async crearHostname(dominio: string): Promise<Hostname> {
    try {
      // Validación del certificado por HTTP: alcanza con el CNAME, la banda no carga nada más.
      const r = await this.llamar<HostnameCf>("POST", this.base(), { hostname: dominio, ssl: { method: "http", type: "dv" } });
      return aHostname(r!.result);
    } catch (e) {
      if (!(e as { duplicado?: boolean }).duplicado) throw e;
      const r = await this.llamar<HostnameCf[]>("GET", `${this.base()}?hostname=${encodeURIComponent(dominio)}`);
      const h = r?.result.find((x) => x.hostname === dominio);
      if (!h) throw e;
      return aHostname(h);
    }
  }

  async hostname(id: string): Promise<Hostname | null> {
    const r = await this.llamar<HostnameCf>("GET", `${this.base()}/${encodeURIComponent(id)}`);
    return r ? aHostname(r.result) : null;
  }

  async borrarHostname(id: string): Promise<void> {
    await this.llamar("DELETE", `${this.base()}/${encodeURIComponent(id)}`);
  }

  async zona(id: string): Promise<Zona | null> {
    const z = await this.llamar<{ id: string; status: string; name_servers?: string[] }>("GET", `/zones/${encodeURIComponent(id)}`);
    if (!z) return null;
    const certs = await this.llamar<{ type: string; status: string }[]>("GET", `/zones/${encodeURIComponent(id)}/ssl/certificate_packs?status=all`);
    const universal = certs?.result.find((c) => c.type === "universal");
    return { id: z.result.id, estado: z.result.status, certificado: universal?.status ?? null, nameservers: z.result.name_servers ?? [] };
  }
}

function aHostname(h: HostnameCf): Hostname {
  const validacion: RegistroDns[] = [];
  for (const v of h.ssl?.validation_records ?? []) {
    if (v.txt_name && v.txt_value) validacion.push({ tipo: "TXT", nombre: v.txt_name, valor: v.txt_value, para: "Valida el certificado." });
  }
  const o = h.ownership_verification;
  if (o?.type === "txt" && o.name && o.value) validacion.push({ tipo: "TXT", nombre: o.name, valor: o.value, para: "Confirma el dominio ante Cloudflare." });
  return { id: h.id, estado: h.status ?? "pending", ssl: h.ssl?.status ?? "initializing", validacion };
}
