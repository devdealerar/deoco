// Pago con la pasarela de la banda y deuda con el proveedor.
// La fuente de verdad del pago es la CONSULTA a la API de la pasarela, nunca el cuerpo del
// aviso. Cómo se registra (duplicados, revisión, pagado una sola vez) es del núcleo
// (registrarCobro); acá, qué es un pedido y qué pasa al pagarse.
import { conTenant, type TxTenant } from "@/nucleo/db/con-tenant";
import { titularDeBanda } from "@/nucleo/personas";
import type { Modulo } from "@/nucleo/modulos/contrato";
import { type CosaACobrar, registrarCobro, type ResultadoCobro } from "@/nucleo/pagos/registro";
import { fijarCostosDelPedido } from "./catalogo";
import { tituloEnvio } from "./comun";
import tienda from "./index";
import { DIAS_PEDIDO_PENDIENTE, type EnvioDeProveedor } from "./pedidos";
import { type CobroConsultado, conciliarCobros, crearCobro, ErrorPasarela } from "@/nucleo/pagos";
import { prisma } from "@/nucleo/db/cliente";


/**
 * Crea el cobro del pedido en la pasarela de la banda, con SUS credenciales, y devuelve adónde
 * mandar al fan. `origen`: el sitio de la banda (para volver después de pagar).
 */
export async function iniciarCobro(tienda: Modulo, tenantId: string, pedidoId: string, origen: string, ahora = new Date()): Promise<string> {
  const pedido = await conTenant(tenantId, (tx) => tx.tiendaPedido.findUnique({ where: { id: pedidoId }, include: { items: true } }));
  if (!pedido || pedido.estado !== "PENDIENTE") throw new ErrorPasarela("Ese pedido no está esperando un pago.");
  // Antes de mandar a pagar, se revisa otra vez: vencido o con un producto que ya no está a la venta, no.
  const motivo = await conTenant(tenantId, (tx) => motivoDeCierre(tx, pedido.id, ahora));
  if (motivo) {
    await cancelarPedido(tenantId, pedido.id, motivo);
    throw new ErrorPasarela(`Este pedido ya no se puede pagar: ${motivo} Armá uno nuevo desde la tienda.`);
  }
  const volver = (resultado: string) => `${origen}/tienda/pedido/${pedido.id}?resultado=${resultado}`;
  const { pasarela, redireccion, preferenciaId } = await crearCobro(tienda, tenantId, {
    referencia: pedido.id,
    items: pedido.items.map((i) => ({ titulo: i.nombreProducto, cantidad: i.cantidad, precioUnitario: i.precioUnitario })),
    extras: (pedido.envios as unknown as EnvioDeProveedor[]).map((e) => ({ titulo: tituloEnvio(e, pedido.envios), monto: e.monto })),
    total: pedido.total,
    comprador: { nombre: pedido.nombre, email: pedido.email },
    urls: { exito: volver("exito"), fallo: volver("fallo"), pendiente: volver("pendiente") },
    // Después del vencimiento la pasarela no lo deja pagar (y si un pago llega igual, va a devolución).
    vence: venceDe(pedido.creadoEn),
  });
  await conTenant(tenantId, (tx) =>
    tx.tiendaPedido.update({ where: { id: pedido.id }, data: { pasarela, preferenciaId, urlPago: redireccion } }),
  );
  return redireccion;
}

export type ResultadoPago = ResultadoCobro;

/** Hasta cuándo se puede pagar un pedido. */
export const venceDe = (creadoEn: Date) => new Date(creadoEn.getTime() + DIAS_PEDIDO_PENDIENTE * 86_400_000);

/**
 * Por qué un pedido sin pagar ya no se puede pagar (null: se puede): venció (7 días) o algún
 * producto dejó de estar a la venta (despublicado, o el proveedor ya no lo ofrece).
 */
