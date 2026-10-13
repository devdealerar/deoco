"use server";

import { revalidatePath } from "next/cache";
import { conStaff } from "@/nucleo/acceso/staff";
import { ErrorArchivo } from "@/nucleo/archivos";
import type { EstadoFormulario } from "@/ui";
import { archivo, ErrorFormulario, obligatorio, texto } from "@/ui/servidor";
import {
  actualizarProductoBase,
  actualizarProveedor,
  borrarProductoBase,
  crearProductoBase,
  crearProveedor,
  type DatosProductoBase,
  ErrorCatalogo,
  FORMATOS_IMPRESION,
  leerOpciones,
  listarProveedores,
  marcarProveedorPorDefecto,
} from "../catalogo";
import { leerPesos } from "../dinero";
import { darAccesoProveedor, ErrorProveedor, quitarAccesoProveedor } from "../proveedor";
import { origenPlataforma } from "@/nucleo/tenant/hosts";

/** Toda acción del back office de la tienda: staff (conStaff, si no 404) y errores como mensaje. */
async function accion(fn: () => Promise<string>): Promise<EstadoFormulario> {
  try {
    const ok = await fn();
    revalidatePath("/admin", "layout");
    return { ok };
  } catch (e) {
    if (e instanceof ErrorCatalogo || e instanceof ErrorFormulario || e instanceof ErrorArchivo) return { error: e.message };
    throw e;
  }
}

const formatosDe = (fd: FormData) => FORMATOS_IMPRESION.filter((f) => fd.get(`formato_${f}`) === "on");

function pesos(fd: FormData, campo: string, etiqueta: string) {
  const v = leerPesos(obligatorio(fd, campo, etiqueta, 20));
  if (v === null) throw new ErrorFormulario(`${etiqueta}: escribilo en pesos, p. ej. 12500 o 12.500,50.`);
  return v;
}

function entero(fd: FormData, campo: string, etiqueta: string) {
  const v = obligatorio(fd, campo, etiqueta, 6);
  if (!/^\d+$/.test(v)) throw new ErrorFormulario(`${etiqueta}: tiene que ser un número entero.`);
  return Number(v);
}

async function foto(fd: FormData) {
  const f = archivo(fd, "foto");
  return f ? { nombre: f.name, datos: Buffer.from(await f.arrayBuffer()) } : null;
}

function datosProductoBase(fd: FormData): DatosProductoBase {
  return {
    nombre: obligatorio(fd, "nombre", "el nombre", 80),
    descripcion: texto(fd, "descripcion", 1000),
    opciones: leerOpciones(texto(fd, "opciones", 1000)),
    costoProduccion: pesos(fd, "costoProduccion", "Costo de producción"),
    costoEnvio: pesos(fd, "costoEnvio", "Costo de envío"),
    proveedorId: texto(fd, "proveedorId", 40) || null,
    impresionAnchoPx: entero(fd, "impresionAnchoPx", "Ancho en píxeles"),
    impresionAltoPx: entero(fd, "impresionAltoPx", "Alto en píxeles"),
    impresionDpi: entero(fd, "impresionDpi", "Resolución (dpi)"),
    impresionFormatos: formatosDe(fd),
  };
}

export async function crearProductoBaseAccion(_: EstadoFormulario, fd: FormData) {
  return accion(async () => {
    const p = await crearProductoBase(conStaff, datosProductoBase(fd), await foto(fd));
    return `"${p.nombre}" agregado al catálogo.`;
  });
}

export async function actualizarProductoBaseAccion(id: string, _: EstadoFormulario, fd: FormData) {
  return accion(async () => {
    await actualizarProductoBase(conStaff, id, { ...datosProductoBase(fd), activo: fd.get("activo") === "on" }, await foto(fd));
    return "Guardado. Lo ya vendido conserva sus costos.";
  });
}

export async function borrarProductoBaseAccion(id: string, _: EstadoFormulario, fd: FormData) {
  return accion(async () => {
    if (fd.get("confirmar") !== "on") throw new ErrorFormulario("Para borrarlo, confirmalo.");
    await borrarProductoBase(conStaff, id);
    return "Borrado del catálogo.";
  });
}

export async function crearProveedorAccion(_: EstadoFormulario, fd: FormData) {
  return accion(async () => {
    const p = await crearProveedor(conStaff, {
      nombre: obligatorio(fd, "nombre", "el nombre", 80),
      email: obligatorio(fd, "email", "el mail de órdenes", 200),
      contacto: texto(fd, "contacto", 120),
      formatos: formatosDe(fd),
    });
    return p.porDefecto ? `${p.nombre} cargado (es el proveedor por defecto).` : `${p.nombre} cargado.`;
  });
}

export async function porDefectoAccion(id: string, _: EstadoFormulario) {
  return accion(async () => {
    await marcarProveedorPorDefecto(conStaff, id);
    return "Es el proveedor por defecto.";
  });
}

export async function activoProveedorAccion(id: string, activo: boolean, _: EstadoFormulario) {
  return accion(async () => {
    const p = (await listarProveedores()).find((x) => x.id === id);
    if (!p) throw new ErrorCatalogo("Ese proveedor no existe.");
    await actualizarProveedor(conStaff, id, { nombre: p.nombre, email: p.email, contacto: p.contacto, formatos: p.formatos, activo });
    return activo ? "Activado." : "Desactivado.";
  });
}

export async function darAccesoProveedorAccion(proveedorId: string, _: EstadoFormulario, fd: FormData) {
  try {
    const r = await darAccesoProveedor(conStaff, proveedorId, { email: obligatorio(fd, "email", "el email", 254), nombre: texto(fd, "nombre", 120) });
    revalidatePath("/admin", "layout");
    return {
      ok: r.claveTemporal
        ? `Listo. ${r.email} entra en ${origenPlataforma()}/portal/tienda con la clave temporal ${r.claveTemporal} (se muestra una sola vez; la cambia al entrar).`
        : `Listo. ${r.email} ya tenía usuario: entra con su clave en ${origenPlataforma()}/portal/tienda.`,
    };
  } catch (e) {
    if (e instanceof ErrorProveedor || e instanceof ErrorFormulario) return { error: e.message };
    throw e;
  }
}

export async function quitarAccesoProveedorAccion(cuentaId: string, _: EstadoFormulario) {
  try {
    await quitarAccesoProveedor(conStaff, cuentaId);
    revalidatePath("/admin", "layout");
    return { ok: "Acceso quitado." };
  } catch (e) {
    if (e instanceof ErrorProveedor) return { error: e.message };
    throw e;
  }
}
