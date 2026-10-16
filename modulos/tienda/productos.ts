// Diseños y productos de la banda (panel). Todo bajo conTenant: una banda solo ve y usa lo
// suyo. Las tablas de la banda referencian el catálogo base global; una clave foránea no
// mira RLS, así que diseño y producto se buscan SIEMPRE bajo conTenant antes de usarlos.
import type { Prisma } from "@/generated/prisma/client";
import { borrarArchivos, ErrorArchivo, guardarArchivo, leerArchivo, marcarPublicos } from "@/nucleo/archivos";
import { exigirLimite } from "@/nucleo/cuenta";
import { conTenant, type TxTenant } from "@/nucleo/db/con-tenant";
import { prisma } from "@/nucleo/db/cliente";
import { MODULO, type Opcion } from "./catalogo";
import { type Especificacion, ErrorImpresion, medidaDeDiseno, medir, problemasDeImpresion } from "./impresion";

export class ErrorTienda extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ArchivoSubido = { nombre: string; datos: Buffer };

/** Los archivos que subió el módulo se borran si después falla la base (no quedan huérfanos). */
async function conLimpieza<T>(tenantId: string, ids: string[], fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (ids.length) await conTenant(tenantId, (tx) => borrarArchivos(tx, tenantId, ids));
    throw e;
  }
}

// ---------- Diseños ----------

/**
 * Sube un archivo de impresión (PNG de alta o PDF). Si se indica para qué producto base es,
 * se valida contra sus especificaciones y, si no cumple, no se guarda: el error dice qué falta.
 */
export async function subirDiseno(tenantId: string, nombre: string, archivo: ArchivoSubido, paraBaseId?: string | null) {
  const medida = await medir(archivo.datos, archivo.nombre);
  if (paraBaseId) {
    const base = await baseActiva(paraBaseId, { soloActivos: false });
    const problemas = problemasDeImpresion(medida, base);
    if (problemas.length) throw new ErrorImpresion(problemas.join(" "));
  }
  const guardado = await guardarArchivo(tenantId, archivo, {
    moduloId: MODULO,
    recurso: "diseno",
    tipos: ["png", "pdf"],
    variantes: medida.formato === "png" ? [{ nombre: "web", ancho: 800, alto: 800 }] : [],
  });
  return conLimpieza(tenantId, [guardado.id], () =>
    conTenant(tenantId, (tx) =>
      tx.tiendaDiseno.create({
        data: {
          tenantId,
          nombre: nombre.trim() || archivo.nombre,
          archivoId: guardado.id,
          archivoNombre: guardado.nombre,
          formato: medida.formato,
          ...(medida.formato === "png"
            ? { anchoPx: medida.anchoPx, altoPx: medida.altoPx, dpi: medida.dpi }
            : { anchoPt: medida.anchoPt, altoPt: medida.altoPt }),
          conVistaPrevia: guardado.variantes.includes("web"),
        },
      }),
    ),
  );
}

/** La biblioteca de diseños de la banda (sin las versiones, que son de un producto ya vendido). */
export const listarDisenos = (tenantId: string) =>
  conTenant(tenantId, (tx) => tx.tiendaDiseno.findMany({ where: { reemplazaAId: null }, orderBy: { creadoEn: "desc" } }));

/** Pedidos que ya cuentan como venta (el fan pagó): su arte no se puede pisar. */
const VENDIDO = { estado: { in: ["PAGADO", "EN_REVISION", "DESPACHADO"] as ("PAGADO" | "EN_REVISION" | "DESPACHADO")[] } };

// ---------- Productos ----------

async function baseActiva(id: string, { soloActivos }: { soloActivos: boolean }) {
  if (!UUID.test(id)) throw new ErrorTienda("Elegí un producto base.");
  const base = await prisma.tiendaProductoBase.findUnique({ where: { id } });
  if (!base) throw new ErrorTienda("Ese producto base no existe.");
  if (soloActivos && !base.activo) {
    throw new ErrorTienda(`${base.nombre} ya no está disponible para productos nuevos.`);
  }
  return base;
}

