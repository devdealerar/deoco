// Catálogo base y proveedores: tablas globales, iguales para todas las bandas. Las escribe el
// staff (conStaff, auditado); las lee cualquiera. Y lo que el resto de la tienda necesita de
// ellas: el proveedor que vale para un producto y la copia de costos al pagarse un pedido.
import type { Prisma } from "@/generated/prisma/client";
import type { ContextoStaff } from "@/nucleo/acceso/staff";
import { borrarArchivoPlataforma, guardarArchivoPlataforma } from "@/nucleo/archivos/plataforma";
import type { TxTenant } from "@/nucleo/db/con-tenant";
import { prisma } from "@/nucleo/db/cliente";
import { esEmail } from "@/nucleo/correo/direccion";

export const MODULO = "tienda";

export class ErrorCatalogo extends Error {}

/** Quién corre como staff: conStaff (pantallas) o conStaffComo(usuario) (pruebas). */
export type ComoStaff = <T>(accion: string, fn: (tx: TxTenant, ctx: ContextoStaff) => Promise<T>) => Promise<T>;

export const FORMATOS_IMPRESION = ["png", "pdf"] as const;
export type FormatoImpresion = (typeof FORMATOS_IMPRESION)[number];

export type Opcion = { nombre: string; valores: string[] };

function formatos(lista: string[], que: string): FormatoImpresion[] {
  const unicos = [...new Set(lista.map((f) => f.toLowerCase()))];
  if (unicos.length === 0) throw new ErrorCatalogo(`Elegí al menos un formato ${que} (PNG de alta o PDF).`);
  const malos = unicos.filter((f) => !(FORMATOS_IMPRESION as readonly string[]).includes(f));
  if (malos.length) throw new ErrorCatalogo(`Formato no aceptado: ${malos.join(", ").toUpperCase()}. Solo PNG y PDF (SVG no).`);
  return unicos as FormatoImpresion[];
}

/**
 * "Talle: S, M, L, XL" (una línea por opción) → [{ nombre: "Talle", valores: [...] }].
 * Vacío: el producto no tiene variantes (p. ej. un vinilo).
 */
export function leerOpciones(texto: string): Opcion[] {
  const opciones: Opcion[] = [];
  for (const linea of texto.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const [nombreCrudo, ...resto] = linea.split(":");
    const nombre = nombreCrudo.trim();
    const valores = [...new Set(resto.join(":").split(",").map((v) => v.trim()).filter(Boolean))];
    if (!nombre || resto.length === 0 || valores.length === 0) {
      throw new ErrorCatalogo(`"${linea}": cada línea es "Opción: valor, valor" (p. ej. "Talle: S, M, L").`);
    }
    if (nombre.length > 40 || valores.some((v) => v.length > 40)) throw new ErrorCatalogo(`"${linea}": nombres de hasta 40 caracteres.`);
    if (opciones.some((o) => o.nombre.toLowerCase() === nombre.toLowerCase())) throw new ErrorCatalogo(`La opción "${nombre}" está repetida.`);
    opciones.push({ nombre, valores });
  }
  if (opciones.length > 4) throw new ErrorCatalogo("Hasta 4 opciones por producto.");
  return opciones;
}

export const opcionesComoTexto = (o: Opcion[]) => o.map((x) => `${x.nombre}: ${x.valores.join(", ")}`).join("\n");

// ---------- Proveedores ----------

export type DatosProveedor = { nombre: string; email: string; contacto: string; formatos: string[] };

function validarProveedor(d: DatosProveedor) {
  const nombre = d.nombre.trim();
  if (!nombre) throw new ErrorCatalogo("Falta el nombre del proveedor.");
  const email = d.email.trim().toLowerCase();
  if (!esEmail(email)) throw new ErrorCatalogo(`"${d.email}" no es un mail válido (ahí llegan las órdenes).`);
  return { nombre, email, contacto: d.contacto.trim(), formatos: formatos(d.formatos, "que acepte") };
}

export const listarProveedores = () => prisma.tiendaProveedor.findMany({ orderBy: [{ porDefecto: "desc" }, { nombre: "asc" }] });

