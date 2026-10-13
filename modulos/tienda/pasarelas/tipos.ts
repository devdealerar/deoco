// Una pasarela de pago: donde el fan le paga a la banda, con las credenciales de la banda.
// La tienda habla con esta interfaz y nunca nombra a una pasarela concreta. Sumar otra
// (PayPal, Stripe) es un archivo nuevo acá y una línea en ./index.ts.
import type { AvisoEntrante, DefinicionSecreto } from "@/nucleo/modulos/contrato";

/** Credenciales de la banda para esta pasarela: clave → valor (nunca se loguean). */
export type Credenciales = Record<string, string>;

export type Cobro = {
  /** Id del pedido: vuelve en el aviso (external_reference) para saber qué se pagó. */
  pedidoId: string;
  /** Renglones tal como los ve el fan, en centavos. */
  items: { titulo: string; cantidad: number; precioUnitario: number }[];
  envio: number;
  total: number;
  comprador: { nombre: string; email: string };
  urls: { exito: string; fallo: string; pendiente: string; aviso: string };
};

export type EstadoDeCobro = "aprobado" | "pendiente" | "rechazado" | "devuelto";

/** Lo que dice la API de la pasarela sobre un cobro: esto es la fuente de verdad. */
export type CobroConsultado = {
  cobroId: string;
  estado: EstadoDeCobro;
  /** Crudo de la pasarela, para mostrar ("rejected", "in_process"…). */
  estadoPasarela: string;
  pedidoId: string | null;
  /** Centavos. */
  monto: number;
  moneda: string;
};

export class ErrorPasarela extends Error {}

export interface Pasarela {
  id: string;
  nombre: string;
  /** Lo que el titular carga en Credenciales. Las claves llevan el id de la pasarela de prefijo. */
  credenciales: DefinicionSecreto[];
  /** Las credenciales obligatorias para cobrar (de las de arriba). */
  obligatorias: string[];
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
  /** A nombre de quién cobra (para que el titular confirme que es su cuenta). */
  probarConexion(cred: Credenciales): Promise<{ cuenta: string }>;
}
