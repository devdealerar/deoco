// Panel del proveedor (app.<raiz>/portal/tienda): sus órdenes de producción de todas las
// bandas, el despacho y su cuenta corriente con cada banda.
// - Lectura: conCuentaExterna() → las políticas `proveedor_lee` dejan ver SOLO lo suyo, en
//   cualquier banda. Nunca montos de venta: se eligen las columnas a mano.
// - Escritura (despachar, saldar) y links de archivos: conCuentaExternaEnBanda(). No abre la
//   banda: la base solo deja tocar SUS órdenes y deudas, y solo las columnas de despachar y de
//   saldar (políticas y disparadores de la migración "tienda_proveedor_escribe_en_la_base").
//   Aunque este código se equivoque de filtro, la base no deja pasar nada más.
import {
  conCuentaExterna,
  conCuentaExternaEnBanda,
  crearCuentaExterna,
  cuentasDeReferencia,
  ErrorCuentaExterna,
  quitarCuentaExterna,
} from "@/nucleo/acceso/externas";
import { urlFirmada } from "@/nucleo/archivos/firmados";
import { emitir } from "@/nucleo/eventos/bus";
import type { ComoStaff } from "./catalogo";
import { describirVariante } from "./comun";
import { describirEspecificacion } from "./impresion";
import tienda from "./index";

export class ErrorProveedor extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const numeroPedido = (id: string) => id.slice(0, 8).toUpperCase();
/** Cuánto vale el link al archivo que se arma al abrir la orden en el panel. */
export const VALIDEZ_LINK_PANEL = 3 * 24 * 60 * 60;

export type EstadoOrden = "EN_PRODUCCION" | "DESPACHADO";

export type OrdenResumen = {
  id: string;
  banda: string;
  pedido: string;
  creadoEn: Date;
  estado: EstadoOrden;
  seguimiento: string | null;
  despachadoEn: Date | null;
  unidades: number;
};

/** Sus órdenes, de todas las bandas: primero las que faltan despachar, después las más nuevas. */
export async function ordenesDelProveedor(usuarioId: string, filtro: { estado?: EstadoOrden } = {}): Promise<OrdenResumen[]> {
  return conCuentaExterna(usuarioId, tienda, async (tx) => {
    const ordenes = await tx.tiendaOrden.findMany({
      where: filtro.estado ? { estado: filtro.estado } : {},
      orderBy: [{ estado: "asc" }, { creadoEn: "desc" }],
      take: 500,
    });
    const items = await tx.tiendaPedidoItem.findMany({
      where: { pedidoId: { in: ordenes.map((o) => o.pedidoId) } },
      select: { tenantId: true, pedidoId: true, cantidad: true },
    });
    return ordenes.map((o) => ({
      id: o.id,
      banda: o.bandaNombre,
      pedido: numeroPedido(o.pedidoId),
      creadoEn: o.creadoEn,
      estado: o.estado,
      seguimiento: o.seguimiento,
      despachadoEn: o.despachadoEn,
      unidades: items.filter((i) => i.tenantId === o.tenantId && i.pedidoId === o.pedidoId).reduce((s, i) => s + i.cantidad, 0),
    }));
  });
}

export type OrdenDetalle = OrdenResumen & {
  tenantId: string;
  renglones: {
    id: string;
    productoBase: string;
    producto: string;
    variante: string;
    cantidad: number;
    especificacion: string;
    archivo: { nombre: string; url: string };
  }[];
  envio: { nombre: string; telefono: string; direccion: string; ciudad: string; provincia: string; codigoPostal: string };
  contacto: { nombre: string; email: string; telefono: string };
};