export async function crearProveedor(comoStaff: ComoStaff, d: DatosProveedor) {
  const datos = validarProveedor(d);
  return comoStaff("tienda.proveedor_creado", async (tx, ctx) => {
    // El primero es el de la plataforma: siempre tiene que haber uno.
    const hayDefecto = (await tx.tiendaProveedor.count({ where: { porDefecto: true } })) > 0;
    const p = await tx.tiendaProveedor.create({ data: { ...datos, porDefecto: !hayDefecto } });
    ctx.detalle({ id: p.id, nombre: p.nombre, email: p.email, porDefecto: p.porDefecto });
    return p;
  });
}

export async function actualizarProveedor(comoStaff: ComoStaff, id: string, d: DatosProveedor & { activo: boolean }) {
  const datos = validarProveedor(d);
  return comoStaff("tienda.proveedor_actualizado", async (tx, ctx) => {
    const antes = await tx.tiendaProveedor.findUnique({ where: { id } });
    if (!antes) throw new ErrorCatalogo("Ese proveedor no existe.");
    if (!d.activo && antes.activo) {
      if (antes.porDefecto) throw new ErrorCatalogo("Es el proveedor por defecto: marcá otro por defecto antes de desactivarlo.");
      // Aun desactivados, sus productos base pueden seguir vendiéndose en productos que ya existen.
      const asignados = await tx.tiendaProductoBase.count({ where: { proveedorId: id } });
      if (asignados) {
        throw new ErrorCatalogo(`Tiene ${asignados} producto(s) base asignados: reasignalos antes de desactivarlo.`);
      }
    }
    const faltan = await productosQueNoPuedeImprimir(tx, id, datos.formatos, antes.porDefecto);
    if (faltan.length) {
      throw new ErrorCatalogo(`Sin esos formatos no puede imprimir: ${faltan.join(", ")}. Ajustá esos productos primero.`);
    }
    const p = await tx.tiendaProveedor.update({ where: { id }, data: { ...datos, activo: d.activo } });
    ctx.detalle({ id, cambios: { ...datos, activo: d.activo } });
    return p;
  });
}

/** Productos base que este proveedor atiende y piden un formato que ya no aceptaría. */
async function productosQueNoPuedeImprimir(tx: TxTenant, proveedorId: string, acepta: string[], porDefecto: boolean) {
  const atendidos = await tx.tiendaProductoBase.findMany({
    where: porDefecto ? { OR: [{ proveedorId }, { proveedorId: null }] } : { proveedorId },
    select: { nombre: true, impresionFormatos: true },
  });
  return atendidos.filter((p) => !p.impresionFormatos.every((f) => acepta.includes(f))).map((p) => p.nombre);
}

export async function marcarProveedorPorDefecto(comoStaff: ComoStaff, id: string) {
  return comoStaff("tienda.proveedor_por_defecto", async (tx, ctx) => {
    const p = await tx.tiendaProveedor.findUnique({ where: { id } });
    if (!p) throw new ErrorCatalogo("Ese proveedor no existe.");
    if (!p.activo) throw new ErrorCatalogo("Un proveedor desactivado no puede ser el de la plataforma.");
    if (p.porDefecto) return;
    const faltan = (await tx.tiendaProductoBase.findMany({ where: { proveedorId: null }, select: { nombre: true, impresionFormatos: true } }))
      .filter((b) => !b.impresionFormatos.every((f) => p.formatos.includes(f)))
      .map((b) => b.nombre);
    if (faltan.length) throw new ErrorCatalogo(`No acepta los formatos de: ${faltan.join(", ")}.`);
    await tx.tiendaProveedor.updateMany({ where: { porDefecto: true }, data: { porDefecto: false } });
    await tx.tiendaProveedor.update({ where: { id }, data: { porDefecto: true } });
    ctx.detalle({ id, nombre: p.nombre });
  });
}

// ---------- Productos base ----------

