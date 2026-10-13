// Pago con la pasarela de la banda y deuda con el proveedor.
// La fuente de verdad del pago es la CONSULTA a la API de la pasarela, nunca el cuerpo del
// aviso. Un pedido pasa a PAGADO una sola vez (cambio condicional), y en esa misma
// transacción se copian los costos, se registra la deuda y se emite pedido.pagado.
import { urlAviso } from "@/nucleo/avisos";
import { conTenant, type TxTenant } from "@/nucleo/db/con-tenant";
import { emitir } from "@/nucleo/eventos/bus";
import type { Modulo } from "@/nucleo/modulos/contrato";
import { fijarCostosDelPedido } from "./catalogo";
import { tituloEnvio } from "./comun";
import { credencialesDe, pasarelaLista } from "./pasarelas";
import type { EnvioDeProveedor } from "./pedidos";
import { type CobroConsultado, ErrorPasarela } from "./pasarelas/tipos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MONEDA = "ARS";

/**
 * Crea el cobro del pedido en la pasarela de la banda, con SUS credenciales, y devuelve adónde
 * mandar al fan. `origen`: el sitio de la banda (para volver después de pagar).
 */
export async function iniciarCobro(tienda: Modulo, tenantId: string, pedidoId: string, origen: string): Promise<string> {
  const { lista, pasarela } = await pasarelaLista(tienda, tenantId);
  if (!lista) throw new ErrorPasarela("La tienda no está recibiendo pedidos en este momento.");
  const pedido = await conTenant(tenantId, (tx) => tx.tiendaPedido.findUnique({ where: { id: pedidoId }, include: { items: true } }));
  if (!pedido || pedido.estado !== "PENDIENTE") throw new ErrorPasarela("Ese pedido no está esperando un pago.");
  const volver = (resultado: string) => `${origen}/tienda/pedido/${pedido.id}?resultado=${resultado}`;
  const { redireccion, preferenciaId } = await pasarela.crearCobro(await credencialesDe(tienda, tenantId, pasarela), {
    pedidoId: pedido.id,
    items: pedido.items.map((i) => ({ titulo: i.nombreProducto, cantidad: i.cantidad, precioUnitario: i.precioUnitario })),
    envios: (pedido.envios as unknown as EnvioDeProveedor[]).map((e) => ({ titulo: tituloEnvio(e, pedido.envios), monto: e.monto })),
    total: pedido.total,
    comprador: { nombre: pedido.nombre, email: pedido.email },
    urls: { exito: volver("exito"), fallo: volver("fallo"), pendiente: volver("pendiente"), aviso: urlAviso(tenantId, tienda, `/pago/${pasarela.id}`) },
  });
  await conTenant(tenantId, (tx) =>
    tx.tiendaPedido.update({ where: { id: pedido.id }, data: { pasarela: pasarela.id, preferenciaId, urlPago: redireccion } }),
  );
  return redireccion;
}

export type ResultadoPago =
  | "pagado" // se marcó PAGADO ahora
  | "ya-pagado" // ya estaba pagado con este mismo cobro (aviso repetido): no se hizo nada
  | "duplicado" // otro cobro aprobado para un pedido ya pagado: se registra para que la banda lo devuelva
  | "no-aprobado" // la pasarela todavía no lo aprueba (o lo rechazó)
  | "en-revision" // aprobado pero no coincide con el pedido: no se marca pagado
  | "ajeno"; // el cobro no es de un pedido de esta banda

/**
 * Registra lo que dijo la API de la pasarela sobre un cobro. PENDIENTE → PAGADO solo si está
 * aprobado, el pedido es de ESTA banda (búsqueda bajo RLS) y monto y moneda coinciden.
 */
export async function registrarPago(tenantId: string, pasarelaId: string, cobro: CobroConsultado): Promise<ResultadoPago> {
  if (!cobro.pedidoId || !UUID.test(cobro.pedidoId)) return "ajeno";
  const pedidoId = cobro.pedidoId;
  return conTenant(tenantId, async (tx) => {
    const pedido = await tx.tiendaPedido.findUnique({ where: { id: pedidoId } });
    if (!pedido) return "ajeno";
    if (pedido.estado !== "PENDIENTE") {
      if (cobro.estado !== "aprobado" || cobro.cobroId === pedido.cobroId) return "ya-pagado";
      // El fan pagó otra vez un pedido ya cerrado: el pedido no cambia ni se duplica la deuda,
      // pero el pago extra queda registrado y la banda lo ve para devolverlo desde su pasarela.
      await tx.tiendaPagoExtra.createMany({
        data: [{ tenantId, pedidoId, pasarela: pasarelaId, cobroId: cobro.cobroId, monto: cobro.monto, moneda: cobro.moneda }],
        skipDuplicates: true,
      });
      return "duplicado";
    }

    if (cobro.estado !== "aprobado") {
      await tx.tiendaPedido.updateMany({ where: { id: pedidoId, estado: "PENDIENTE" }, data: { estadoCobro: cobro.estadoPasarela } });
      return "no-aprobado";
    }
    if (cobro.monto !== pedido.total || cobro.moneda !== MONEDA) {
      const observacion = `La pasarela aprobó ${cobro.moneda} ${(cobro.monto / 100).toFixed(2)} (cobro ${cobro.cobroId}) y el pedido es de ${MONEDA} ${(pedido.total / 100).toFixed(2)}.`;
      await tx.tiendaPedido.updateMany({
        where: { id: pedidoId, estado: "PENDIENTE" },
        data: { estado: "EN_REVISION", estadoCobro: cobro.estadoPasarela, cobroId: cobro.cobroId, observacion },
      });
      return "en-revision";
    }
    // Cambio condicional: si dos avisos llegan a la vez, solo uno lo pasa a PAGADO.
    const { count } = await tx.tiendaPedido.updateMany({
      where: { id: pedidoId, estado: "PENDIENTE" },
      data: { estado: "PAGADO", pagadoEn: new Date(), cobroId: cobro.cobroId, estadoCobro: cobro.estadoPasarela, pasarela: pasarelaId },
    });
    if (count === 0) return "ya-pagado";
    await fijarCostosDelPedido(tx, pedidoId);
    await registrarDeudas(tx, tenantId, pedidoId);
    await emitir("pedido.pagado", tenantId, { pedidoId }, undefined, { tx, unica: `${pasarelaId}:${cobro.cobroId}` });
    return "pagado";
  });
}

