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
      // Primero se retiran sus ofertas (eso despublica los productos que lo usan).
      const ofertas = await tx.tiendaOferta.count({ where: { proveedorId: id, activa: true } });
      if (ofertas) {
        throw new ErrorCatalogo(`Tiene ${ofertas} oferta(s) activa(s): retiralas antes de desactivarlo (los productos que lo usan se despublican y la banda elige otro proveedor).`);
      }
    }
    const faltan = await productosQueNoPuedeImprimir(tx, id, datos.formatos);
    if (faltan.length) {
      throw new ErrorCatalogo(`Sin esos formatos no puede imprimir: ${faltan.join(", ")}. Ajustá esos productos primero.`);
    }
    const p = await tx.tiendaProveedor.update({ where: { id }, data: { ...datos, activo: d.activo } });
    ctx.detalle({ id, cambios: { ...datos, activo: d.activo } });
    return p;
  });
}

/** Productos base que este proveedor ofrece y piden un formato que ya no aceptaría. */
async function productosQueNoPuedeImprimir(tx: TxTenant, proveedorId: string, acepta: string[]) {
  const atendidos = await tx.tiendaOferta.findMany({ where: { proveedorId }, select: { productoBase: { select: { nombre: true, impresionFormatos: true } } } });
  return atendidos.map((o) => o.productoBase).filter((p) => !p.impresionFormatos.every((f) => acepta.includes(f))).map((p) => p.nombre);
}

export async function marcarProveedorPorDefecto(comoStaff: ComoStaff, id: string) {
  return comoStaff("tienda.proveedor_por_defecto", async (tx, ctx) => {
    const p = await tx.tiendaProveedor.findUnique({ where: { id } });
    if (!p) throw new ErrorCatalogo("Ese proveedor no existe.");
    if (!p.activo) throw new ErrorCatalogo("Un proveedor desactivado no puede ser el de la plataforma.");
    if (p.porDefecto) return;
    await tx.tiendaProveedor.updateMany({ where: { porDefecto: true }, data: { porDefecto: false } });
    await tx.tiendaProveedor.update({ where: { id }, data: { porDefecto: true } });
    ctx.detalle({ id, nombre: p.nombre });
  });
}

// ---------- Productos base ----------

/**
 * Datos de un producto base. Proveedor y costos son la PRIMERA oferta (al crearlo; sin proveedor,
 * el de la plataforma). Después, las ofertas se manejan con `guardarOferta`; al editar el producto
 * base, si vienen, actualizan la oferta de ese proveedor.
 */
export type DatosProductoBase = {
  nombre: string;
  descripcion: string;
  opciones: Opcion[];
  costoProduccion?: number;
  costoEnvio?: number;
  proveedorId?: string | null;
  plazoDias?: number;
  impresionAnchoPx: number;
  impresionAltoPx: number;
  impresionDpi: number;
  impresionFormatos: string[];
};

type Proveedor = { id: string; nombre: string; email: string; formatos: string[]; activo: boolean; porDefecto: boolean };

export type DatosOferta = { costoProduccion: number; costoEnvio: number; plazoDias: number; activa: boolean };

function validarOferta(d: DatosOferta) {
  for (const [v, que] of [
    [d.costoProduccion, "el costo de producción"],
    [d.costoEnvio, "el costo de envío"],
  ] as const) {
    if (!Number.isInteger(v) || v < 0) throw new ErrorCatalogo(`Revisá ${que}: tiene que ser un monto en pesos.`);
  }
  if (!Number.isInteger(d.plazoDias) || d.plazoDias < 0 || d.plazoDias > 120) throw new ErrorCatalogo("Revisá el plazo: de 0 a 120 días.");
  return { costoProduccion: d.costoProduccion, costoEnvio: d.costoEnvio, plazoDias: d.plazoDias, activa: d.activa };
}

/** Que el proveedor exista, esté activo (para ofrecer algo nuevo) y acepte los formatos del producto base. */
async function proveedorQueImprime(tx: TxTenant, proveedorId: string | null | undefined, formatosImpresion: string[], activa: boolean): Promise<Proveedor> {
  const proveedor = proveedorId
    ? await tx.tiendaProveedor.findUnique({ where: { id: proveedorId } })
    : await tx.tiendaProveedor.findFirst({ where: { porDefecto: true } });
  if (!proveedor) throw new ErrorCatalogo(proveedorId ? "Ese proveedor no existe." : "No hay proveedor por defecto: cargá uno antes.");
  if (activa && !proveedor.activo) throw new ErrorCatalogo(`${proveedor.nombre} está desactivado.`);
  const noAcepta = formatosImpresion.filter((f) => !proveedor.formatos.includes(f));
  if (noAcepta.length) throw new ErrorCatalogo(`${proveedor.nombre} no acepta ${noAcepta.join(", ").toUpperCase()}: elegí formatos que acepte.`);
  return proveedor;
}