export type DatosProductoBase = {
  nombre: string;
  descripcion: string;
  opciones: Opcion[];
  costoProduccion: number;
  costoEnvio: number;
  proveedorId: string | null;
  impresionAnchoPx: number;
  impresionAltoPx: number;
  impresionDpi: number;
  impresionFormatos: string[];
};

type Proveedor = { id: string; nombre: string; email: string; formatos: string[]; activo: boolean; porDefecto: boolean };

/**
 * El proveedor que vale para un producto base: el asignado o, si no tiene, el de la
 * plataforma. null si no hay ninguno (no se puede producir).
 */
export async function proveedorEfectivo(
  tx: Pick<TxTenant, "tiendaProveedor">,
  base: { proveedorId: string | null },
): Promise<Proveedor | null> {
  if (base.proveedorId) return tx.tiendaProveedor.findUnique({ where: { id: base.proveedorId } });
  return tx.tiendaProveedor.findFirst({ where: { porDefecto: true } });
}

async function validarProductoBase(tx: TxTenant, d: DatosProductoBase) {
  const nombre = d.nombre.trim();
  if (!nombre) throw new ErrorCatalogo("Falta el nombre del producto.");
  for (const [v, que] of [
    [d.costoProduccion, "el costo de producción"],
    [d.costoEnvio, "el costo de envío"],
  ] as const) {
    if (!Number.isInteger(v) || v < 0) throw new ErrorCatalogo(`Revisá ${que}: tiene que ser un monto en pesos.`);
  }
  for (const [v, que] of [
    [d.impresionAnchoPx, "el ancho"],
    [d.impresionAltoPx, "el alto"],
  ] as const) {
    if (!Number.isInteger(v) || v < 100 || v > 20000) throw new ErrorCatalogo(`Revisá ${que} del archivo de impresión (100 a 20000 px).`);
  }
  if (!Number.isInteger(d.impresionDpi) || d.impresionDpi < 72 || d.impresionDpi > 1200) {
    throw new ErrorCatalogo("Revisá la resolución del archivo de impresión (72 a 1200 dpi).");
  }
  const formatosImpresion = formatos(d.impresionFormatos, "para el archivo de impresión");
  const proveedor = await proveedorEfectivo(tx, { proveedorId: d.proveedorId });
  if (!proveedor) {
    throw new ErrorCatalogo(d.proveedorId ? "Ese proveedor no existe." : "No hay proveedor por defecto: cargá uno antes.");
  }
  if (!proveedor.activo) throw new ErrorCatalogo(`${proveedor.nombre} está desactivado.`);
  const noAcepta = formatosImpresion.filter((f) => !proveedor.formatos.includes(f));
  if (noAcepta.length) {
    throw new ErrorCatalogo(`${proveedor.nombre} no acepta ${noAcepta.join(", ").toUpperCase()}: elegí formatos que acepte.`);
  }
  return {
    nombre,
    descripcion: d.descripcion.trim(),
    opciones: d.opciones as unknown as Prisma.InputJsonValue,
    costoProduccion: d.costoProduccion,
    costoEnvio: d.costoEnvio,
    proveedorId: d.proveedorId,
    impresionAnchoPx: d.impresionAnchoPx,
    impresionAltoPx: d.impresionAltoPx,
    impresionDpi: d.impresionDpi,
    impresionFormatos: formatosImpresion,
  };
}

export const listarProductosBase = () =>
  prisma.tiendaProductoBase.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }], include: { proveedor: true } });

export type Foto = { nombre: string; datos: Buffer };

async function subirFoto(tx: TxTenant, foto: Foto) {
  return guardarArchivoPlataforma(tx, foto, {
    moduloId: MODULO,
    tipos: ["jpeg", "png", "webp"],
    maxBytes: 10 * 1024 * 1024,
    variantes: [{ nombre: "web", ancho: 1200 }],
  });
}

export async function crearProductoBase(comoStaff: ComoStaff, d: DatosProductoBase, foto?: Foto | null) {
  return comoStaff("tienda.producto_base_creado", async (tx, ctx) => {
    const datos = await validarProductoBase(tx, d);
    const f = foto ? await subirFoto(tx, foto) : null;
    const p = await tx.tiendaProductoBase.create({ data: { ...datos, fotoArchivoId: f?.id, fotoNombre: f?.nombre } });
    ctx.detalle({ id: p.id, nombre: p.nombre, costoProduccion: p.costoProduccion, costoEnvio: p.costoEnvio });
    return p;
  });
}

