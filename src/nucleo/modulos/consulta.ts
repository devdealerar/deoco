/** Lo que Next entrega como `searchParams` de una página. */
export type SearchParamsNext = Record<string, string | string[] | undefined>;

/**
 * Parámetros de consulta (`?estado=aprobado&talle=m&talle=l`) para un módulo: un
 * URLSearchParams nuevo por pedido, con los valores repetidos en orden (`getAll`).
 */
export function consultaDe(sp: SearchParamsNext | undefined): URLSearchParams {
  const consulta = new URLSearchParams();
  for (const [clave, valor] of Object.entries(sp ?? {})) {
    for (const v of Array.isArray(valor) ? valor : valor === undefined ? [] : [valor]) consulta.append(clave, v);
  }
  return consulta;
}
