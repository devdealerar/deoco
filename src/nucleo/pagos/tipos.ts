// Una pasarela de pago: donde el fan le paga a la banda, con las credenciales de la banda.
// Los módulos que cobran hablan con @/nucleo/pagos y nunca nombran una pasarela
// concreta. Sumar otra (PayPal, Stripe) es un archivo nuevo acá y una línea en ./index.ts.
import type { AvisoEntrante, DefinicionSecreto } from "@/nucleo/modulos/contrato";

/** Credenciales de la banda para esta pasarela: clave → valor (nunca se loguean). */
export type Credenciales = Record<string, string>;

export type Cobro = {
  /** Lo que el módulo cobra (id del pedido, de la compra): vuelve en el cobro consultado. */
  referencia: string;
  /** Renglones tal como los ve el comprador, en centavos. */
  items: { titulo: string; cantidad: number; precioUnitario: number }[];
  /** Cargos aparte (un envío por proveedor), en centavos. Los de 0 no se mandan. */
  extras: { titulo: string; monto: number }[];
  total: number;
  comprador: { nombre: string; email: string };
  urls: { exito: string; fallo: string; pendiente: string; aviso: string };
  /** Hasta cuándo se puede pagar: después la pasarela no lo acepta (un pago tardío no entra). */
  vence?: Date;
  /** Solo medios de aprobación inmediata (sin efectivo, cajero ni transferencia): para lo que reserva cupo un rato. */
  soloInmediatos?: boolean;
};

export type EstadoDeCobro = "aprobado" | "pendiente" | "rechazado" | "devuelto";

/** Lo que dice la API de la pasarela sobre un cobro: esto es la fuente de verdad. */
export type CobroConsultado = {
  cobroId: string;
  estado: EstadoDeCobro;
  /** Crudo de la pasarela, para mostrar ("rejected", "in_process"…). */
  estadoPasarela: string;
  /** La referencia con que se creó el cobro (null si no tiene). */
  referencia: string | null;
  /** Centavos. */
  monto: number;
  moneda: string;
};

export class ErrorPasarela extends Error {}

// ── Suscripciones: SOLO para la cuota de Deoco (ver ./cuota.ts) ─────────────────────────────
// La banda le paga a Deoco, con las credenciales de Deoco (del entorno, nunca de `secreto`).

/** Una suscripción mensual en pesos. */
export type Suscripcion = {
  /** Lo que vuelve en cada consulta (el id de la banda). */
  referencia: string;
  /** Lo que ve quien paga: "Deoco · plan Medium · Los Satélites". */
  motivo: string;
  /** Por mes, en centavos. */
  monto: number;
  /** Mail de quien paga (el titular). */
  email: string;
  /** Primer cobro (p. ej. al terminar el período de prueba). Sin fecha: ya. */
  inicio?: Date;
  /** Adónde vuelve quien paga después de cargar su forma de pago. */
  vuelta: string;
};

export type EstadoSuscripcion = "pendiente" | "activa" | "pausada" | "cancelada";

export type SuscripcionConsultada = {
  suscripcionId: string;
  estado: EstadoSuscripcion;
  estadoPasarela: string;
  referencia: string | null;
  /** Por mes, en centavos. */
  monto: number;
  proximoCobro: Date | null;
  /** Medio de pago para mostrar ("visa", "account_money"); null si todavía no cargó. */
  medioDePago: string | null;
};

/** Un cobro mensual de una suscripción. */
export type CobroDeSuscripcion = {
  cobroId: string;
  suscripcionId: string | null;
  estado: EstadoDeCobro;
  estadoPasarela: string;
  /** Centavos. */
  monto: number;
  fecha: Date | null;
};

export type AvisoDeSuscripcion = { tipo: "suscripcion"; id: string } | { tipo: "cobro"; id: string };

export interface SuscripcionesPasarela {
  crear(cred: Credenciales, s: Suscripcion): Promise<{ suscripcionId: string; redireccion: string }>;
  consultar(cred: Credenciales, suscripcionId: string): Promise<SuscripcionConsultada>;
  /** Desde el próximo cobro. */
  cambiarMonto(cred: Credenciales, suscripcionId: string, monto: number): Promise<void>;
  cancelar(cred: Credenciales, suscripcionId: string): Promise<void>;
  /** Qué avisa (la suscripción cambió o hubo un cobro). Firma inválida → ErrorPasarela. null: otra cosa. */
  leerAviso(aviso: Omit<AvisoEntrante, "tenantId">, cred: Credenciales): AvisoDeSuscripcion | null;
  consultarCobro(cred: Credenciales, cobroId: string): Promise<CobroDeSuscripcion>;
  /** Los cobros mensuales de una suscripción (conciliación: por si un aviso se perdió). */
  cobrosDe(cred: Credenciales, suscripcionId: string): Promise<CobroDeSuscripcion[]>;
}