/** Variantes que ofrece la banda: de cada opción del base, al menos un valor, y solo valores del base. */
export function validarVariantes(elegidas: Opcion[], delBase: Opcion[]): Opcion[] {
  return delBase.map((o) => {
    const valores = elegidas.find((e) => e.nombre === o.nombre)?.valores ?? [];
    const ajenos = valores.filter((v) => !o.valores.includes(v));
    if (ajenos.length) throw new ErrorTienda(`${o.nombre}: "${ajenos.join(", ")}" no es una opción de este producto.`);
    if (valores.length === 0) throw new ErrorTienda(`Elegí al menos un ${o.nombre.toLowerCase()} para ofrecer.`);
    return { nombre: o.nombre, valores: o.valores.filter((v) => valores.includes(v)) }; // en el orden del base
  });
}

export type DatosProducto = {
  disenoId: string;
  nombre: string;
  descripcion: string;
  precio: number;
  variantes: Opcion[];
};

async function validarProducto(tenantId: string, base: Especificacion & { opciones: unknown }, d: DatosProducto) {
  const nombre = d.nombre.trim();
  if (!nombre) throw new ErrorTienda("Falta el nombre del producto.");
  if (nombre.length > 80) throw new ErrorTienda("El nombre es muy largo (hasta 80 caracteres).");
  if (!Number.isInteger(d.precio) || d.precio <= 0) throw new ErrorTienda("Poné un precio mayor que cero.");
  if (!UUID.test(d.disenoId)) throw new ErrorTienda("Elegí un diseño.");
  // Bajo RLS: un diseño de otra banda no existe.
  const diseno = await conTenant(tenantId, (tx) => tx.tiendaDiseno.findUnique({ where: { id: d.disenoId } }));
  if (!diseno) throw new ErrorTienda("Ese diseño no existe.");
  const problemas = problemasDeImpresion(medidaDeDiseno(diseno), base);
  if (problemas.length) throw new ErrorTienda(`El diseño "${diseno.nombre}" no sirve: ${problemas.join(" ")}`);
  return {
    nombre,
    descripcion: d.descripcion.trim(),
    precio: d.precio,
    disenoId: diseno.id,
    variantes: validarVariantes(d.variantes, base.opciones as Opcion[]) as unknown as Prisma.InputJsonValue,
  };
}

async function subirFoto(tenantId: string, foto: ArchivoSubido) {
  return guardarArchivo(tenantId, foto, {
    moduloId: MODULO,
    recurso: "foto-producto",
    tipos: ["jpeg", "png", "webp"],
    maxBytes: 10 * 1024 * 1024,
    variantes: [{ nombre: "web", ancho: 1200, alto: 1200 }],
  });
}

/** Producto nuevo, en borrador. El producto base tiene que estar activo. */
export async function crearProducto(tenantId: string, productoBaseId: string, d: DatosProducto, foto?: ArchivoSubido | null) {
  const base = await baseActiva(productoBaseId, { soloActivos: true });
  const datos = await validarProducto(tenantId, base, d);
  const f = foto ? await subirFoto(tenantId, foto) : null;
  return conLimpieza(tenantId, f ? [f.id] : [], () =>
    conTenant(tenantId, (tx) =>
      tx.tiendaProducto.create({
        data: { tenantId, productoBaseId: base.id, ...datos, fotoArchivoId: f?.id, fotoNombre: f?.nombre, publicado: false },
      }),
    ),
  );
}

/**
 * Duplicar (documento maestro §7): la misma configuración en un producto nuevo, en borrador,
 * para cambiarle el arte y publicarlo como otra versión. La foto se copia (es otro archivo:
 * cambiar la de uno no toca la del otro). Como todo producto nuevo, el base tiene que estar activo.
 */
export async function duplicarProducto(tenantId: string, id: string) {
  const p = await productoDe(tenantId, id);
  const foto = p.fotoArchivoId ? await leerArchivo(tenantId, p.fotoArchivoId, MODULO) : null;
  const nombre = `${p.nombre.slice(0, 80 - " (copia)".length)} (copia)`;
  return crearProducto(tenantId, p.productoBaseId, { disenoId: p.disenoId, nombre, descripcion: p.descripcion, precio: p.precio, variantes: p.variantes as Opcion[] }, foto);
}

