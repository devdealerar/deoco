// El proveedor de DNS y certificados de los dominios propios (hoy Cloudflare). Detrás de esta
// interfaz para poder cambiarlo tocando un archivo (docs/diseno-dominios.md §6).
//
// Credenciales de la plataforma, del entorno (nunca de la tabla `secreto`):
//   DEOCO_CLOUDFLARE_TOKEN  token de API de la cuenta de Deoco
//   DEOCO_CLOUDFLARE_ZONA   id de la zona de DEOCO_DOMINIO_RAIZ (donde viven los custom hostnames)
//   DEOCO_CLOUDFLARE_API    (pruebas) servidor local que imita la API
import { dominioRaiz } from "@/nucleo/tenant/hosts";
import { Cloudflare } from "./cloudflare";

export type RegistroDns = { tipo: "CNAME" | "TXT"; nombre: string; valor: string; para: string };

/** Un custom hostname ("conectar por CNAME"). Listo: `estado` y `ssl` en "active". */
export type Hostname = {
  id: string;
  estado: string;
  ssl: string;
  /** Registros TXT que pidió Cloudflare para validar (no siempre vienen; ver `hostname()`). */
  validacion: RegistroDns[];
};

/** Una zona de nuestra cuenta (dominio delegado o comprado). Lista: `estado` y `certificado` "active". */
export type Zona = { id: string; estado: string; certificado: string | null; nameservers: string[] };

/**
 * - `temporal`: no respondió, 5xx, 429 → se reintenta más tarde, no es culpa de la banda.
 * - `datos`: rechazó lo pedido (un hostname que no acepta) → se le dice a la banda.
 */
export class ErrorProveedor extends Error {
  constructor(
    message: string,
    readonly tipo: "temporal" | "datos",
  ) {
    super(message);
  }
}

export interface ProveedorDns {
  /** Crea el custom hostname (si ya existe, devuelve el que hay). */
  crearHostname(dominio: string): Promise<Hostname>;
  /** null: no existe (lo borraron o venció sin validarse). */
  hostname(id: string): Promise<Hostname | null>;
  borrarHostname(id: string): Promise<void>;
  /** null: la zona no existe. */
  zona(id: string): Promise<Zona | null>;
}

/** El proveedor configurado, o null si este servidor no tiene dominios propios habilitados. */
export function proveedorDns(env: Record<string, string | undefined> = process.env): ProveedorDns | null {
  const token = env.DEOCO_CLOUDFLARE_TOKEN?.trim();
  const zona = env.DEOCO_CLOUDFLARE_ZONA?.trim();
  if (!token || !zona) return null;
  return new Cloudflare({ token, zona, api: env.DEOCO_CLOUDFLARE_API?.trim() || "https://api.cloudflare.com/client/v4" });
}

/** A dónde apunta el CNAME de un dominio conectado. Lo crea el staff una vez (docs/despliegue.md). */
export const destinoCname = () => `customers.${dominioRaiz()}`;
