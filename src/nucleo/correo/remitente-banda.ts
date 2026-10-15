// La dirección de envío propia de una banda (merch@labanda.com), si ya está verificada. La usan
// los correos de los módulos de esa banda (compras, entradas, despachos); los avisos de Deoco
// (origen "nucleo") siguen saliendo desde Deoco. Ver src/nucleo/dominios/correo.ts.
import { conTenant } from "@/nucleo/db/con-tenant";

export async function direccionDeEnvio(tenantId: string): Promise<string | null> {
  const c = await conTenant(tenantId, (tx) => tx.correoDominio.findFirst({ where: { envioEstado: "verificado" }, select: { local: true, dominio: true } }));
  return c ? `${c.local}@${c.dominio}` : null;
}