/** Cambia un producto. El producto base no cambia (aunque se haya desactivado, sigue andando). */
export async function actualizarProducto(
  tenantId: string,
  id: string,
  d: DatosProducto,
  foto?: ArchivoSubido | null,
  quitarFoto = false,
) {
  const actual = await productoDe(tenantId, id);
  const datos = await validarProducto(tenantId, actual.productoBase, d);
  const f = foto ? await subirFoto(tenantId, foto) : null;
  return conLimpieza(tenantId, f ? [f.id] : [], () =>
    conTenant(tenantId, async (tx) => {
      if (datos.disenoId !== actual.disenoId) datos.disenoId = await arteNuevo(tx, actual, datos.disenoId);
      const cambiaFoto = f || quitarFoto;
      if (cambiaFoto && actual.fotoArchivoId) await borrarArchivos(tx, tenantId, [actual.fotoArchivoId]);
      if (f && actual.publicado) await marcarPublicos(tx, [f.id], true);
      return tx.tiendaProducto.update({
        where: { id },
        data: { ...datos, ...(cambiaFoto ? { fotoArchivoId: f?.id ?? null, fotoNombre: f?.nombre ?? null } : {}) },
      });
    }),
  );
}

/**
 * El arte de un producto cambia (documento maestro §7; 3.2). Si el arte actual ya se vendió (un
 * pedido pagado lo usa), no se pisa: se crea una versión nueva del diseño, con el archivo elegido,
 * que apunta a la que reemplaza (`reemplazaAId`); los pedidos viejos conservan la suya. Si no se
 * vendió: si es una versión de este producto, se le cambia el archivo; si es de la biblioteca, el
 * producto pasa a usar el elegido. Devuelve el diseño que queda en el producto.
 */
async function arteNuevo(tx: TxTenant, actual: { id: string; disenoId: string; diseno: { reemplazaAId: string | null } }, elegidoId: string): Promise<string> {
  const elegido = await tx.tiendaDiseno.findUniqueOrThrow({ where: { id: elegidoId } });
  const vendido = (await tx.tiendaPedidoItem.count({ where: { productoId: actual.id, disenoId: actual.disenoId, pedido: VENDIDO } })) > 0;
  const archivo = {
    nombre: elegido.nombre, archivoId: elegido.archivoId, archivoNombre: elegido.archivoNombre, formato: elegido.formato,
    anchoPx: elegido.anchoPx, altoPx: elegido.altoPx, dpi: elegido.dpi, anchoPt: elegido.anchoPt, altoPt: elegido.altoPt, conVistaPrevia: elegido.conVistaPrevia,
  };
  if (vendido) {
    const version = await tx.tiendaDiseno.create({ data: { tenantId: elegido.tenantId, ...archivo, reemplazaAId: actual.disenoId } });
    return version.id;
  }
  if (actual.diseno.reemplazaAId) {
    // Una versión se pisa solo si nadie más la usa: ni otro producto (uno duplicado), ni un pedido
    // todavía sin pagar (fabricaría el arte nuevo). Si no, otra versión encima.
    const usada =
      (await tx.tiendaPedidoItem.count({ where: { disenoId: actual.disenoId } })) +
      (await tx.tiendaProducto.count({ where: { disenoId: actual.disenoId, id: { not: actual.id } } }));
    if (usada) return (await tx.tiendaDiseno.create({ data: { tenantId: elegido.tenantId, ...archivo, reemplazaAId: actual.disenoId } })).id;
    await tx.tiendaDiseno.update({ where: { id: actual.disenoId }, data: archivo });
    return actual.disenoId;
  }
  return elegidoId;
}

export type ArteDelProducto = { disenoId: string; nombre: string; archivoNombre: string; archivoId: string; desde: Date; pedidos: number; actual: boolean };

/** Las artes que tuvo un producto, de la actual a la primera: desde cuándo y cuántos pedidos pagados salieron con cada una. */
export async function historialDeArte(tenantId: string, productoId: string): Promise<ArteDelProducto[]> {
  return conTenant(tenantId, async (tx) => {
    const producto = await tx.tiendaProducto.findUniqueOrThrow({ where: { id: productoId }, select: { disenoId: true, creadoEn: true } });
    const artes: ArteDelProducto[] = [];
    for (let id: string | null = producto.disenoId; id && artes.length < 100; ) {
      const d: { id: string; nombre: string; archivoNombre: string; archivoId: string; creadoEn: Date; reemplazaAId: string | null } = await tx.tiendaDiseno.findUniqueOrThrow({ where: { id } });
      const pedidos = await tx.tiendaPedidoItem.count({ where: { productoId, disenoId: d.id, pedido: VENDIDO } });
      // La primera arte rige desde que existe el producto; cada versión, desde que se creó.
      artes.push({ disenoId: d.id, nombre: d.nombre, archivoNombre: d.archivoNombre, archivoId: d.archivoId, desde: d.reemplazaAId ? d.creadoEn : producto.creadoEn, pedidos, actual: artes.length === 0 });
      id = d.reemplazaAId;
    }
    return artes;
  });
}

