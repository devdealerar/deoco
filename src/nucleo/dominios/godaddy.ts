// GoDaddy como Registrador: API de revendedor, cada banda en su subcuenta (customer) y el dominio
// a nombre de su titular. Confirmado con la documentación oficial (Domains v2, ver
// docs/investigacion-dominios-correo.md): registro con alcance de cliente
// (`/v2/customers/{customerId}/domains`), escrituras que contestan 202 y se consultan, cambio de
// nameservers, transferencia saliente y cambio de titular, 60 pedidos por minuto.
// SIN CONFIRMAR (marcados abajo, a probar en el entorno de pruebas de GoDaddy): disponibilidad y
// condiciones (v1), alta de la subcuenta (v1 shoppers), los nombres de las acciones, desbloqueo y
// código (v1 con X-Shopper-Id), cambio de titular y transferencia entrante (v2).
import { randomBytes } from "node:crypto";
import { Cola } from "./cola";
import {
  type Aceptacion,
  type Condicion,
  type Contacto,
  type Disponibilidad,
  type DominioRegistrado,
  ErrorRegistrador,
  type Operacion,
  type Registrador,
} from "./registrador";

type Config = { clave: string; secreto: string; api: string; porMinuto?: number };
type ErrorGd = { code?: string; message?: string; fields?: { path?: string; code?: string; message?: string }[] };

/** El cliente de Deoco en GoDaddy: `customerId` (v2) y `shopperId` (v1). Opaco para el resto. */
const cliente = (id: string) => {
  const [customerId, shopperId] = id.split("|");
  if (!customerId || !shopperId) throw new ErrorRegistrador(`Cliente del registrador inválido: ${id}`, "desconocido");
  return { customerId, shopperId };
};

const aContacto = (c: Contacto) => ({
  nameFirst: c.nombre,
  nameLast: c.apellido,
  email: c.email,
  phone: c.telefono,
  addressMailing: { address1: c.direccion, city: c.ciudad, state: c.provincia, postalCode: c.codigoPostal, country: c.pais },
});
const contactos = (c: Contacto) => ({ registrant: aContacto(c), admin: aContacto(c), tech: aContacto(c), billing: aContacto(c) });
const consentimiento = (a: Aceptacion) => ({ agreedAt: a.fecha.toISOString(), agreedBy: a.ip, agreementKeys: a.claves });

/** Campos de GoDaddy → los de Contacto (para decirle a la banda qué dato revisar). */
const CAMPOS: Record<string, keyof Contacto> = {
  nameFirst: "nombre",
  nameLast: "apellido",
  email: "email",
  phone: "telefono",
  address1: "direccion",
  city: "ciudad",
  state: "provincia",
  postalCode: "codigoPostal",
  country: "pais",
};

export class GoDaddy implements Registrador {
  readonly nombre = "GoDaddy";
  /** Una instancia (y una cola) por credencial, en este proceso. */
  private static instancias = new Map<string, GoDaddy>();
  static compartido(cfg: Config): GoDaddy {
    const k = `${cfg.api}|${cfg.clave}|${cfg.porMinuto ?? ""}`;
    let g = GoDaddy.instancias.get(k);
    if (!g) GoDaddy.instancias.set(k, (g = new GoDaddy(cfg)));
    return g;
  }

  /** GoDaddy: 60 pedidos por minuto por credencial; por defecto, uno de margen. */
  private readonly cola: Cola;
  constructor(private readonly cfg: Config) {
    this.cola = new Cola(cfg.porMinuto ?? 59, 60_000);
  }

  /** null si una consulta (GET) respondió 404. En una escritura, un 404 es un error: nunca "aceptado". */
  private async llamar<T>(metodo: "GET" | "POST" | "PUT" | "PATCH", ruta: string, cuerpo?: unknown, shopperId?: string): Promise<{ estado: number; datos: T } | null> {
    return this.cola.correr(async () => {
      let r: Response;
      try {
        r = await fetch(`${this.cfg.api}${ruta}`, {
          method: metodo,
          headers: {
            authorization: `sso-key ${this.cfg.clave}:${this.cfg.secreto}`,
            "content-type": "application/json",
            accept: "application/json",
            ...(shopperId ? { "x-shopper-id": shopperId } : {}),
          },
          body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
          signal: AbortSignal.timeout(20_000),
        });
      } catch (e) {
        throw new ErrorRegistrador(`GoDaddy no respondió (${metodo} ${ruta.split("?")[0]}): ${e instanceof Error ? e.message : e}`, "temporal");
      }
      if (r.status === 404 && metodo === "GET") return null;
      const texto = await r.text();
      const datos = texto ? (JSON.parse(texto) as unknown) : {};
      if (r.ok) return { estado: r.status, datos: datos as T };
      throw traducir(r.status, datos as ErrorGd, `${metodo} ${ruta.split("?")[0]}`);
    });
  }

