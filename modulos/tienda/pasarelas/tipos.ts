// Una pasarela de pago: donde el fan le paga a la banda, con las credenciales de la banda.
// La tienda habla con esta interfaz y nunca nombra a una pasarela concreta. Sumar otra
// (PayPal, Stripe) es un archivo nuevo acá y una línea en ./index.ts.
// (Parte 4: lo que hace falta para saber si la banda puede vender. El cobro y el aviso,
// en la parte 5.)
import type { DefinicionSecreto } from "@/nucleo/modulos/contrato";

export interface Pasarela {
  id: string;
  nombre: string;
  /** Lo que el titular carga en Credenciales. Las claves llevan el id de la pasarela de prefijo. */
  credenciales: DefinicionSecreto[];
  /** Las credenciales obligatorias para cobrar (de las de arriba). */
  obligatorias: string[];
}
