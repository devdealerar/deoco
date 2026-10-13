import { modulosDescubiertos } from "@/generated/modulos";
import { crearRegistro, type Registro } from "./registro";

let instancia: Registro | undefined;

/** Registro de los módulos descubiertos en modulos/<id>/. Se arma una vez por proceso. */
export function registro(): Registro {
  instancia ??= crearRegistro(modulosDescubiertos);
  return instancia;
}
