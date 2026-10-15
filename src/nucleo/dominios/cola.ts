// Cola de pedidos con tope por ventana (GoDaddy: 60 por minuto por credencial). Todos los pedidos
// al registrador pasan por una sola, en este proceso: si se llena, el siguiente espera su turno en
// vez de recibir un 429. (Más de un proceso: cada uno con su cola; el tope se reparte a mano.)

export class Cola {
  private marcas: number[] = [];
  private espera: Promise<void> = Promise.resolve();

  constructor(
    private readonly tope: number,
    private readonly ventanaMs: number,
    private readonly reloj: { ahora(): number; dormir(ms: number): Promise<void> } = {
      ahora: () => Date.now(),
      dormir: (ms) => new Promise((ok) => setTimeout(ok, ms)),
    },
  ) {}

  /** Corre `fn` cuando haya lugar en la ventana. Los turnos se dan en orden de llegada. */
  async correr<T>(fn: () => Promise<T>): Promise<T> {
    const turno = this.espera.then(() => this.lugar());
    this.espera = turno.catch(() => {});
    await turno;
    return fn();
  }

  private async lugar() {
    for (;;) {
      const ahora = this.reloj.ahora();
      this.marcas = this.marcas.filter((m) => m > ahora - this.ventanaMs);
      if (this.marcas.length < this.tope) {
        this.marcas.push(ahora);
        return;
      }
      await this.reloj.dormir(this.marcas[0] + this.ventanaMs - ahora);
    }
  }
}
