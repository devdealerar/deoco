// Datos de personas que un módulo puede pedir. Un módulo nunca lee `usuario` (RLS no lo deja):
// lo que necesite de alguien sale de acá, acotado a su banda.
import type { TxTenant } from "@/nucleo/db/con-tenant";

export type Persona = { nombre: string; email: string };

/** El titular de la banda (el primero, si hay varios). `tx`: de conTenant. */
export async function titularDeBanda(tx: TxTenant): Promise<Persona | null> {
  const [fila] = await tx.$queryRaw<Persona[]>`SELECT nombre, email FROM titular_de_banda()`;
  return fila ?? null;
}
