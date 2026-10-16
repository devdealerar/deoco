"use server";

import { redirect } from "next/navigation";
import { accionesDelPanel } from "@/nucleo/acceso/acciones";
import { ErrorLimite } from "@/nucleo/cuenta";
import { exigirPermiso } from "@/nucleo/acceso/panel";
import { prisma } from "@/nucleo/db/cliente";
import type { EstadoFormulario } from "@/ui";
import { archivo, ErrorFormulario, obligatorio, texto } from "@/ui/servidor";
import type { Opcion } from "../catalogo";
import { ErrorContacto, guardarContacto } from "../contacto";
import tienda from "../index";
import { ErrorPasarela, pasarelaLista, probarConexion } from "@/nucleo/pagos";
import { formatearPesos, leerPesos } from "@/nucleo/dinero";
import {
  actualizarProducto,
  crearProducto,
  type DatosProducto,
  duplicarProducto,
  ErrorArchivo,
  ErrorImpresion,
  ErrorTienda,
  margen,
  productoDe,
  publicarProducto,
  subirDiseno,
} from "../productos";

/** Toda acción del panel de la tienda: `edicion` del contrato (tienda.producto.editar). */
const conEdicion = accionesDelPanel(() => tienda, [ErrorTienda, ErrorImpresion, ErrorArchivo, ErrorFormulario, ErrorContacto, ErrorLimite]);

async function subido(fd: FormData, campo: string) {
  const f = archivo(fd, campo);
  return f ? { nombre: f.name, datos: Buffer.from(await f.arrayBuffer()) } : null;
}

export async function subirDisenoAccion(slug: string, _: EstadoFormulario, fd: FormData) {
  return conEdicion(slug, async ({ tenantId }) => {
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
    proveedorId: texto(fd, "proveedorId", 40) || undefined,
  };
}

const avisoMargen = (precio: number, base: { costoProduccion: number }) => {
  const m = margen(precio, base);
  return m.negativo ? ` Atención: con este precio perdés ${formatearPesos(-m.margen)} por cada venta.` : "";
};

export async function crearProductoAccion(slug: string, productoBaseId: string, _: EstadoFormulario, fd: FormData) {
  let id = "";
  const r = await conEdicion(slug, async ({ tenantId }) => {
    const base = await prisma.tiendaProductoBase.findUnique({ where: { id: productoBaseId } });
    if (!base) throw new ErrorTienda("Ese producto base no existe.");
    const p = await crearProducto(tenantId, productoBaseId, datosProducto(fd, base.opciones as Opcion[]), await subido(fd, "foto"));
    id = p.id;
  });
  if (r.error) return r;
  redirect(`/b/${slug}/tienda/productos/${id}?creado=1`);
}

/** Duplicar: un producto nuevo en borrador con la misma configuración; lleva a editarlo. */
export async function duplicarProductoAccion(slug: string, id: string, _: EstadoFormulario) {
  let nuevo = "";
  const r = await conEdicion(slug, async ({ tenantId }) => {
    nuevo = (await duplicarProducto(tenantId, id)).id;
  });
  if (r.error) return r;
  redirect(`/b/${slug}/tienda/productos/${nuevo}?duplicado=1`);
}

export async function actualizarProductoAccion(slug: string, id: string, _: EstadoFormulario, fd: FormData) {
  return conEdicion(slug, async ({ tenantId }) => {
    const actual = await productoDe(tenantId, id);
    const datos = datosProducto(fd, actual.productoBase.opciones as Opcion[]);
    await actualizarProducto(tenantId, id, datos, await subido(fd, "foto"), fd.get("quitarFoto") === "on");
    return `Guardado.${avisoMargen(datos.precio, (await productoDe(tenantId, id)).oferta)}`;
  });
}

export async function publicarAccion(slug: string, id: string, publicado: boolean, _: EstadoFormulario) {
  return conEdicion(slug, async ({ tenantId }) => {
    await publicarProducto(tenantId, id, publicado);
    return publicado ? "Publicado: ya se ve en la tienda." : "Pasó a borrador: ya no se ve en la tienda.";
  });
}

/** Prueba las credenciales de la pasarela: a nombre de quién cobra. Solo el titular. */
export async function probarConexionAccion(slug: string, _: EstadoFormulario): Promise<EstadoFormulario> {
  const acceso = await exigirPermiso("tienda.pasarela.conectar", `/b/${slug}/tienda`);
  const { pasarela, lista } = await pasarelaLista(tienda, acceso.tenantId);
  if (!lista) return { error: "Primero cargá las credenciales de cobro en Credenciales." };
  try {
    const { cuenta } = await probarConexion(tienda, acceso.tenantId);
    return { ok: `Conectada: los pagos entran a la cuenta de ${pasarela.nombre} ${cuenta}.` };
  } catch (e) {
    if (e instanceof ErrorPasarela) return { error: `${pasarela.nombre} rechazó las credenciales. Revisá el access token en Credenciales.` };
    throw e;
  }
}

/** Contacto de la tienda: responder-a del mail al fan y contacto en la orden al proveedor. */
export async function contactoAccion(slug: string, _: EstadoFormulario, fd: FormData) {
  return conEdicion(slug, async ({ tenantId }) => {
    await guardarContacto(tenantId, { nombre: texto(fd, "nombre", 120), email: texto(fd, "email", 200), telefono: texto(fd, "telefono", 40) });
    return "Contacto guardado.";
  });
}