function validarProductoBase(d: DatosProductoBase) {
  const nombre = d.nombre.trim();
  if (!nombre) throw new ErrorCatalogo("Falta el nombre del producto.");
  for (const [v, que] of [
    [d.impresionAnchoPx, "el ancho"],
    [d.impresionAltoPx, "el alto"],
  ] as const) {
    if (!Number.isInteger(v) || v < 100 || v > 20000) throw new ErrorCatalogo(`Revisá ${que} del archivo de impresión (100 a 20000 px).`);
  }
  if (!Number.isInteger(d.impresionDpi) || d.impresionDpi < 72 || d.impresionDpi > 1200) {
    throw new ErrorCatalogo("Revisá la resolución del archivo de impresión (72 a 1200 dpi).");
  }
  return {
    nombre,
    descripcion: d.descripcion.trim(),
    opciones: d.opciones as unknown as Prisma.InputJsonValue,
    impresionAnchoPx: d.impresionAnchoPx,
    impresionAltoPx: d.impresionAltoPx,
    impresionDpi: d.impresionDpi,
    impresionFormatos: formatos(d.impresionFormatos, "para el archivo de impresión"),
  };
}

/** La oferta que trae `d` (proveedor y costos), si trae. */
function ofertaDeDatos(d: DatosProductoBase): DatosOferta | null {
  if (d.costoProduccion === undefined || d.costoEnvio === undefined) return null;
  return validarOferta({ costoProduccion: d.costoProduccion, costoEnvio: d.costoEnvio, plazoDias: d.plazoDias ?? 7, activa: true });
}

/** Lo que ofrecen los proveedores de un producto base (activas y de proveedores activos), para que la banda elija. */
export const ofertasDe = (productoBaseId: string) =>
  prisma.tiendaOferta.findMany({
    where: { productoBaseId, activa: true, proveedor: { activo: true } },
    include: { proveedor: { select: { id: true, nombre: true } } },
    orderBy: { proveedor: { nombre: "asc" } },
  });

/**
 * Despublica en todas las bandas los productos de ese producto base (con ese proveedor, o con
 * cualquiera si `proveedorId` es null) y los marca "sin oferta". Cruza bandas: solo en la
 * transacción del staff (la función de la base lo exige). Devuelve cuántos despublicó.
 */
async function retirarDeLasBandas(tx: TxTenant, productoBaseId: string, proveedorId: string | null): Promise<number> {
  const [{ n }] = await tx.$queryRaw<{ n: number }[]>`SELECT tienda_retirar_oferta(${productoBaseId}::uuid, ${proveedorId}::uuid) AS n`;
  return n;
}

/** Una oferta (activa o no): con la que se vende un producto que ya la eligió. */
export const ofertaDe = (tx: Pick<TxTenant, "tiendaOferta">, productoBaseId: string, proveedorId: string) =>
  tx.tiendaOferta.findUnique({ where: { productoBaseId_proveedorId: { productoBaseId, proveedorId } }, include: { proveedor: true } });

/**
 * El staff carga o cambia lo que un proveedor ofrece de un producto base. Cambiar un costo rige
 * para los pedidos que se paguen desde ahora; lo ya cobrado guarda su copia. Retirarla (`activa`
 * false, 3.2 proveedor d5): no se elige en productos nuevos y los productos que la usan se
 * DESPUBLICAN (vender algo que nadie va a producir es peor que perder la venta); lo ya pagado se
 * produce igual. La banda los ve marcados y reasigna a otro proveedor en un clic.
 */
export async function guardarOferta(comoStaff: ComoStaff, productoBaseId: string, proveedorId: string, d: DatosOferta) {
  const datos = validarOferta(d);
  return comoStaff("tienda.oferta_guardada", async (tx, ctx) => {
    const base = await tx.tiendaProductoBase.findUnique({ where: { id: productoBaseId } });
    if (!base) throw new ErrorCatalogo("Ese producto base no existe.");
    await proveedorQueImprime(tx, proveedorId, base.impresionFormatos, datos.activa);
    const antes = await ofertaDe(tx, productoBaseId, proveedorId);
    const o = await tx.tiendaOferta.upsert({
      where: { productoBaseId_proveedorId: { productoBaseId, proveedorId } },
      create: { productoBaseId, proveedorId, ...datos },
      update: datos,
    });
    const despublicados = datos.activa ? 0 : await retirarDeLasBandas(tx, productoBaseId, proveedorId);
    ctx.detalle({ productoBaseId, proveedorId, antes: antes && { costoProduccion: antes.costoProduccion, costoEnvio: antes.costoEnvio, plazoDias: antes.plazoDias, activa: antes.activa }, despues: datos, despublicados });
    return { ...o, despublicados };
  });
}

