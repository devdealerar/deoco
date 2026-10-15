// El registrador de los dominios que las bandas compran en Deoco (hoy GoDaddy, API v2 con
// subcuentas), detrás de una interfaz: cambiar de registrador es escribir otro archivo y elegirlo
// por variable (docs/diseno-dominios.md §6). Solo lo técnico: la plata la maneja el gestor de
// cuenta y el orden de los pasos, la máquina de estados (D8).
//
// Credenciales de la plataforma, del entorno (nunca de la tabla `secreto`):
//   DEOCO_REGISTRADOR        "godaddy" (único implementado)
//   DEOCO_GODADDY_KEY / _SECRET  clave de API de la cuenta de revendedor de Deoco
//   DEOCO_GODADDY_API        por defecto https://api.godaddy.com (pruebas de GoDaddy: https://api.ote-godaddy.com)
//   DEOCO_GODADDY_POR_MINUTO tope de pedidos por minuto (59: GoDaddy permite 60)
import { GoDaddy } from "./godaddy";

/** El titular registral: a su nombre queda el dominio (no a nombre de Deoco). */
export type Contacto = {
  nombre: string;
  apellido: string;
  email: string;
  /** Formato internacional del registro: +54.1145678900 */
  telefono: string;
  direccion: string;
  ciudad: string;
  provincia: string;
  codigoPostal: string;
  /** ISO 3166-1 alfa-2: "AR". */
  pais: string;
};

export type Disponibilidad = {
  dominio: string;
  disponible: boolean;
  /** Precio de costo del registrador por `anios` (centavos de `moneda`). Sin él, no se vende. */
  costo: { centavos: number; moneda: string; anios: number } | null;
};

/** Condiciones del registro que el titular tiene que aceptar (con sus links). */
export type Condicion = { clave: string; titulo: string; url: string };

/** Aceptación de las condiciones: cuándo, desde qué IP y cuáles. */
export type Aceptacion = { fecha: Date; ip: string; claves: string[] };

/**
 * Una operación del registrador (registrar, renovar, nameservers…). Las escrituras contestan
 * "en curso" y se consultan hasta que terminan (GoDaddy: 202 + acciones). `id` es opaco: lo
 * guarda la máquina de estados para volver a consultar, aunque Deoco se haya reiniciado.
 */
export type Operacion = { id: string; estado: "en-curso" | "lista" | "fallida"; motivo?: string };

export type DominioRegistrado = {
  dominio: string;
  venceEn: Date;
  /** Bloqueado para transferir. */
  bloqueado: boolean;
  nameservers: string[];
};

/**
 * - `no-disponible`: alguien lo tiene (o lo registró en el medio) → devolución.
 * - `temporal`: no respondió, 5xx, 429 → se reintenta.
 * - `sin-saldo`: la cuenta de revendedor no tiene saldo → alerta al staff, se reintenta al recargar.
 * - `datos-invalidos`: un dato del titular (`campo`) no sirve → se le vuelve a pedir.
 * - `desconocido`: lo demás → al staff.
 */
export class ErrorRegistrador extends Error {
  constructor(
    message: string,
    readonly tipo: "no-disponible" | "temporal" | "sin-saldo" | "datos-invalidos" | "desconocido",
    readonly campo?: string,
  ) {
    super(message);
  }
}

export interface Registrador {
  readonly nombre: string;
  disponibilidad(dominio: string): Promise<Disponibilidad>;
  condiciones(tld: string): Promise<Condicion[]>;
  /** La subcuenta de la banda en el registrador (una por banda). `referencia`: el id de la banda. */
  crearCliente(datos: { email: string; nombre: string; apellido: string; referencia: string }): Promise<{ clienteId: string }>;
  /**
   * Registra a nombre del titular, en la subcuenta, con los nameservers dados. Si el dominio ya
   * está en la subcuenta (una respuesta que se perdió), devuelve la operación lista: nunca registra
   * dos veces.
   */
  registrar(
    clienteId: string,
    pedido: { dominio: string; contacto: Contacto; anios: number; nameservers: string[]; aceptacion: Aceptacion },
  ): Promise<Operacion>;
  /** Vuelve a consultar una operación en curso. */
  operacion(clienteId: string, op: Operacion): Promise<Operacion>;
  ponerNameservers(clienteId: string, dominio: string, nameservers: string[]): Promise<Operacion>;
  /** `venceEn`: el vencimiento actual (el registrador lo pide para no renovar dos veces). */
  renovar(clienteId: string, dominio: string, venceEn: Date, anios: number): Promise<Operacion>;
  /** null: el dominio ya no está en la subcuenta (se transfirió afuera, o venció y se liberó). */
  dominio(clienteId: string, dominio: string): Promise<DominioRegistrado | null>;
  /** Lo desbloquea y devuelve el código de transferencia (para llevárselo a otro registrador). */
  desbloquearYCodigo(clienteId: string, dominio: string): Promise<{ codigo: string }>;
  cambiarTitular(clienteId: string, dominio: string, contacto: Contacto): Promise<Operacion>;
  /** Transferencia entrante a la subcuenta (un dominio delegado que la banda trae a Deoco). */
  transferirAca(clienteId: string, pedido: { dominio: string; codigo: string; contacto: Contacto; aceptacion: Aceptacion }): Promise<Operacion>;
}

/** El registrador configurado, o null si este servidor no vende dominios. */
export function registrador(env: Record<string, string | undefined> = process.env): Registrador | null {
  if (env.DEOCO_REGISTRADOR?.trim() !== "godaddy") return null;
  const clave = env.DEOCO_GODADDY_KEY?.trim();
  const secreto = env.DEOCO_GODADDY_SECRET?.trim();
  if (!clave || !secreto) return null;
  const porMinuto = Number(env.DEOCO_GODADDY_POR_MINUTO);
  return GoDaddy.compartido({
    clave,
    secreto,
    api: env.DEOCO_GODADDY_API?.trim() || "https://api.godaddy.com",
    ...(Number.isInteger(porMinuto) && porMinuto > 0 ? { porMinuto } : {}),
  });
}

/** Problemas de configuración del registrador (para el arranque). */
export function problemasDeRegistrador(env: Record<string, string | undefined>): string[] {
  const elegido = env.DEOCO_REGISTRADOR?.trim();
  if (!elegido) return [];
  if (elegido !== "godaddy") return [`DEOCO_REGISTRADOR="${elegido}" no existe (godaddy).`];
  if (!env.DEOCO_GODADDY_KEY?.trim() || !env.DEOCO_GODADDY_SECRET?.trim()) {
    return ["DEOCO_REGISTRADOR=godaddy necesita DEOCO_GODADDY_KEY y DEOCO_GODADDY_SECRET (la clave de API de la cuenta de revendedor)."];
  }
  return [];
}
