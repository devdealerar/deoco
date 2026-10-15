// ═══════════════════════════════════════════════════════════════════════════════════════════
// LA EXCEPCIÓN A LA REGLA DEL DINERO: la cuota mensual de Deoco (y los dominios que la banda le
// compra a Deoco, más abajo).
//
// Todo lo demás de @/nucleo/pagos es plata de la BANDA: el fan le paga a la banda, en la cuenta
// de la banda, con las credenciales que cargó el titular (tabla `secreto`). Deoco no toca nada.
//
// Acá es al revés: la BANDA le paga A DEOCO, en la cuenta de Deoco. Es el único dinero que
// entra a la plataforma. Por eso:
//   - las credenciales son de Deoco y vienen del ENTORNO (DEOCO_CUOTA_MP_*), nunca de `secreto`;
//   - solo las usa el gestor de cuenta (`gestionaCuenta`), con su propio contrato;
//   - los cobros se guardan en las tablas del gestor, nunca en las de ventas de la banda.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { urlAvisoPlataforma } from "@/nucleo/avisos";
import { registro as registroGlobal } from "@/nucleo/modulos";
import type { AvisoEntrante, Modulo } from "@/nucleo/modulos/contrato";
import type { Registro } from "@/nucleo/modulos/registro";
import { mercadoPago } from "./mercadopago";
import {
  type AvisoDeSuscripcion,
  type CobroDeSuscripcion,
  type Credenciales,
  ErrorPasarela,
  type PagoConsultado,
  type PagosUnicosPasarela,
  type PagoUnico,
  type Suscripcion,
  type SuscripcionConsultada,
  type SuscripcionesPasarela,
} from "./tipos";

export type { PagoConsultado, PagoUnico } from "./tipos";
export type { AvisoDeSuscripcion, CobroDeSuscripcion, EstadoSuscripcion, Suscripcion, SuscripcionConsultada } from "./tipos";

/** La pasarela de la cuota: hoy, la cuenta de Mercado Pago de Deoco. */
const PASARELA_CUOTA = mercadoPago;

/** Credenciales de la cuenta de Deoco (del entorno). null si no están: no se puede cobrar la cuota. */
export function cuentaDeDeoco(env: Record<string, string | undefined> = process.env): Credenciales | null {
  const token = env.DEOCO_CUOTA_MP_TOKEN?.trim();
  if (!token) return null;
  const cred: Credenciales = { mercadopago_access_token: token };
  const secreto = env.DEOCO_CUOTA_MP_SECRETO_AVISOS?.trim();
  if (secreto) cred.mercadopago_secreto_avisos = secreto;
  return cred;
}

/** Para el arranque y la pantalla: ¿se puede cobrar la cuota? */
export const cuotaConfigurada = (env: Record<string, string | undefined> = process.env) => cuentaDeDeoco(env) !== null;

function paraElGestor(modulo: Modulo, reg: Registro): { cred: Credenciales; sus: SuscripcionesPasarela } {
  if (reg.modulo(modulo.id) !== modulo || reg.gestor?.moduloId !== modulo.id) {
    throw new ErrorPasarela(`"${modulo.id}" no es el gestor de cuenta: no puede usar la cuenta de Deoco.`);
  }
  const cred = cuentaDeDeoco();
  if (!cred) throw new ErrorPasarela("La cuenta de Deoco para cobrar las cuotas no está configurada (DEOCO_CUOTA_MP_TOKEN).");
  return { cred, sus: PASARELA_CUOTA.suscripciones! };
}

/** Nombre de la pasarela de la cuota, para mostrar. */
export const pasarelaDeLaCuota = () => ({ id: PASARELA_CUOTA.id, nombre: PASARELA_CUOTA.nombre });

/**
 * URL donde la pasarela avisa de las suscripciones (se configura UNA vez en la aplicación de
 * Mercado Pago de Deoco): app.<raiz>/avisos/plataforma/<gestor>/cuota/<pasarela>.
 */
export const urlAvisoCuota = (modulo: Pick<Modulo, "id">) => urlAvisoPlataforma(modulo, `/cuota/${PASARELA_CUOTA.id}`);

