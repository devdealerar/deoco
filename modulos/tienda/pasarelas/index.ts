import type { Modulo } from "@/nucleo/modulos/contrato";
import { leerSecreto } from "@/nucleo/secretos";
import { mercadoPago } from "./mercadopago";
import type { Pasarela } from "./tipos";

/** Pasarelas disponibles. La primera es la de todas las bandas hasta que se pueda elegir. */
export const PASARELAS: Pasarela[] = [mercadoPago];

export const pasarelaDe = (id: string) => PASARELAS.find((p) => p.id === id);

/** Todas las credenciales que la tienda declara en su contrato. */
export const credencialesDeTodas = () => PASARELAS.flatMap((p) => p.credenciales);

/**
 * ¿La banda puede cobrar? Su pasarela (hoy, Mercado Pago) con las credenciales obligatorias
 * cargadas por el titular. `tienda`: el contrato del módulo (leerSecreto exige el propio).
 */
export async function pasarelaLista(tienda: Modulo, tenantId: string): Promise<{ lista: boolean; pasarela: Pasarela; faltan: string[] }> {
  const pasarela = PASARELAS[0];
  const faltan: string[] = [];
  for (const clave of pasarela.obligatorias) {
    if (!(await leerSecreto(tienda, tenantId, clave))) faltan.push(pasarela.credenciales.find((c) => c.clave === clave)?.etiqueta ?? clave);
  }
  return { lista: faltan.length === 0, pasarela, faltan };
}