/**
 * Deuda con cada proveedor del pedido: producción de sus renglones (copia al pagarse) más un
 * envío, el mayor de sus renglones (despacha un paquete). Una sola vez por (pedido, proveedor).
 */
export async function registrarDeudas(tx: TxTenant, tenantId: string, pedidoId: string) {
  const items = await tx.tiendaPedidoItem.findMany({ where: { pedidoId } });
  const porProveedor = new Map<string, { produccion: number; envio: number }>();
  for (const i of items) {
    if (!i.proveedorId || i.costoProduccion === null || i.costoEnvio === null) {
      throw new ErrorPasarela(`El renglón ${i.id} no tiene sus costos fijados.`);
    }
    const d = porProveedor.get(i.proveedorId) ?? { produccion: 0, envio: 0 };
    d.produccion += i.costoProduccion * i.cantidad;
    d.envio = Math.max(d.envio, i.costoEnvio);
    porProveedor.set(i.proveedorId, d);
  }
  await tx.tiendaDeuda.createMany({
    data: [...porProveedor].map(([proveedorId, d]) => ({ tenantId, pedidoId, proveedorId, ...d, total: d.produccion + d.envio })),
    skipDuplicates: true,
  });
}

// ---------- Lo que se ve de la deuda ----------

export type DeudaConProveedor = {
  proveedorId: string;
  proveedor: string;
  email: string;
  /** Pendiente de saldar (centavos) y cuántos pedidos. */
  pendiente: number;
  pedidosPendientes: number;
  saldado: number;
};

/** La deuda acumulada de la banda, por proveedor. */
export async function deudaDeBanda(tenantId: string): Promise<DeudaConProveedor[]> {
  const filas = await conTenant(tenantId, (tx) => tx.tiendaDeuda.findMany({ include: { proveedor: true } }));
  return agrupar(filas);
}

function agrupar(filas: { proveedorId: string; total: number; saldadaEn: Date | null; proveedor: { nombre: string; email: string } }[]) {
  const m = new Map<string, DeudaConProveedor>();
  for (const f of filas) {
    const d = m.get(f.proveedorId) ?? { proveedorId: f.proveedorId, proveedor: f.proveedor.nombre, email: f.proveedor.email, pendiente: 0, pedidosPendientes: 0, saldado: 0 };
    if (f.saldadaEn) d.saldado += f.total;
    else {
      d.pendiente += f.total;
      d.pedidosPendientes += 1;
    }
    m.set(f.proveedorId, d);
  }
  return [...m.values()].sort((a, b) => b.pendiente - a.pendiente || a.proveedor.localeCompare(b.proveedor));
}

/** Para el staff: por banda y por proveedor. `tx`: una transacción de conStaff (lectura). */
export async function deudaDeTodas(tx: TxTenant) {
  const filas = await tx.tiendaDeuda.findMany({ include: { proveedor: true } });
  const bandas = await tx.tenant.findMany({ where: { id: { in: [...new Set(filas.map((f) => f.tenantId))] } }, select: { id: true, nombre: true, slug: true } });
  return bandas
    .map((b) => ({ banda: b, proveedores: agrupar(filas.filter((f) => f.tenantId === b.id)) }))
    .sort((a, b) => a.banda.nombre.localeCompare(b.banda.nombre));
}

/**
 * Marca deudas como saldadas: cuándo, quién y una nota. Solo las que estaban pendientes (si ya
 * estaba saldada, no se pisa quién ni cuándo). Sin pantalla todavía: ver docs/tareas.md.
 */
export async function saldarDeudas(tenantId: string, deudaIds: string[], usuarioId: string, nota: string) {
  return conTenant(tenantId, async (tx) => {
    const { count } = await tx.tiendaDeuda.updateMany({
      where: { id: { in: deudaIds }, saldadaEn: null },
      data: { saldadaEn: new Date(), saldadaPor: usuarioId, notaSaldo: nota.trim().slice(0, 300) || null },
    });
    if (count) await tx.auditoria.create({ data: { usuarioId, tenantId, accion: "tienda.deuda_saldada", detalle: { deudas: deudaIds, nota } } });
    return count;
  });
}
