// Los datos personales de un fan en la ticketera (D2: derechos del fan). Sus compras por email y
// las entradas nominadas a su nombre. Suprimir = anonimizar las compras de shows que ya pasaron
// (nombre, email, asistentes, documento); se conserva el comprobante (foto fiscal y cobro). Las de
// shows por venir no se tocan (el nombre y el documento se validan en la puerta): se dice.
import { conTenant } from "@/nucleo/db/con-tenant";
import type { SeccionDeDatos } from "@/nucleo/modulos/contrato";
import { desdeAhora } from "./eventos";

export async function buscarDatosTicketera(tenantId: string, email: string): Promise<SeccionDeDatos[]> {
  const compras = await conTenant(tenantId, (tx) =>
    tx.ticketeraCompra.findMany({
      where: { email: { equals: email, mode: "insensitive" } },
      include: { evento: { select: { nombre: true, fecha: true } }, tipo: { select: { nombre: true } }, entradas: { select: { nombre: true, documento: true, validadaEn: true } } },
      orderBy: { creadoEn: "desc" },
    }),
  );
  return [
    {
      titulo: "Compras de entradas",
      filas: compras.map((c) => ({
        compra: c.id,
        fecha: c.creadoEn.toISOString(),
        estado: c.estado,
        show: c.evento.nombre,
        fechaDelShow: c.evento.fecha.toISOString(),
        tipo: c.tipo.nombre,
        cantidad: c.cantidad,
        nombre: c.nombre,
        email: c.email,
        documento: c.documento,
        total: c.total,
      })),
    },
    {
      titulo: "Entradas nominadas de esas compras",
      filas: compras.flatMap((c) => c.entradas.map((en) => ({ compra: c.id, show: c.evento.nombre, asistente: en.nombre, documento: en.documento, ingreso: en.validadaEn?.toISOString() ?? null }))),
    },
  ];
}

export async function suprimirDatosTicketera(tenantId: string, email: string): Promise<{ anonimizados: number; conservados: string[] }> {
  return conTenant(tenantId, async (tx) => {
    const compras = await tx.ticketeraCompra.findMany({ where: { email: { equals: email, mode: "insensitive" } }, include: { evento: { select: { fecha: true } } } });
    const pasadas = compras.filter((c) => c.evento.fecha < desdeAhora());
    const porVenir = compras.filter((c) => c.evento.fecha >= desdeAhora());
    for (const c of pasadas) {
      await tx.ticketeraCompra.update({ where: { id: c.id }, data: { nombre: "Anónimo", email: `suprimido-${c.id.slice(0, 8)}@invalid`, asistentes: [], documento: null } });
      await tx.ticketeraEntrada.updateMany({ where: { compraId: c.id }, data: { nombre: "Anónimo", documento: "—" } });
    }
    const conservados: string[] = [];
    if (pasadas.some((c) => c.estado === "PAGADA" || c.estado === "DEVUELTA")) conservados.push("el comprobante de cada compra de entradas (foto fiscal y cobro), por obligación legal");
    if (porVenir.length) conservados.push(`${porVenir.length} ${porVenir.length === 1 ? "compra de entradas para un show que todavía no pasó" : "compras de entradas para shows que todavía no pasaron"} (el nombre y el documento se validan en la puerta; se anonimizan después del show)`);
    return { anonimizados: pasadas.length, conservados };
  });
}