/** Una orden suya con todo para producir y enviar. Sin montos. null si no es suya. */
export async function ordenDelProveedor(usuarioId: string, ordenId: string, ahora = new Date()): Promise<OrdenDetalle | null> {
  if (!UUID.test(ordenId)) return null;
  const leida = await conCuentaExterna(usuarioId, tienda, async (tx) => {
    const orden = await tx.tiendaOrden.findUnique({ where: { id: ordenId } });
    if (!orden) return null;
    const pedido = await tx.tiendaPedido.findUniqueOrThrow({
      where: { tenantId_id: { tenantId: orden.tenantId, id: orden.pedidoId } },
      // A mano: ni precios, ni totales, ni datos de pago.
      select: { nombre: true, telefono: true, calle: true, numero: true, piso: true, ciudad: true, provincia: true, codigoPostal: true },
    });
    const items = await tx.tiendaPedidoItem.findMany({
      where: { tenantId: orden.tenantId, pedidoId: orden.pedidoId },
      select: {
        id: true,
        nombreProducto: true,
        variante: true,
        cantidad: true,
        productoBase: true,
        producto: { select: { diseno: { select: { archivoId: true, archivoNombre: true } } } },
      },
      orderBy: { nombreProducto: "asc" },
    });
    // El contacto que la banda cargó en la tienda; si no, el que se copió en la orden al pagarse.
    const config = await tx.tiendaConfig.findUnique({ where: { tenantId: orden.tenantId } });
    return { orden, pedido, items, config };
  });
  if (!leida) return null;
  const { orden, pedido, items, config } = leida;
  // Un link nuevo por archivo cada vez que se abre: si el del mail venció, acá hay otro. Se firma
  // con lo que la cuenta ve en la banda: solo los diseños de sus renglones.
  const links = new Map<string, string>();
  await conCuentaExternaEnBanda(usuarioId, tienda, orden.tenantId, async (tx) => {
    for (const i of items) {
      const { archivoId } = i.producto.diseno;
      if (!links.has(archivoId)) {
        links.set(archivoId, await urlFirmada(tienda, orden.tenantId, archivoId, { validoPorSegundos: VALIDEZ_LINK_PANEL, ahora, tx }));
      }
    }
  });
  const contacto = config?.contactoEmail
    ? { nombre: config.contactoNombre || orden.bandaNombre, email: config.contactoEmail, telefono: config.contactoTelefono }
    : { nombre: orden.contactoNombre || orden.bandaNombre, email: orden.contactoEmail, telefono: orden.contactoTelefono };
  return {
    id: orden.id,
    tenantId: orden.tenantId,
    banda: orden.bandaNombre,
    pedido: numeroPedido(orden.pedidoId),
    creadoEn: orden.creadoEn,
    estado: orden.estado,
    seguimiento: orden.seguimiento,
    despachadoEn: orden.despachadoEn,
    unidades: items.reduce((s, i) => s + i.cantidad, 0),
    renglones: items.map((i) => ({
      id: i.id,
      productoBase: i.productoBase.nombre,
      producto: i.nombreProducto,
      variante: describirVariante(i.variante as Record<string, string>),
      cantidad: i.cantidad,
      especificacion: describirEspecificacion(i.productoBase),
      archivo: { nombre: i.producto.diseno.archivoNombre, url: links.get(i.producto.diseno.archivoId)! },
    })),
    envio: {
      nombre: pedido.nombre,
      telefono: pedido.telefono,
      direccion: `${pedido.calle} ${pedido.numero}${pedido.piso ? `, ${pedido.piso}` : ""}`,
      ciudad: pedido.ciudad,
      provincia: pedido.provincia,
      codigoPostal: pedido.codigoPostal,
    },
    contacto: { nombre: contacto.nombre, email: contacto.email, telefono: contacto.telefono },
  };
}

/** Banda de una orden o deuda suya (lectura como proveedor), con la referencia verificada. */
async function deLaCuenta<T extends { tenantId: string }>(usuarioId: string, leer: (tx: Parameters<Parameters<typeof conCuentaExterna>[2]>[0]) => Promise<T[]>) {
  return conCuentaExterna(usuarioId, tienda, async (tx, referencia) => ({ filas: await leer(tx), proveedorId: referencia }));
}

/**
 * Marca la orden despachada (con número de seguimiento opcional). Si era la última orden del
 * pedido sin despachar, la base pasa el pedido a DESPACHADO. Emite `orden.despachada`: el fan
 * recibe un mail con el seguimiento. Una orden ya despachada no se vuelve a despachar.
 */
export async function despacharOrden(usuarioId: string, ordenId: string, seguimientoCrudo: string) {
  const seguimiento = seguimientoCrudo.trim().replace(/\s+/g, " ");
  if (seguimiento.length > 80) throw new ErrorProveedor("El número de seguimiento es muy largo (máximo 80 caracteres).");
  if (!UUID.test(ordenId)) throw new ErrorProveedor("Esa orden no existe.");
  const { filas, proveedorId } = await deLaCuenta(usuarioId, (tx) => tx.tiendaOrden.findMany({ where: { id: ordenId } }));
  const [orden] = filas;
  if (!orden) throw new ErrorProveedor("Esa orden no existe.");
  await conCuentaExternaEnBanda(usuarioId, tienda, orden.tenantId, async (tx) => {
    const { count } = await tx.tiendaOrden.updateMany({
      where: { id: ordenId, proveedorId, estado: "EN_PRODUCCION" },
      data: { estado: "DESPACHADO", seguimiento: seguimiento || null, despachadoEn: new Date(), despachadoPor: usuarioId },
    });
    if (count === 0) throw new ErrorProveedor("Esa orden ya estaba despachada.");
    // createMany: sin RETURNING (la cuenta externa escribe auditoría, no la lee).
    await tx.auditoria.createMany({
      data: [{ usuarioId, tenantId: orden.tenantId, accion: "tienda.orden_despachada", detalle: { ordenId, seguimiento: seguimiento || null } }],
    });
    await emitir("orden.despachada", orden.tenantId, { ordenId }, usuarioId, { tx, unica: `orden:${ordenId}` });
  });
}