// ── Pagos únicos a Deoco: SOLO los dominios (ver ./cuota.ts) ─────────────────────────────────
// La banda le paga a Deoco un dominio. Solo medios inmediatos: el dominio no se reserva mientras
// se espera un pago en efectivo, y en el medio otro lo podría registrar.

export type PagoUnico = {
  /** Lo que vuelve en el pago consultado (identifica el cobro). */
  referencia: string;
  /** Lo que ve quien paga: "Dominio lossatelites.com · 1 año". */
  titulo: string;
  /** Centavos. */
  monto: number;
  email: string;
  /** Hasta cuándo se puede pagar (después, la pasarela no lo acepta). */
  vence: Date;
  urls: { exito: string; fallo: string; pendiente: string; aviso: string };
};

/** Un pago a Deoco, tal como lo informa la API (la fuente de verdad). */
export type PagoConsultado = {
  pagoId: string;
  estado: EstadoDeCobro;
  estadoPasarela: string;
  referencia: string | null;
  /** Centavos. */
  monto: number;
  moneda: string;
  /** Tipo de medio ("credit_card", "account_money"…), para mostrar. */
  medio: string | null;
  /** Centavos ya devueltos. */
  devuelto: number;
};

export interface PagosUnicosPasarela {
  /** Solo medios de aprobación inmediata; un pago queda aprobado o rechazado, nunca pendiente. */
  crear(cred: Credenciales, p: PagoUnico): Promise<{ preferenciaId: string; redireccion: string }>;
  consultar(cred: Credenciales, pagoId: string): Promise<PagoConsultado>;
  /** Los pagos hechos con esa referencia (por si un aviso se perdió). */
  buscar(cred: Credenciales, referencia: string): Promise<PagoConsultado[]>;
  /** Devolución total (la de `Pasarela.devolver`, con la cuenta de Deoco). */
  devolver(cred: Credenciales, pagoId: string, clave: string): Promise<{ devolucionId: string; hecha: boolean }>;
  /** Del aviso, solo el id del pago (verifica la firma si hay secreto). null: no es de un pago. */
  leerAviso(aviso: Omit<AvisoEntrante, "tenantId">, cred: Credenciales): string | null;
}

export interface Pasarela {
  id: string;
  nombre: string;
  /** Lo que el titular carga en Credenciales. Las claves llevan el id de la pasarela de prefijo. */
  credenciales: DefinicionSecreto[];
  /** Las credenciales obligatorias para cobrar (de las de arriba). */
  obligatorias: string[];
  /** Cómo devuelve la banda un pago desde su cuenta (para un pago duplicado). */
  comoDevolver: string;
  /** Crea el cobro en la cuenta de la banda. Devuelve adónde mandar al fan. */
  crearCobro(cred: Credenciales, cobro: Cobro): Promise<{ redireccion: string; preferenciaId: string }>;
  /**
   * Del aviso, solo el id del cobro a consultar (y, si la banda cargó el secreto de avisos,
   * verifica la firma: inválida → ErrorPasarela). null: el aviso no es de un pago (se ignora).
   * Del cuerpo NO se toma nada más: el estado se consulta a la API.
   */
  leerAviso(aviso: AvisoEntrante, cred: Credenciales): string | null;
  /** Consulta el cobro a la API de la pasarela, con las credenciales de la banda. */
  consultarCobro(cred: Credenciales, cobroId: string): Promise<CobroConsultado>;
  /** Los cobros hechos con esa referencia (conciliación: por si un aviso se perdió). */
  buscarCobros(cred: Credenciales, referencia: string): Promise<CobroConsultado[]>;
  /**
   * Devolución total de un cobro, con las credenciales de quien cobró (la plata vuelve desde esa
   * cuenta). `clave`: idempotencia, repetirla nunca devuelve dos veces. `hecha`: ya volvió; si
   * no, quedó en proceso (se vuelve a consultar el cobro).
   */
  devolver(cred: Credenciales, cobroId: string, clave: string): Promise<{ devolucionId: string; hecha: boolean }>;
  /** A nombre de quién cobra (para que el titular confirme que es su cuenta). */
  probarConexion(cred: Credenciales): Promise<{ cuenta: string }>;
  /** Suscripciones mensuales: solo las usa la cuota de Deoco, con la cuenta de Deoco. */
  suscripciones?: SuscripcionesPasarela;
  /** Pagos únicos: solo los dominios que la banda le compra a Deoco, con la cuenta de Deoco. */
  pagosUnicos?: PagosUnicosPasarela;
}