  async disponibilidad(dominio: string): Promise<Disponibilidad> {
    // SIN CONFIRMAR: v1, sin alcance de cliente. `price` en millonésimas de la moneda, por `period` años.
    const r = await this.llamar<{ available: boolean; price?: number; currency?: string; period?: number }>(
      "GET",
      `/v1/domains/available?domain=${encodeURIComponent(dominio)}&checkType=FULL`,
    );
    const d = r?.datos;
    if (!d) throw new ErrorRegistrador(`GoDaddy no sabe nada de ${dominio}.`, "desconocido");
    return {
      dominio,
      disponible: Boolean(d.available),
      costo: d.available && d.price !== undefined ? { centavos: Math.round(d.price / 10_000), moneda: d.currency ?? "USD", anios: d.period ?? 1 } : null,
    };
  }

  async condiciones(tld: string): Promise<Condicion[]> {
    // SIN CONFIRMAR: v1.
    const r = await this.llamar<{ agreementKey: string; title: string; url: string }[]>(
      "GET",
      `/v1/domains/agreements?tlds=${encodeURIComponent(tld)}&privacy=false`,
    );
    return (r?.datos ?? []).map((a) => ({ clave: a.agreementKey, titulo: a.title, url: a.url }));
  }

  async crearCliente(datos: { email: string; nombre: string; apellido: string; referencia: string }): Promise<{ clienteId: string }> {
    // SIN CONFIRMAR: v1 shoppers. La subcuenta es del revendedor; nadie entra con esa contraseña.
    const r = await this.llamar<{ shopperId: string; customerId: string }>("POST", "/v1/shoppers/subaccount", {
      email: datos.email,
      nameFirst: datos.nombre,
      nameLast: datos.apellido,
      password: `${randomBytes(18).toString("base64url")}aA1!`,
      marketId: "es-AR",
    });
    if (!r?.datos.customerId || !r.datos.shopperId) throw new ErrorRegistrador("GoDaddy no devolvió la subcuenta.", "desconocido");
    return { clienteId: `${r.datos.customerId}|${r.datos.shopperId}` };
  }

  async registrar(
    clienteId: string,
    p: { dominio: string; contacto: Contacto; anios: number; nameservers: string[]; aceptacion: Aceptacion },
  ): Promise<Operacion> {
    const { customerId } = cliente(clienteId);
    // Nunca dos veces: si ya está en la subcuenta (una respuesta perdida), está registrado.
    if (await this.dominio(clienteId, p.dominio)) return { id: op(p.dominio, "REGISTER"), estado: "lista" };
    await this.llamar("POST", `/v2/customers/${encodeURIComponent(customerId)}/domains/register`, {
      domain: p.dominio,
      consent: consentimiento(p.aceptacion),
      contacts: contactos(p.contacto),
      nameServers: p.nameservers,
      period: p.anios,
      privacy: false,
      // La renovación la decide la banda pagándola (docs/diseno-dominios.md §9): nunca automática.
      renewAuto: false,
    });
    return { id: op(p.dominio, "REGISTER"), estado: "en-curso" };
  }

  async operacion(clienteId: string, o: Operacion): Promise<Operacion> {
    const { customerId } = cliente(clienteId);
    const [dominio, tipo] = o.id.split("|");
    const r = await this.llamar<{ status?: string; reason?: { message?: string } }>(
      "GET",
      `/v2/customers/${encodeURIComponent(customerId)}/domains/${encodeURIComponent(dominio)}/actions/${encodeURIComponent(tipo)}`,
    );
    if (!r) return { ...o, estado: "en-curso" }; // todavía no aparece la acción
    const s = r.datos.status ?? "";
    if (s === "SUCCESS") return { id: o.id, estado: "lista" };
    if (s === "FAILED" || s === "CANCELLED") return { id: o.id, estado: "fallida", motivo: r.datos.reason?.message ?? s };
    return { id: o.id, estado: "en-curso" };
  }

  async ponerNameservers(clienteId: string, dominio: string, nameservers: string[]): Promise<Operacion> {
    const { customerId } = cliente(clienteId);
    await this.llamar("PUT", `/v2/customers/${encodeURIComponent(customerId)}/domains/${encodeURIComponent(dominio)}/nameServers`, { nameServers: nameservers });
    return { id: op(dominio, "DOMAIN_UPDATE_NAME_SERVERS"), estado: "en-curso" };
  }