export const listarProductosBase = () =>
  prisma.tiendaProductoBase.findMany({
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
    include: { ofertas: { include: { proveedor: { select: { nombre: true, activo: true } } }, orderBy: { costoProduccion: "asc" } } },
  });

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
    const datos = validarProductoBase(d);
    const oferta = ofertaDeDatos(d);
    if (!oferta) throw new ErrorCatalogo("Falta la primera oferta: proveedor, costo de producción y de envío.");
    const proveedor = await proveedorQueImprime(tx, d.proveedorId, datos.impresionFormatos, true);
    const f = foto ? await subirFoto(tx, foto) : null;
    const p = await tx.tiendaProductoBase.create({ data: { ...datos, fotoArchivoId: f?.id, fotoNombre: f?.nombre } });
    await tx.tiendaOferta.create({ data: { productoBaseId: p.id, proveedorId: proveedor.id, ...oferta } });
    ctx.detalle({ id: p.id, nombre: p.nombre, proveedorId: proveedor.id, ...oferta });
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
    const datos = validarProductoBase(d);
    // Formatos nuevos: todos los que lo ofrecen los tienen que aceptar.
    for (const o of await tx.tiendaOferta.findMany({ where: { productoBaseId: id, activa: true } })) {
      await proveedorQueImprime(tx, o.proveedorId, datos.impresionFormatos, false);
    }
    const oferta = ofertaDeDatos(d);
    if (oferta) {
      const proveedor = await proveedorQueImprime(tx, d.proveedorId, datos.impresionFormatos, true);
      await tx.tiendaOferta.upsert({
        where: { productoBaseId_proveedorId: { productoBaseId: id, proveedorId: proveedor.id } },
        create: { productoBaseId: id, proveedorId: proveedor.id, ...oferta },
        update: { costoProduccion: oferta.costoProduccion, costoEnvio: oferta.costoEnvio, ...(d.plazoDias !== undefined ? { plazoDias: d.plazoDias } : {}) },
      });
    }
    let fotoNueva = {};
    if (foto) {
      const f = await subirFoto(tx, foto);
      if (antes.fotoArchivoId) liberar.push(await borrarArchivoPlataforma(tx, antes.fotoArchivoId));
      fotoNueva = { fotoArchivoId: f.id, fotoNombre: f.nombre };
    }
    const p = await tx.tiendaProductoBase.update({ where: { id }, data: { ...datos, ...fotoNueva, activo: d.activo } });
    // Discontinuado (3.2 proveedor d5): los productos que lo usan dejan de venderse.
    const despublicados = antes.activo && !d.activo ? await retirarDeLasBandas(tx, id, null) : 0;
    // Cambió lo que se pide (variantes, arte): los productos de las bandas se ajustan, y los que
    // ya no lo cumplen se despublican marcados para que la banda los arregle.
    const cambioLoPedido =
      JSON.stringify(antes.opciones) !== JSON.stringify(p.opciones) ||
      antes.impresionAnchoPx !== p.impresionAnchoPx ||
      antes.impresionAltoPx !== p.impresionAltoPx ||
      antes.impresionDpi !== p.impresionDpi ||
      antes.impresionFormatos.join() !== p.impresionFormatos.join();
    const aRevisar = cambioLoPedido
      ? (await tx.$queryRaw<{ n: number }[]>`SELECT tienda_base_cambiada(${id}::uuid) AS n`)[0].n
      : 0;
    ctx.detalle({ id, antes: { activo: antes.activo }, despues: { activo: p.activo }, despublicados, aRevisar, ...(oferta ? { oferta: { proveedorId: d.proveedorId ?? "por defecto", ...oferta } } : {}) });
    return { ...p, aRevisar };
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
 * Al pagarse un pedido: cada renglón guarda su copia del proveedor que eligió la banda para el
 * producto y del costo de producción y el envío de esa oferta en ese momento. Lo que ya tiene
 * copia no se toca (un aviso repetido no cambia nada). `tx`: la transacción de la banda que marca
 * el pedido pagado.
 */
export async function fijarCostosDelPedido(tx: TxTenant, pedidoId: string) {
  const items = await tx.tiendaPedidoItem.findMany({
    where: { pedidoId, costoProduccion: null },
    include: { productoBase: true, producto: { select: { proveedorId: true } } },
  });
  for (const item of items) {
    // El proveedor del pedido (lo guardó al crearse); los de antes de ese cambio, el del producto.
    const oferta = await ofertaDe(tx, item.productoBaseId, item.proveedorId ?? item.producto.proveedorId);
    if (!oferta) throw new ErrorCatalogo(`No hay oferta de ese proveedor para ${item.productoBase.nombre}.`);
    await tx.tiendaPedidoItem.update({
      where: { id: item.id },
      data: { costoProduccion: oferta.costoProduccion, costoEnvio: oferta.costoEnvio, proveedorId: oferta.proveedorId },
    });
  }
}