export async function motivoDeCierre(tx: TxTenant, pedidoId: string, ahora = new Date()): Promise<string | null> {
  const p = await tx.tiendaPedido.findUnique({ where: { id: pedidoId }, select: { creadoEn: true, items: { select: { productoId: true, nombreProducto: true } } } });
  if (!p) return null;
  if (ahora >= venceDe(p.creadoEn)) return `venció a los ${DIAS_PEDIDO_PENDIENTE} días sin pagarse.`;
  const ids = [...new Set(p.items.map((i) => i.productoId))];
  const aLaVenta = new Set((await tx.tiendaProducto.findMany({ where: { id: { in: ids }, publicado: true }, select: { id: true } })).map((x) => x.id));
  const fuera = p.items.find((i) => !aLaVenta.has(i.productoId));
  return fuera ? `"${fuera.nombreProducto}" dejó de estar a la venta.` : null;
}

/** Un pedido sin pagar que ya no se puede pagar: CANCELADO (un pago que llegue después va a devolución). */
export async function cancelarPedido(tenantId: string, pedidoId: string, motivo: string) {
  await conTenant(tenantId, (tx) =>
    tx.tiendaPedido.updateMany({ where: { id: pedidoId, estado: "PENDIENTE" }, data: { estado: "CANCELADO", observacion: `No se pagó a tiempo: ${motivo}` } }),
  );
}

/** Un pedido, como lo cobra el registro del núcleo (registrarCobro). */
const pedidoACobrar: CosaACobrar = {
  nombre: "el pedido",
  async buscar(tx, id) {
    // Bloquea el pedido: lo que se decide acá (pagado, cerrado) no cambia hasta terminar.
    const [p] = await tx.$queryRaw<{ estado: string; total: number; cobroId: string | null }[]>`
      SELECT estado::text AS estado, total, "cobroId" FROM tienda_pedido WHERE id = ${id}::uuid FOR UPDATE`;
    if (!p) return null;
    // Vencido o con un producto fuera de venta: un pago que llega no se entrega (va a devolución).
    const cerrado = p.estado === "CANCELADO" || p.estado === "DEVUELTO" || (p.estado === "PENDIENTE" && (await motivoDeCierre(tx, id)) !== null);
    const estado = cerrado ? "cerrada" : p.estado === "PENDIENTE" ? "abierta" : p.estado === "EN_REVISION" ? "en-revision" : "pagada";
    return { estado, total: p.total, cobroId: p.cobroId };
  },
  async anotarEstado(tx, id, estadoCobro) {
    await tx.tiendaPedido.updateMany({ where: { id, estado: "PENDIENTE" }, data: { estadoCobro } });
  },
  async aRevision(tx, id, c) {
    await tx.tiendaPedido.updateMany({
      where: { id, estado: "PENDIENTE" },
      data: { estado: "EN_REVISION", estadoCobro: c.estadoPasarela, cobroId: c.cobroId, pasarela: c.pasarela, observacion: c.observacion },
    });
  },
  async marcarPagada(tx, id, c) {
    const { count } = await tx.tiendaPedido.updateMany({
      where: { id, estado: "PENDIENTE" },
      data: { estado: "PAGADO", pagadoEn: new Date(), cobroId: c.cobroId, estadoCobro: c.estadoPasarela, pasarela: c.pasarela },
    });
    return count === 1;
  },
  // Devuelto o contracargo: el pedido queda DEVUELTO; si ya se mandó a producir, marcado para que
  // la banda lo resuelva con el proveedor (Deoco no media ni mueve plata).
  async alDevolverse(tx, id, cobro) {
    const p = await tx.tiendaPedido.findUniqueOrThrow({ where: { id }, include: { ordenes: { select: { id: true } } } });
    if (p.estado === "DEVUELTO") return;
    const producido = p.ordenes.length > 0;
    await tx.tiendaPedido.update({
      where: { id },
      data: {
        estado: "DEVUELTO", devueltoEn: new Date(), contracargo: cobro.contracargo, estadoCobro: cobro.estadoPasarela, resolverConProveedor: producido,
        observacion: `${cobro.contracargo ? "El comprador desconoció el pago (contracargo)." : "El pago se devolvió."}${producido ? " Ya se había mandado a producir: resolvelo con el proveedor." : ""}`,
      },
    });
  },
  async alPagarse(tx, id) {
    const { tenantId } = await tx.tiendaPedido.findUniqueOrThrow({ where: { id }, select: { tenantId: true } });
    await fijarCostosDelPedido(tx, id);
    await registrarDeudas(tx, tenantId, id);
  },
  evento: (pedidoId) => ({ nombre: "pedido.pagado", payload: { pedidoId } }),
};