/** Publicado se ve en la tienda; borrador, no. La foto propia se hace pública con el producto. */
export async function publicarProducto(tenantId: string, id: string, publicado: boolean) {
  // Aunque su producto base se haya desactivado: un producto que ya existe sigue andando.
  const actual = await productoDe(tenantId, id);
  return conTenant(tenantId, async (tx) => {
    if (publicado && !actual.publicado) {
      // El tope de productos publicados de la cuenta (lo fija el plan; sin tope, pasa).
      await exigirLimite(tx, (await import("./index")).default, tenantId, LIMITE_PUBLICADOS, async () => (await tx.tiendaProducto.count({ where: { publicado: true } })) + 1);
    }
    if (actual.fotoArchivoId) await marcarPublicos(tx, [actual.fotoArchivoId], publicado);
    return tx.tiendaProducto.update({
      where: { id },
      data: { publicado, publicadoEn: publicado ? (actual.publicadoEn ?? new Date()) : null },
    });
  });
}

/** Límite de la cuenta: cuántos productos puede tener publicados la banda. */
export const LIMITE_PUBLICADOS = "productos-publicados";

export const contarPublicados = (tenantId: string) => conTenant(tenantId, (tx) => tx.tiendaProducto.count({ where: { publicado: true } }));

/**
 * El tope bajó (la banda bajó de plan): pasa a borrador lo que sobra, por orden inverso de
 * creación (3.2, núcleo d6). No borra nada: la banda lo vuelve a publicar si sube de plan. Un
 * pedido ya hecho se completa igual (el renglón guarda todo).
 */
export async function ajustarPublicados(tenantId: string, maximo: number): Promise<number> {
  return conTenant(tenantId, async (tx) => {
    const publicados = await tx.tiendaProducto.findMany({
      where: { publicado: true },
      orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
      select: { id: true, fotoArchivoId: true },
    });
    const sobran = publicados.slice(0, Math.max(0, publicados.length - maximo));
    if (!sobran.length) return 0;
    await tx.tiendaProducto.updateMany({ where: { id: { in: sobran.map((p) => p.id) } }, data: { publicado: false, publicadoEn: null } });
    const fotos = sobran.map((p) => p.fotoArchivoId).filter((f): f is string => !!f);
    if (fotos.length) await marcarPublicos(tx, fotos, false);
    return sobran.length;
  });
}

/** Un producto de la banda, con su base. Bajo RLS: el de otra banda no existe. */
export async function productoDe(tenantId: string, id: string) {
  if (!UUID.test(id)) throw new ErrorTienda("Ese producto no existe.");
  const p = await conTenant(tenantId, (tx) => tx.tiendaProducto.findUnique({ where: { id }, include: { productoBase: true, diseno: true } }));
  if (!p) throw new ErrorTienda("Ese producto no existe.");
  return p;
}

export const listarProductos = (tenantId: string) =>
  conTenant(tenantId, (tx) =>
    tx.tiendaProducto.findMany({ orderBy: [{ publicado: "desc" }, { nombre: "asc" }], include: { productoBase: true } }),
  );

/** Lo que muestra la tienda pública: solo publicados. */
export const productosPublicados = (tenantId: string) =>
  conTenant(tenantId, (tx) =>
    tx.tiendaProducto.findMany({ where: { publicado: true }, orderBy: { nombre: "asc" }, include: { productoBase: true } }),
  );

// ---------- Margen ----------

export type Margen = {
  precio: number;
  costoProduccion: number;
  /** Lo que le queda a la banda (antes de la comisión de su pasarela de pago). */
  margen: number;
  /** Sobre el precio de venta, con un decimal. */
  porcentaje: number;
  negativo: boolean;
};

/**
 * Margen = precio − costo de producción (el vigente del producto base). El envío no entra:
 * lo paga el fan aparte y va al proveedor.
 */
export function margen(precio: number, base: { costoProduccion: number }): Margen {
  const m = precio - base.costoProduccion;
  return {
    precio,
    costoProduccion: base.costoProduccion,
    margen: m,
    porcentaje: precio > 0 ? Math.round((m / precio) * 1000) / 10 : 0,
    negativo: m < 0,
  };
}

export { ErrorArchivo, ErrorImpresion };
