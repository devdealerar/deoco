// Carrito y checkout. El carrito vive en el navegador del fan (no hay cuenta de fan) y NO
// decide nada: al revisarlo y al confirmar, todo se recalcula contra la base de la banda
// (precio, que siga publicado, que la variante exista). El pedido nace PENDIENTE con su copia
// de precios y envíos.
import type { Prisma } from "@/generated/prisma/client";
import { conTenant } from "@/nucleo/db/con-tenant";
import type { Modulo } from "@/nucleo/modulos/contrato";
import type { Opcion } from "./catalogo";
import { PROVINCIAS } from "./comun";
import { pasarelaLista } from "./pasarelas";

export { describirVariante, PROVINCIAS } from "./comun";

export class ErrorCompra extends Error {
  constructor(public problemas: string[]) {
    super(problemas.join(" "));
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_LINEAS = 30;
export const MAX_CANTIDAD = 10;

/** Lo que guarda el navegador del fan: qué y cuánto. Nunca el precio que vale. */
export type LineaCarrito = { productoId: string; variante: Record<string, string>; cantidad: number };

export type LineaRevisada = LineaCarrito & {
  nombre: string;
  /** Precio y envío por unidad, los de la base ahora. */
  precio: number;
  envio: number;
  productoBaseId: string;
  foto: { id: string; nombre: string; plataforma: boolean } | null;
};

export type Revision = {
  lineas: LineaRevisada[];
  /** Por qué no se puede seguir (vacío: se puede). */
  problemas: string[];
  subtotal: number;
  envio: number;
  total: number;
};

/** Lo que manda el navegador, sin confiar: forma, tamaños y tipos. Junta líneas iguales. */
export function leerCarrito(crudo: unknown): LineaCarrito[] {
  if (!Array.isArray(crudo)) return [];
  const lineas: LineaCarrito[] = [];
  for (const x of crudo.slice(0, MAX_LINEAS)) {
    const l = x as Partial<LineaCarrito>;
    if (typeof l?.productoId !== "string" || !UUID.test(l.productoId)) continue;
    const variante: Record<string, string> = {};
    for (const [k, v] of Object.entries(l.variante && typeof l.variante === "object" ? l.variante : {})) {
      if (typeof v === "string" && k.length <= 40 && v.length <= 40) variante[k] = v;
    }
    const cantidad = Number.isInteger(l.cantidad) ? Math.min(Math.max(l.cantidad as number, 1), MAX_CANTIDAD) : 1;
    const igual = lineas.find((o) => o.productoId === l.productoId && JSON.stringify(o.variante) === JSON.stringify(variante));
    if (igual) igual.cantidad = Math.min(igual.cantidad + cantidad, MAX_CANTIDAD);
    else lineas.push({ productoId: l.productoId, variante, cantidad });
  }
  return lineas;
}


/** ¿La selección es exactamente una de las variantes que ofrece el producto? */
export function problemaDeVariante(ofrecidas: Opcion[], elegida: Record<string, string>): string | null {
  for (const o of ofrecidas) {
    const v = elegida[o.nombre];
    if (!v) return `Elegí ${o.nombre.toLowerCase()}.`;
    if (!o.valores.includes(v)) return `${o.nombre} ${v} ya no está disponible.`;
  }
  const sobran = Object.keys(elegida).filter((k) => !ofrecidas.some((o) => o.nombre === k));
  return sobran.length ? `"${sobran.join(", ")}" no es una opción de este producto.` : null;
}

/**
 * Revisa el carrito contra la base de ESTA banda (bajo RLS: un producto de otra banda no
 * existe). Precios y envíos: los de ahora. Total = suma de precios + suma de envíos.
 */
export async function revisarCarrito(tenantId: string, lineas: LineaCarrito[]): Promise<Revision> {
  const ids = [...new Set(lineas.map((l) => l.productoId))];
  const productos = await conTenant(tenantId, (tx) =>
    tx.tiendaProducto.findMany({ where: { id: { in: ids } }, include: { productoBase: true } }),
  );
  const revisadas: LineaRevisada[] = [];
  const problemas: string[] = [];
  for (const l of lineas) {
    const p = productos.find((x) => x.id === l.productoId);
    if (!p || !p.publicado) {
      problemas.push(p ? `"${p.nombre}" ya no está a la venta: sacalo del carrito para seguir.` : "Un producto del carrito ya no existe: sacalo para seguir.");
      continue;
    }
    const problema = problemaDeVariante(p.variantes as Opcion[], l.variante);
    if (problema) {
      problemas.push(`"${p.nombre}": ${problema}`);
      continue;
    }
    revisadas.push({
      ...l,
      nombre: p.nombre,
      precio: p.precio,
      envio: p.productoBase.costoEnvio,
      productoBaseId: p.productoBaseId,
      foto: p.fotoArchivoId && p.fotoNombre
        ? { id: p.fotoArchivoId, nombre: p.fotoNombre, plataforma: false }
        : p.productoBase.fotoArchivoId && p.productoBase.fotoNombre
          ? { id: p.productoBase.fotoArchivoId, nombre: p.productoBase.fotoNombre, plataforma: true }
          : null,
    });
  }
  if (lineas.length === 0) problemas.push("El carrito está vacío.");
  const subtotal = revisadas.reduce((s, l) => s + l.precio * l.cantidad, 0);
  const envio = revisadas.reduce((s, l) => s + l.envio * l.cantidad, 0);
  return { lineas: revisadas, problemas, subtotal, envio, total: subtotal + envio };
}

// ---------- Datos del fan ----------


export type DatosFan = {
  nombre: string;
  email: string;
  telefono: string;
  calle: string;
  numero: string;
  piso: string;
  ciudad: string;
  provincia: string;
  codigoPostal: string;
};

/** Valida y normaliza. Devuelve los problemas, campo por campo, en lenguaje del fan. */
export function validarDatosFan(d: DatosFan): { datos: DatosFan; problemas: string[] } {
  const t = (v: string, max: number) => (v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const datos: DatosFan = {
    nombre: t(d.nombre, 120),
    email: t(d.email, 200).toLowerCase(),
    telefono: t(d.telefono, 30),
    calle: t(d.calle, 120),
    numero: t(d.numero, 20),
    piso: t(d.piso, 40),
    ciudad: t(d.ciudad, 80),
    provincia: t(d.provincia, 60),
    codigoPostal: t(d.codigoPostal, 10).toUpperCase(),
  };
  const p: string[] = [];
  if (!datos.nombre) p.push("Falta tu nombre.");
  if (!/^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(datos.email)) p.push("Revisá tu email: ahí te llega la confirmación.");
  if (!/^[+\d][\d\s()-]{5,}$/.test(datos.telefono)) p.push("Revisá tu teléfono.");
  if (!datos.calle) p.push("Falta la calle.");
  if (!datos.numero) p.push("Falta el número.");
  if (!datos.ciudad) p.push("Falta la ciudad.");
  if (!PROVINCIAS.includes(datos.provincia)) p.push("Elegí la provincia.");
  if (!/^(\d{4}|[A-Z]\d{4}[A-Z]{3})$/.test(datos.codigoPostal)) p.push("Revisá el código postal (p. ej. 2000 o S2000ABC).");
  return { datos, problemas: p };
}

/**
 * Crea el pedido PENDIENTE, con su copia de precios y envíos. Revalida todo en el momento.
 * Sin pasarela lista (credenciales), no hay compra. `tienda`: el contrato del módulo.
 */
export async function crearPedido(tienda: Modulo, tenantId: string, lineas: LineaCarrito[], fan: DatosFan) {
  const { lista } = await pasarelaLista(tienda, tenantId);
  if (!lista) throw new ErrorCompra(["La tienda no está recibiendo pedidos en este momento."]);
  const { datos, problemas: deFan } = validarDatosFan(fan);
  const revision = await revisarCarrito(tenantId, lineas);
  const problemas = [...revision.problemas, ...deFan];
  if (problemas.length) throw new ErrorCompra(problemas);

  return conTenant(tenantId, async (tx) => {
    const pedido = await tx.tiendaPedido.create({
      data: { tenantId, ...datos, subtotal: revision.subtotal, envio: revision.envio, total: revision.total },
    });
    for (const l of revision.lineas) {
      // Defensa en dos capas: la revisión buscó el producto bajo RLS (de esta banda), y la clave
      // foránea compuesta (tenantId, productoId) hace que la base rechace uno de otra banda.
      await tx.tiendaPedidoItem.create({
        data: {
          tenantId,
          pedidoId: pedido.id,
          productoId: l.productoId,
          productoBaseId: l.productoBaseId,
          nombreProducto: l.nombre,
          variante: l.variante as Prisma.InputJsonValue,
          cantidad: l.cantidad,
          precioUnitario: l.precio,
          envioUnitario: l.envio,
        },
      });
    }
    return pedido;
  });
}