/**
 * Registra lo que dijo la API de la pasarela sobre un cobro (la regla es la del núcleo). Al
 * pagarse, en la misma transacción: copia de costos, deuda con cada proveedor y pedido.pagado.
 */
export function registrarPago(tenantId: string, pasarelaId: string, cobro: CobroConsultado): Promise<ResultadoPago> {
  return registrarCobro(tienda, tenantId, pasarelaId, cobro, pedidoACobrar);
}

/**
 * Deuda con cada proveedor del pedido: producción de sus renglones (copia al pagarse) más un
 * envío, el mayor de sus renglones (despacha un paquete). Una sola vez por (pedido, proveedor),
 * junto con su orden de producción.
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
  // Y la orden de producción de cada proveedor, que ve y despacha en su panel. Lleva copia del
  // nombre y el contacto de la banda: el proveedor no lee la banda ni sus miembros.
  const { nombre: bandaNombre } = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nombre: true } });
  const config = await tx.tiendaConfig.findUnique({ where: { tenantId } });
  const titular = config?.contactoEmail
    ? null
    : await titularDeBanda(tx);
  const contacto = {
    contactoNombre: config?.contactoNombre || bandaNombre,
    contactoEmail: config?.contactoEmail || titular?.email || "",
    contactoTelefono: config?.contactoTelefono ?? "",
  };
  await tx.tiendaOrden.createMany({
    data: [...porProveedor.keys()].map((proveedorId) => ({ tenantId, pedidoId, proveedorId, bandaNombre, ...contacto })),
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

// ---------- Conciliación y vencimiento (los avisos se pierden) ----------

/** Cada cuánto se le vuelve a preguntar a la pasarela por un pedido sin pago, según su edad. */
function intervalo(edadMs: number): number {
  if (edadMs < 3600_000) return 2 * 60_000;
  if (edadMs < 86_400_000) return 30 * 60_000;
  return 6 * 3600_000;
}

/**
 * El barrido: los pedidos sin pagar. Los que se mandaron a pagar se le preguntan a la pasarela
 * de la banda (un pago aprobado con aviso perdido se registra igual). Los vencidos (7 días) o con
 * un producto fuera de venta pasan a CANCELADO, después de una última consulta.
 */
export async function conciliarPedidos(ahora = new Date()) {
  const desde = new Date(ahora.getTime() - (DIAS_PEDIDO_PENDIENTE + 30) * 86_400_000);
  const bandas = await prisma.$queryRaw<{ id: string }[]>`SELECT b AS id FROM tienda_bandas_a_conciliar(${desde}::timestamp, ${ahora}::timestamp) AS b`;
  for (const { id: tenantId } of bandas) {
    const pedidos = await conTenant(tenantId, (tx) =>
      tx.tiendaPedido.findMany({ where: { estado: "PENDIENTE", creadoEn: { gte: desde } }, select: { id: true, creadoEn: true, conciliadoEn: true, preferenciaId: true }, orderBy: { creadoEn: "asc" }, take: 300 }),
    );
    for (const p of pedidos) {
      try {
        const motivo = await conTenant(tenantId, (tx) => motivoDeCierre(tx, p.id, ahora));
        const edad = ahora.getTime() - p.creadoEn.getTime();
        const toca = !p.conciliadoEn || ahora.getTime() - p.conciliadoEn.getTime() >= intervalo(edad) || motivo !== null;
        if (p.preferenciaId && toca && edad >= 2 * 60_000) {
          await conciliarCobros(tienda, tenantId, p.id, (pasarela, cobro) => registrarPago(tenantId, pasarela, cobro));
          await conTenant(tenantId, (tx) => tx.tiendaPedido.update({ where: { id: p.id }, data: { conciliadoEn: ahora } }));
        }
        if (motivo) await cancelarPedido(tenantId, p.id, motivo);
      } catch (e) {
        console.error(`[tienda] conciliar ${p.id}:`, e instanceof Error ? e.message : e);
      }
    }
  }
}
