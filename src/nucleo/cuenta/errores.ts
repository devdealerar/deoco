export class ErrorCuenta extends Error {}

/** Llegó a un límite. `message` es para mostrar tal cual (dice qué falta y cómo ampliarlo). */
export class ErrorLimite extends Error {
  constructor(
    mensaje: string,
    readonly limite: string,
    readonly maximo: number,
  ) {
    super(mensaje);
    this.name = "ErrorLimite";
  }
}