export type DeudaVista = { id: string; pedido: string; creadoEn: Date; produccion: number; envio: number; total: number; saldadaEn: Date | null; nota: string | null };
export type CuentaConBanda = { tenantId: string; banda: string; pendiente: number; saldado: number; deudas: DeudaVista[] };

/** Cuenta corriente con cada banda: lo que le deben (producción + envío) y lo saldado. */
export async function cuentaCorriente(usuarioId: string): Promise<CuentaConBanda[]> {
  return conCuentaExterna(usuarioId, tienda, async (tx) => {
    const deudas = await tx.tiendaDeuda.findMany({ orderBy: { creadoEn: "desc" } });
    const ordenes = await tx.tiendaOrden.findMany({ select: { tenantId: true, bandaNombre: true, creadoEn: true }, orderBy: { creadoEn: "desc" } });
    const nombres = new Map<string, string>();
    for (const o of ordenes) if (!nombres.has(o.tenantId)) nombres.set(o.tenantId, o.bandaNombre);
    const porBanda = new Map<string, CuentaConBanda>();
    for (const d of deudas) {
      const c = porBanda.get(d.tenantId) ?? { tenantId: d.tenantId, banda: nombres.get(d.tenantId) ?? "Banda", pendiente: 0, saldado: 0, deudas: [] };
      if (d.saldadaEn) c.saldado += d.total;
      else c.pendiente += d.total;
      c.deudas.push({
        id: d.id,
        pedido: numeroPedido(d.pedidoId),
        creadoEn: d.creadoEn,
        produccion: d.produccion,
        envio: d.envio,
        total: d.total,
        saldadaEn: d.saldadaEn,
        nota: d.notaSaldo,
      });
      porBanda.set(d.tenantId, c);
    }
    return [...porBanda.values()].sort((a, b) => b.pendiente - a.pendiente || a.banda.localeCompare(b.banda));
  });
}

/**
 * El proveedor marca saldadas deudas suyas con una banda (cobró). La banda solo lo ve. Las ya
 * saldadas no se pisan. Devuelve cuántas marcó.
 */
export async function saldarDeudas(usuarioId: string, tenantId: string, deudaIds: string[], notaCruda: string): Promise<number> {
  const ids = deudaIds.filter((id) => UUID.test(id));
  if (ids.length === 0) throw new ErrorProveedor("Marcá al menos una deuda.");
  const nota = notaCruda.trim().slice(0, 300);
  const { filas, proveedorId } = await deLaCuenta(usuarioId, (tx) =>
    tx.tiendaDeuda.findMany({ where: { id: { in: ids }, tenantId }, select: { id: true, tenantId: true } }),
  );
  if (filas.length !== ids.length) throw new ErrorProveedor("Alguna de esas deudas no es tuya con esta banda.");
  return conCuentaExternaEnBanda(usuarioId, tienda, tenantId, async (tx) => {
    const { count } = await tx.tiendaDeuda.updateMany({
      where: { id: { in: ids }, proveedorId, saldadaEn: null },
      data: { saldadaEn: new Date(), saldadaPor: usuarioId, notaSaldo: nota || null },
    });
    if (count) {
      await tx.auditoria.createMany({ data: [{ usuarioId, tenantId, accion: "tienda.deuda_saldada", detalle: { deudas: ids, nota } }] });
    }
    return count;
  });
}

// ---------- Accesos al panel (los da el staff) ----------

/** El staff da acceso al panel del proveedor. Devuelve la clave temporal si creó el usuario. */
export async function darAccesoProveedor(comoStaff: ComoStaff, proveedorId: string, datos: { email: string; nombre: string }) {
  return comoStaff("tienda.acceso_proveedor_creado", async (tx, ctx) => {
    const proveedor = await tx.tiendaProveedor.findUnique({ where: { id: proveedorId }, select: { id: true, nombre: true } });
    if (!proveedor) throw new ErrorProveedor("Ese proveedor no existe.");
    try {
      const r = await crearCuentaExterna(tx, tienda, { referencia: proveedor.id, email: datos.email, nombre: datos.nombre, creadoPor: ctx.usuarioId });
      ctx.detalle({ proveedorId, proveedor: proveedor.nombre, email: r.email, usuarioNuevo: r.claveTemporal !== null });
      return r;
    } catch (e) {
      if (e instanceof ErrorCuentaExterna) throw new ErrorProveedor(e.message);
      throw e;
    }
  });
}

export async function quitarAccesoProveedor(comoStaff: ComoStaff, cuentaId: string) {
  return comoStaff("tienda.acceso_proveedor_quitado", async (tx, ctx) => {
    try {
      await quitarCuentaExterna(tx, tienda, cuentaId);
    } catch (e) {
      if (e instanceof ErrorCuentaExterna) throw new ErrorProveedor(e.message);
      throw e;
    }
    ctx.detalle({ cuentaId });
  });
}

export const accesosDeProveedor = (proveedorId: string) => cuentasDeReferencia(tienda, proveedorId);
