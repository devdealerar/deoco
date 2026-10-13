"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { accesoPanel, puedeEnPedido } from "@/nucleo/acceso/panel";
import { prisma } from "@/nucleo/db/cliente";
import type { EstadoFormulario } from "@/ui";
import { archivo, ErrorFormulario, obligatorio, texto } from "@/ui/servidor";
import type { Opcion } from "../catalogo";
import { leerPesos, formatearPesos } from "../dinero";
import {
  actualizarProducto,
  crearProducto,
  type DatosProducto,
  ErrorArchivo,
  ErrorImpresion,
  ErrorTienda,
  margen,
  productoDe,
  publicarProducto,
  subirDiseno,
} from "../productos";

const EDITAR = "tienda.producto.editar";

/**
 * Toda acción del panel de la tienda: exige `tienda.producto.editar` (además de lo que muestre
 * la pantalla) y traduce los errores esperables a mensajes.
 */
async function conEdicion(slug: string, fn: (tenantId: string) => Promise<string | void>): Promise<EstadoFormulario> {
  const volver = `/b/${slug}/tienda`;
  const acceso = await accesoPanel(volver);
  if (!(await puedeEnPedido(EDITAR, volver))) return { error: "Tu rol no puede editar la tienda." };
  try {
    const ok = await fn(acceso.tenantId);
    revalidatePath(volver, "layout");
    return { ok: ok ?? "Guardado." };
  } catch (e) {
    if (e instanceof ErrorTienda || e instanceof ErrorImpresion || e instanceof ErrorArchivo || e instanceof ErrorFormulario) {
      return { error: e.message };
    }
    throw e;
  }
}

async function subido(fd: FormData, campo: string) {
  const f = archivo(fd, campo);
  return f ? { nombre: f.name, datos: Buffer.from(await f.arrayBuffer()) } : null;
}

export async function subirDisenoAccion(slug: string, _: EstadoFormulario, fd: FormData) {
  return conEdicion(slug, async (tenantId) => {
    const a = await subido(fd, "archivo");
    if (!a) throw new ErrorFormulario("Elegí el archivo de impresión (PNG de alta o PDF).");
    const d = await subirDiseno(tenantId, texto(fd, "nombre", 80), a, texto(fd, "paraBaseId", 40) || null);
    return `"${d.nombre}" subido.`;
  });
}

/** Lo que eligió la banda: casillas var_<opción>_<valor> (por índice) contra las opciones del base. */
function variantesElegidas(fd: FormData, delBase: Opcion[]): Opcion[] {
  return delBase.map((o, i) => ({ nombre: o.nombre, valores: o.valores.filter((_, j) => fd.get(`var_${i}_${j}`) === "on") }));
}

function datosProducto(fd: FormData, delBase: Opcion[]): DatosProducto {
  const precio = leerPesos(obligatorio(fd, "precio", "el precio", 20));
  if (precio === null) throw new ErrorFormulario("Precio: escribilo en pesos, p. ej. 25000 o 25.000,50.");
  return {
    disenoId: texto(fd, "disenoId", 40),
    nombre: obligatorio(fd, "nombre", "el nombre", 80),
    descripcion: texto(fd, "descripcion", 1000),
    precio,
    variantes: variantesElegidas(fd, delBase),
  };
}

const avisoMargen = (precio: number, base: { costoProduccion: number; costoEnvio: number }) => {
  const m = margen(precio, base);
  return m.negativo ? ` Atención: con este precio perdés ${formatearPesos(-m.margen)} por cada venta.` : "";
};

export async function crearProductoAccion(slug: string, productoBaseId: string, _: EstadoFormulario, fd: FormData) {
  let id = "";
  const r = await conEdicion(slug, async (tenantId) => {
    const base = await prisma.tiendaProductoBase.findUnique({ where: { id: productoBaseId } });
    if (!base) throw new ErrorTienda("Ese producto base no existe.");
    const p = await crearProducto(tenantId, productoBaseId, datosProducto(fd, base.opciones as Opcion[]), await subido(fd, "foto"));
    id = p.id;
  });
  if (r.error) return r;
  redirect(`/b/${slug}/tienda/productos/${id}?creado=1`);
}

export async function actualizarProductoAccion(slug: string, id: string, _: EstadoFormulario, fd: FormData) {
  return conEdicion(slug, async (tenantId) => {
    const actual = await productoDe(tenantId, id);
    const datos = datosProducto(fd, actual.productoBase.opciones as Opcion[]);
    await actualizarProducto(tenantId, id, datos, await subido(fd, "foto"), fd.get("quitarFoto") === "on");
    return `Guardado.${avisoMargen(datos.precio, actual.productoBase)}`;
  });
}

export async function publicarAccion(slug: string, id: string, publicado: boolean, _: EstadoFormulario) {
  return conEdicion(slug, async (tenantId) => {
    await publicarProducto(tenantId, id, publicado);
    return publicado ? "Publicado: ya se ve en la tienda." : "Pasó a borrador: ya no se ve en la tienda.";
  });
}
