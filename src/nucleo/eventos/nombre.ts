/**
 * Nombre de evento: `entidad.accion`, en minúsculas, la acción en participio
 * (pasado): `pedido.pagado`, `entrada.validada`, `pedido.devuelto`, `foto.impresa`.
 * El participio se valida por la terminación: -ado/-ada/-ido/-ida y las irregulares
 * -to/-ta/-cho/-cha/-so/-sa (devuelto, hecho, impreso), en singular o plural.
 */
const FORMATO = /^[a-z][a-z0-9-]*\.[a-z][a-z-]*$/;
const PARTICIPIO = /(ad[oa]|id[oa]|t[oa]|ch[oa]|s[oa])s?$/;

/** null si es válido; si no, el motivo. */
export function problemaNombreEvento(nombre: string): string | null {
  if (!FORMATO.test(nombre)) {
    return `"${nombre}" no tiene el formato entidad.accion (minúsculas, p. ej. pedido.pagado)`;
  }
  const accion = nombre.split(".")[1];
  if (!PARTICIPIO.test(accion)) {
    return `"${nombre}": la acción va en pasado (participio), p. ej. pedido.pagado, entrada.validada`;
  }
  return null;
}