export async function crearSuscripcion(modulo: Modulo, sus: Suscripcion, reg: Registro = registroGlobal()) {
  const { cred, sus: api } = paraElGestor(modulo, reg);
  return api.crear(cred, sus);
}

export async function consultarSuscripcion(modulo: Modulo, id: string, reg: Registro = registroGlobal()): Promise<SuscripcionConsultada> {
  const { cred, sus: api } = paraElGestor(modulo, reg);
  return api.consultar(cred, id);
}

export async function cambiarMontoSuscripcion(modulo: Modulo, id: string, monto: number, reg: Registro = registroGlobal()) {
  const { cred, sus: api } = paraElGestor(modulo, reg);
  await api.cambiarMonto(cred, id, monto);
}

export async function cancelarSuscripcion(modulo: Modulo, id: string, reg: Registro = registroGlobal()) {
  const { cred, sus: api } = paraElGestor(modulo, reg);
  await api.cancelar(cred, id);
}

/** Qué avisa la pasarela (verifica la firma si Deoco cargó la clave secreta). Firma inválida → ErrorPasarela. */
export function leerAvisoCuota(modulo: Modulo, aviso: Omit<AvisoEntrante, "tenantId">, reg: Registro = registroGlobal()): AvisoDeSuscripcion | null {
  const { cred, sus: api } = paraElGestor(modulo, reg);
  return api.leerAviso(aviso, cred);
}

export async function consultarCobroCuota(modulo: Modulo, cobroId: string, reg: Registro = registroGlobal()): Promise<CobroDeSuscripcion> {
  const { cred, sus: api } = paraElGestor(modulo, reg);
  return api.consultarCobro(cred, cobroId);
}

// ── Dominios: pagos únicos a Deoco ─────────────────────────────────────────────────────────
// Misma cuenta de Deoco, pero NADA en común con la cuota: otro tipo de cobro (pago único, no
// suscripción), otra URL de aviso (/dominio/<pasarela>, nunca /cuota), otras tablas del gestor.
// Solo medios inmediatos (ver mercadopago.ts): un dominio no espera un pago en efectivo.

function pagosDeDeoco(modulo: Modulo, reg: Registro): { cred: Credenciales; api: PagosUnicosPasarela } {
  const { cred } = paraElGestor(modulo, reg);
  return { cred, api: PASARELA_CUOTA.pagosUnicos! };
}

/** Donde la pasarela avisa los pagos de dominios: app.<raiz>/avisos/plataforma/<gestor>/dominio/<pasarela>. */
export const urlAvisoDominio = (modulo: Pick<Modulo, "id">) => urlAvisoPlataforma(modulo, `/dominio/${PASARELA_CUOTA.id}`);

export async function crearPagoDominio(modulo: Modulo, p: PagoUnico, reg: Registro = registroGlobal()) {
  const { cred, api } = pagosDeDeoco(modulo, reg);
  return api.crear(cred, p);
}

export async function consultarPagoDominio(modulo: Modulo, pagoId: string, reg: Registro = registroGlobal()): Promise<PagoConsultado> {
  const { cred, api } = pagosDeDeoco(modulo, reg);
  return api.consultar(cred, pagoId);
}

export async function buscarPagosDominio(modulo: Modulo, referencia: string, reg: Registro = registroGlobal()): Promise<PagoConsultado[]> {
  const { cred, api } = pagosDeDeoco(modulo, reg);
  return api.buscar(cred, referencia);
}

/** Devolución total de un pago de dominio. Idempotente por `clave`. */
export async function devolverPagoDominio(modulo: Modulo, pagoId: string, clave: string, reg: Registro = registroGlobal()) {
  const { cred, api } = pagosDeDeoco(modulo, reg);
  return api.devolver(cred, pagoId, clave);
}

/** El id del pago que avisa la pasarela (firma inválida → ErrorPasarela; otra cosa → null). */
export function leerAvisoDominio(modulo: Modulo, aviso: Omit<AvisoEntrante, "tenantId">, reg: Registro = registroGlobal()): string | null {
  const { cred, api } = pagosDeDeoco(modulo, reg);
  return api.leerAviso(aviso, cred);
}
