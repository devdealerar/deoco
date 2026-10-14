// La fila de `usuario` de quien pide, leída con RLS (conUsuario). Una vez por pedido.
import { cache } from "react";
import { conUsuario } from "@/nucleo/db/con-usuario";

export type UsuarioPropio = { email: string; nombre: string; esStaff: boolean; claveTemporal: boolean };

/** Datos de la propia persona; null si el id no existe. */
export const usuarioPropio = cache(
  (usuarioId: string): Promise<UsuarioPropio | null> =>
    conUsuario(usuarioId, (tx) =>
      tx.usuario.findUnique({ where: { id: usuarioId }, select: { email: true, nombre: true, esStaff: true, claveTemporal: true } }),
    ),
);
