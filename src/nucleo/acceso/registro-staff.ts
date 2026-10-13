import { conTenant } from "@/nucleo/db/con-tenant";

/**
 * Registro de los accesos del staff de Deoco a una banda donde no tiene membresía.
 * Queda en `auditoria` (accion "acceso.panel"). Una fila por persona y banda cada
 * VENTANA: un pedido al panel arrastra varios (página, imágenes), no hace falta uno por cada uno.
 */
export type AccesoStaff = { usuarioId: string; tenantId: string; ruta: string; fecha: Date };

const VENTANA_MS = 10 * 60 * 1000;

export async function registrarAccesoStaff(acceso: AccesoStaff): Promise<void> {
  await conTenant(acceso.tenantId, async (tx) => {
    const reciente = await tx.auditoria.findFirst({
      where: {
        usuarioId: acceso.usuarioId,
        accion: "acceso.panel",
        fecha: { gte: new Date(acceso.fecha.getTime() - VENTANA_MS) },
      },
      select: { id: true },
    });
    if (reciente) return;
    await tx.auditoria.create({
      data: {
        usuarioId: acceso.usuarioId,
        tenantId: acceso.tenantId,
        accion: "acceso.panel",
        fecha: acceso.fecha,
        detalle: { ruta: acceso.ruta },
      },
    });
  });
}
