// Corre una vez al levantar el servidor, antes de atender pedidos (solo en producción):
// verifica configuración, base y módulos, y si algo está mal el servidor no levanta.
// Después arranca el barrido de pendientes (src/nucleo/barrido.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { verificarArranqueOSalir } = await import("./nucleo/arranque");
  await verificarArranqueOSalir();
  const { iniciarBarrido } = await import("./nucleo/barrido");
  iniciarBarrido();
}