/**
 * Cambia un producto base. Lo ya vendido no cambia: cada renglón de pedido pagado tiene su
 * propia copia de costo, envío y proveedor.
 */
export async function actualizarProductoBase(
  comoStaff: ComoStaff,
  id: string,
  d: DatosProductoBase & { activo: boolean },
  foto?: Foto | null,
) {
  const liberar: (() => Promise<void>)[] = [];
  const r = await comoStaff("tienda.producto_base_actualizado", async (tx, ctx) => {
    const antes = await tx.tiendaProductoBase.findUnique({ where: { id } });
    if (!antes) throw new ErrorCatalogo("Ese producto base no existe.");
    const datos = await validarProductoBase(tx, d);
    let fotoNueva = {};
    if (foto) {
      const f = await subirFoto(tx, foto);
      if (antes.fotoArchivoId) liberar.push(await borrarArchivoPlataforma(tx, antes.fotoArchivoId));
      fotoNueva = { fotoArchivoId: f.id, fotoNombre: f.nombre };
    }
    const p = await tx.tiendaProductoBase.update({ where: { id }, data: { ...datos, ...fotoNueva, activo: d.activo } });
    ctx.detalle({
      id,
      antes: { costoProduccion: antes.costoProduccion, costoEnvio: antes.costoEnvio, activo: antes.activo, proveedorId: antes.proveedorId },
      despues: { costoProduccion: p.costoProduccion, costoEnvio: p.costoEnvio, activo: p.activo, proveedorId: p.proveedorId },
    });
    return p;
  });
  for (const l of liberar) await l();
  return r;
}

/** Borra un producto base que ninguna banda usó nunca. Si alguna lo usa, se desactiva en su lugar. */
export async function borrarProductoBase(comoStaff: ComoStaff, id: string) {
  const liberar: (() => Promise<void>)[] = [];
  try {
    await comoStaff("tienda.producto_base_borrado", async (tx, ctx) => {
      const p = await tx.tiendaProductoBase.findUnique({ where: { id } });
      if (!p) throw new ErrorCatalogo("Ese producto base no existe.");
      if (p.fotoArchivoId) liberar.push(await borrarArchivoPlataforma(tx, p.fotoArchivoId));
      // Los productos y pedidos de las bandas lo referencian (clave foránea, RESTRICT): la base
      // no deja borrarlo aunque el staff no vea esas filas (son de cada banda).
      await tx.tiendaProductoBase.delete({ where: { id } });
      ctx.detalle({ id, nombre: p.nombre });
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2003") {
      throw new ErrorCatalogo("Hay bandas que lo usan: no se puede borrar. Desactivalo (los productos que ya existen siguen andando).");
    }
    throw e;
  }
  for (const l of liberar) await l();
}

// ---------- Pedidos: la copia que vale para lo vendido ----------

/**
 * Al pagarse un pedido: cada renglón guarda su copia del costo de producción, el envío y el
 * proveedor vigentes en ese momento. Lo que ya tiene copia no se toca (un aviso repetido no
 * cambia nada). `tx`: la transacción de la banda que marca el pedido pagado.
 */
export async function fijarCostosDelPedido(tx: TxTenant, pedidoId: string) {
  const items = await tx.tiendaPedidoItem.findMany({
    where: { pedidoId, costoProduccion: null },
    include: { productoBase: true },
  });
  for (const item of items) {
    const proveedor = await proveedorEfectivo(tx, item.productoBase);
    if (!proveedor) throw new ErrorCatalogo(`No hay proveedor para ${item.productoBase.nombre}.`);
    await tx.tiendaPedidoItem.update({
      where: { id: item.id },
      data: { costoProduccion: item.productoBase.costoProduccion, costoEnvio: item.productoBase.costoEnvio, proveedorId: proveedor.id },
    });
  }
}
