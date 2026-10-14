import { prisma } from "./cliente";
import type { TxTenant } from "./con-tenant";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * SOLO PARA EL NÚCLEO. Transacción con `app.usuario_id`: RLS deja leer y editar la fila de
 * `usuario` de esa persona y ninguna otra (nombre y clave; `esStaff` y `email` ni así).
 * El id es siempre el de la sesión (o el de quien llama, verificado antes).
 */
export async function conUsuario<T>(usuarioId: string, fn: (tx: TxTenant) => Promise<T>): Promise<T> {
  if (!UUID.test(usuarioId)) throw new Error(`usuarioId inválido: ${usuarioId}`);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.usuario_id', ${usuarioId}, true)`;
    return fn(tx);
  });
}
