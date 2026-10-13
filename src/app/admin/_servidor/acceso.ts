import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { usuarioDeSesion } from "@/nucleo/acceso/panel";
import { prisma } from "@/nucleo/db/cliente";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";

/**
 * Puerta del back office. Solo staff de Deoco, solo en app.<raiz>.
 * Cualquier otro caso (sin sesión, no staff, host de una banda) es 404, no 403:
 * no se confirma que /admin exista.
 */
export const exigirStaff = cache(async (): Promise<{ usuarioId: string }> => {
  if (await tenantDelPedido()) notFound(); // host de banda o panel de banda
  const usuarioId = await usuarioDeSesion();
  if (!usuarioId) notFound();
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { esStaff: true, claveTemporal: true } });
  if (!usuario?.esStaff) notFound();
  if (usuario.claveTemporal) redirect("/clave");
  return { usuarioId };
});
