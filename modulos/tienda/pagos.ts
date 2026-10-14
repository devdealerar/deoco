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
import type { EnvioDeProveedor } from "./pedidos";
import { type CobroConsultado, crearCobro, ErrorPasarela } from "@/nucleo/pagos";


/**
 * Crea el cobro del pedido en la pasarela de la banda, con SUS credenciales, y devuelve adónde
 * mandar al fan. `origen`: el sitio de la banda (para volver después de pagar).
 */
export async function iniciarCobro(tienda: Modulo, tenantId: string, pedidoId: string, origen: string): Promise<string> {
  const pedido = await conTenant(tenantId, (tx) => tx.tiendaPedido.findUnique({ where: { id: pedidoId }, include: { items: true } }));
  if (!pedido || pedido.estado !== "PENDIENTE") throw new ErrorPasarela("Ese pedido no está esperando un pago.");
  const volver = (resultado: string) => `${origen}/tienda/pedido/${pedido.id}?resultado=${resultado}`;
  const { pasarela, redireccion, preferenciaId } = await crearCobro(tienda, tenantId, {
    referencia: pedido.id,
    items: pedido.items.map((i) => ({ titulo: i.nombreProducto, cantidad: i.cantidad, precioUnitario: i.precioUnitario })),
    extras: (pedido.envios as unknown as EnvioDeProveedor[]).map((e) => ({ titulo: tituloEnvio(e, pedido.envios), monto: e.monto })),
    total: pedido.total,
    comprador: { nombre: pedido.nombre, email: pedido.email },
    urls: { exito: volver("exito"), fallo: volver("fallo"), pendiente: volver("pendiente") },
  });
  await conTenant(tenantId, (tx) =>
    tx.tiendaPedido.update({ where: { id: pedido.id }, data: { pasarela, preferenciaId, urlPago: redireccion } }),
  );
  return redireccion;
}

export type ResultadoPago = ResultadoCobro;

/** Un pedido, como lo cobra el registro del núcleo (registrarCobro). */
const pedidoACobrar: CosaACobrar = {
  nombre: "el pedido",
  async buscar(tx, id) {
    const p = await tx.tiendaPedido.findUnique({ where: { id }, select: { estado: true, total: true, cobroId: true } });
    if (!p) return null;
    return { estado: p.estado === "PENDIENTE" ? "abierta" : p.estado === "EN_REVISION" ? "en-revision" : "pagada", total: p.total, cobroId: p.cobroId };
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