  async renovar(clienteId: string, dominio: string, venceEn: Date, anios: number): Promise<Operacion> {
    const { customerId } = cliente(clienteId);
    await this.llamar("POST", `/v2/customers/${encodeURIComponent(customerId)}/domains/${encodeURIComponent(dominio)}/renew`, {
      expires: venceEn.toISOString(),
      period: anios,
    });
    return { id: op(dominio, "RENEW"), estado: "en-curso" };
  }

  async dominio(clienteId: string, dominio: string): Promise<DominioRegistrado | null> {
    const { customerId } = cliente(clienteId);
    const r = await this.llamar<{ domain: string; expiresAt?: string; locked?: boolean; nameServers?: string[] }>(
      "GET",
      `/v2/customers/${encodeURIComponent(customerId)}/domains/${encodeURIComponent(dominio)}`,
    );
    if (!r) return null;
    return {
      dominio: r.datos.domain,
      venceEn: new Date(r.datos.expiresAt ?? 0),
      bloqueado: r.datos.locked !== false,
      nameservers: r.datos.nameServers ?? [],
    };
  }

  async desbloquearYCodigo(clienteId: string, dominio: string): Promise<{ codigo: string }> {
    // SIN CONFIRMAR: v1 con X-Shopper-Id (la subcuenta): desbloquear y leer el authCode.
    const { shopperId } = cliente(clienteId);
    await this.llamar("PATCH", `/v1/domains/${encodeURIComponent(dominio)}`, { locked: false }, shopperId);
    const r = await this.llamar<{ authCode?: string }>("GET", `/v1/domains/${encodeURIComponent(dominio)}`, undefined, shopperId);
    if (!r?.datos.authCode) throw new ErrorRegistrador(`GoDaddy no dio el código de transferencia de ${dominio}.`, "desconocido");
    return { codigo: r.datos.authCode };
  }

  async cambiarTitular(clienteId: string, dominio: string, contacto: Contacto): Promise<Operacion> {
    // SIN CONFIRMAR: el nombre de la acción (el cambio de titular pasa por el proceso de ICANN).
    const { customerId } = cliente(clienteId);
    await this.llamar("PATCH", `/v2/customers/${encodeURIComponent(customerId)}/domains/${encodeURIComponent(dominio)}/contacts`, contactos(contacto));
    return { id: op(dominio, "DOMAIN_UPDATE_CONTACTS"), estado: "en-curso" };
  }

  async transferirAca(clienteId: string, p: { dominio: string; codigo: string; contacto: Contacto; aceptacion: Aceptacion }): Promise<Operacion> {
    // SIN CONFIRMAR: v2 transfer.
    const { customerId } = cliente(clienteId);
    if (await this.dominio(clienteId, p.dominio)) return { id: op(p.dominio, "TRANSFER"), estado: "lista" };
    await this.llamar("POST", `/v2/customers/${encodeURIComponent(customerId)}/domains/${encodeURIComponent(p.dominio)}/transfer`, {
      authCode: p.codigo,
      consent: consentimiento(p.aceptacion),
      contacts: contactos(p.contacto),
      period: 1,
      privacy: false,
      renewAuto: false,
    });
    return { id: op(p.dominio, "TRANSFER"), estado: "en-curso" };
  }
}

const op = (dominio: string, tipo: string) => `${dominio}|${tipo}`;

/** Los errores de GoDaddy → los pocos tipos que entiende Deoco. */
function traducir(estado: number, e: ErrorGd, donde: string): ErrorRegistrador {
  const codigo = e.code ?? "";
  const mensaje = `GoDaddy respondió ${estado} en ${donde}: ${codigo} ${e.message ?? ""}`.trim();
  if (estado === 429 || estado >= 500) return new ErrorRegistrador(mensaje, "temporal");
  if (/UNAVAILABLE|NOT_AVAILABLE|DUPLICATE|ALREADY_REGISTERED/i.test(codigo)) return new ErrorRegistrador(mensaje, "no-disponible");
  if (/FUND|BALANCE|PAYMENT|CREDIT/i.test(codigo)) return new ErrorRegistrador(mensaje, "sin-saldo");
  const campo = e.fields?.[0]?.path?.split(".").pop();
  if (estado === 400 || estado === 422) return new ErrorRegistrador(mensaje, "datos-invalidos", campo ? (CAMPOS[campo] ?? campo) : undefined);
  return new ErrorRegistrador(mensaje, "desconocido");
}
