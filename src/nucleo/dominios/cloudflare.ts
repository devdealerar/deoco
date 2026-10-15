// Cloudflare como ProveedorDns: custom hostnames (Cloudflare for SaaS) en la zona de la
// plataforma y lectura de zonas de nuestra cuenta. Solo la API v4 y fetch.
import { ErrorProveedor, type Hostname, type ProveedorDns, type RegistroDns, type RegistroZona, type Zona } from "./proveedor";

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
/** La zona ya existe en la cuenta. */
const ZONA_DUPLICADA = 1061;
/** "<dominio> is not a registered domain". */
const SIN_REGISTRAR = 1049;
/** El registro DNS ya existe (crear es idempotente). */
const REGISTRO_DUPLICADO = [81053, 81057, 81058];

type ZonaCf = { id: string; name: string; status: string; name_servers?: string[] };
type RegistroCf = { id: string; type: string; name: string; content: string; proxied?: boolean; priority?: number };

export class Cloudflare implements ProveedorDns {
  constructor(private readonly cfg: { token: string; zona: string; cuenta: string; kv: string; worker: string; api: string }) {}

  /** null si respondió 404. */
  private async llamar<T>(metodo: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", ruta: string, cuerpo?: unknown, texto = false): Promise<Respuesta<T> | null> {
    let r: Response;
    try {
      r = await fetch(`${this.cfg.api}${ruta}`, {
        method: metodo,
        headers: { authorization: `Bearer ${this.cfg.token}`, "content-type": texto ? "text/plain" : "application/json" },
        body: cuerpo === undefined ? undefined : texto ? String(cuerpo) : JSON.stringify(cuerpo),
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
    const tipo = r.status >= 500 || r.status === 429 ? "temporal" : errores.some((e) => e.code === SIN_REGISTRAR) ? "sin-registrar" : "datos";
    const error = new ErrorProveedor(`Cloudflare: ${detalle} (${metodo} ${ruta.split("?")[0]})`, tipo);
    if (errores.some((e) => e.code === DUPLICADO || e.code === ZONA_DUPLICADA)) Object.assign(error, { duplicado: true });
    if (errores.some((e) => REGISTRO_DUPLICADO.includes(e.code))) Object.assign(error, { registroDuplicado: true });
    throw error;
  }

  private base = () => `/zones/${this.cfg.zona}/custom_hostnames`;

  async crearHostname(dominio: string, opciones: { porTxt?: boolean } = {}): Promise<Hostname> {
    try {
      // Por defecto, validación del certificado por HTTP: alcanza con el CNAME, la banda no carga nada más.
      const r = await this.llamar<HostnameCf>("POST", this.base(), { hostname: dominio, ssl: { method: opciones.porTxt ? "txt" : "http", type: "dv" } });
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

  async validarPorHttp(id: string): Promise<void> {
    await this.llamar("PATCH", `${this.base()}/${encodeURIComponent(id)}`, { ssl: { method: "http", type: "dv" } });
  }

  async borrarHostname(id: string): Promise<void> {
    await this.llamar("DELETE", `${this.base()}/${encodeURIComponent(id)}`);
  }

  async zona(id: string): Promise<Zona | null> {
    const z = await this.llamar<ZonaCf>("GET", `/zones/${encodeURIComponent(id)}`);
    if (!z) return null;
    const certs = await this.llamar<{ type: string; status: string }[]>("GET", `/zones/${encodeURIComponent(id)}/ssl/certificate_packs?status=all`);
    const universal = certs?.result.find((c) => c.type === "universal");
    return { id: z.result.id, estado: z.result.status, certificado: universal?.status ?? null, nameservers: z.result.name_servers ?? [] };
  }

  async crearZona(dominio: string): Promise<Zona> {
    if (!this.cfg.cuenta) throw new ErrorProveedor("Falta DEOCO_CLOUDFLARE_CUENTA para crear zonas.", "datos");
    try {
      // jump_start: Cloudflare trae los registros que el dominio ya tiene en su DNS actual.
      const r = await this.llamar<ZonaCf>("POST", "/zones", { name: dominio, account: { id: this.cfg.cuenta }, type: "full", jump_start: true });
      return { id: r!.result.id, estado: r!.result.status, certificado: null, nameservers: r!.result.name_servers ?? [] };
    } catch (e) {
      if (!(e as { duplicado?: boolean }).duplicado) throw e;
      const r = await this.llamar<ZonaCf[]>("GET", `/zones?name=${encodeURIComponent(dominio)}&account.id=${encodeURIComponent(this.cfg.cuenta)}`);
      const z = r?.result.find((x) => x.name === dominio);
      if (!z) throw e;
      return { id: z.id, estado: z.status, certificado: null, nameservers: z.name_servers ?? [] };
    }
  }

  async registros(zonaId: string): Promise<RegistroZona[]> {
    const r = await this.llamar<RegistroCf[]>("GET", `/zones/${encodeURIComponent(zonaId)}/dns_records?per_page=500`);
    return (r?.result ?? []).map((x) => ({
      id: x.id,
      tipo: x.type,
      nombre: x.name,
      valor: x.content,
      proxy: Boolean(x.proxied),
      ...(x.priority !== undefined ? { prioridad: x.priority } : {}),
    }));
  }

  async crearRegistro(zonaId: string, r: Omit<RegistroZona, "id">): Promise<void> {
    try {
      await this.llamar("POST", `/zones/${encodeURIComponent(zonaId)}/dns_records`, {
        type: r.tipo,
        name: r.nombre,
        content: r.valor,
        proxied: r.proxy,
        ttl: 1,
        ...(r.prioridad !== undefined ? { priority: r.prioridad } : {}),
      });
    } catch (e) {
      if (!(e as { registroDuplicado?: boolean }).registroDuplicado) throw e;
    }
  }

  async borrarRegistro(zonaId: string, registroId: string): Promise<void> {
    await this.llamar("DELETE", `/zones/${encodeURIComponent(zonaId)}/dns_records/${encodeURIComponent(registroId)}`);
  }

  async ajustarZona(zonaId: string): Promise<void> {
    const z = encodeURIComponent(zonaId);
    await this.llamar("PATCH", `/zones/${z}/settings/ssl`, { value: "full" });
    await this.llamar("PATCH", `/zones/${z}/settings/always_use_https`, { value: "on" });
  }

  async prenderRecepcion(zonaId: string): Promise<void> {
    const z = encodeURIComponent(zonaId);
    await this.llamar("POST", `/zones/${z}/email/routing/enable`, {});
    await this.llamar("PUT", `/zones/${z}/email/routing/rules/catch_all`, {
      enabled: true,
      matchers: [{ type: "all" }],
      actions: [{ type: "worker", value: [this.cfg.worker] }],
    });
  }

  async fijarReenvio(direccion: string, destino: string | null): Promise<void> {
    if (!this.cfg.cuenta || !this.cfg.kv) throw new ErrorProveedor("Faltan DEOCO_CLOUDFLARE_CUENTA o DEOCO_CLOUDFLARE_KV para el reenvío.", "datos");
    const ruta = `/accounts/${encodeURIComponent(this.cfg.cuenta)}/storage/kv/namespaces/${encodeURIComponent(this.cfg.kv)}/values/${encodeURIComponent(direccion)}`;
    if (destino === null) await this.llamar("DELETE", ruta);
    else await this.llamar("PUT", ruta, destino, true);
  }

  async borrarZona(zonaId: string): Promise<void> {
    await this.llamar("DELETE", `/zones/${encodeURIComponent(zonaId)}`);
  }

  async revisarActivacion(zonaId: string): Promise<void> {
    await this.llamar("PUT", `/zones/${encodeURIComponent(zonaId)}/activation_check`);
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
