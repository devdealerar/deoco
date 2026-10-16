"use server";

import { redirect } from "next/navigation";
import { accionesDelPanel } from "@/nucleo/acceso/acciones";
import { ErrorLimite } from "@/nucleo/cuenta";
import { accesoPanel, puedeEnPedido } from "@/nucleo/acceso/panel";
import ticketera from "../index";
import type { EstadoFormulario } from "@/ui";
import { archivo, ErrorFormulario, obligatorio, texto } from "@/ui/servidor";
import { leerPesos } from "@/nucleo/dinero";
import { leerFechaHora } from "@/nucleo/fechas";
import {
  actualizarEvento,
  actualizarTipo,
  borrarEvento,
  borrarTipo,
  cambiarFoto,
  crearEvento,
  crearTipo,
  type DatosEvento,
  type DatosFrenos,
  type DatosTipo,
  ErrorTicketera,
  guardarFrenos,
  publicarEvento,
} from "../eventos";
import { abiertoEnPuerta, type ResultadoValidacion, type ResumenPuerta, resumenPuerta, validarEntrada } from "../puerta";

const VALIDAR = "ticketera.puerta.validar";

/** Toda acción de shows: `edicion` del contrato (ticketera.eventos.editar). */
const conEdicion = accionesDelPanel(() => ticketera, [ErrorTicketera, ErrorFormulario, ErrorLimite]);

function datosEvento(fd: FormData): DatosEvento {
  const fecha = leerFechaHora(texto(fd, "fecha", 20));
  if (!fecha) throw new ErrorFormulario("Falta la fecha y hora del show.");
  return {
    nombre: obligatorio(fd, "nombre", "el nombre del show", 120),
    fecha,
    lugar: obligatorio(fd, "lugar", "el lugar", 120),
    ciudad: obligatorio(fd, "ciudad", "la ciudad", 80),
    direccion: texto(fd, "direccion", 200),
    descripcion: texto(fd, "descripcion", 2000),
  };
}

function fechaOpcional(fd: FormData, campo: string, etiqueta: string) {
  const v = texto(fd, campo, 20);
  if (!v) return null;
  const d = leerFechaHora(v);
  if (!d) throw new ErrorFormulario(`${etiqueta}: fecha y hora inválidas.`);
  return d;
}

function datosTipo(fd: FormData): DatosTipo {
  const precio = leerPesos(obligatorio(fd, "precio", "el precio", 20));
  if (precio === null) throw new ErrorFormulario("Precio: escribilo en pesos, p. ej. 15000 o 15.000.");
  const cupo = obligatorio(fd, "cupo", "el cupo", 7);
  if (!/^\d+$/.test(cupo)) throw new ErrorFormulario("El cupo tiene que ser un número entero.");
  return {
    nombre: obligatorio(fd, "nombre", "el nombre del tipo", 60),
    precio,
    cupo: Number(cupo),
    ventaDesde: fechaOpcional(fd, "ventaDesde", "Venta desde"),
    ventaHasta: fechaOpcional(fd, "ventaHasta", "Venta hasta"),
  };
}

export async function crearEventoAccion(slug: string, _: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  let id = "";
  const r = await conEdicion(slug, async ({ tenantId }) => {
    id = await crearEvento(tenantId, datosEvento(fd));
  });
  if (r.error) return r;
  redirect(`/b/${slug}/entradas/${id}`);
}

export async function actualizarEventoAccion(slug: string, id: string, _: EstadoFormulario, fd: FormData) {
  return conEdicion(slug, async ({ tenantId }) => {
    await actualizarEvento(tenantId, id, datosEvento(fd));
    const f = archivo(fd, "foto");
    if (f) await cambiarFoto(tenantId, id, { nombre: f.name, datos: Buffer.from(await f.arrayBuffer()) });
    return "Show guardado.";
  });
}

/** Frenos de compra del show: un campo vacío vuelve al número de la plataforma. */
export async function guardarFrenosAccion(slug: string, id: string, _: EstadoFormulario, fd: FormData) {
  return conEdicion(slug, async ({ tenantId }) => {
    const n = (k: keyof DatosFrenos) => {
      const v = String(fd.get(k) ?? "").trim();
      if (!v) return null;
      const x = Number(v);
      if (!Number.isInteger(x)) throw new ErrorTicketera("Los frenos son números enteros (o vacío).");
      return x;
    };
    await guardarFrenos(tenantId, id, { reservaMinutos: n("reservaMinutos"), maxPorCompra: n("maxPorCompra"), maxPorPersona: n("maxPorPersona"), reservasPorEmail: n("reservasPorEmail"), reservasPorIp: n("reservasPorIp") });
    return "Frenos guardados: valen para las compras que empiecen desde ahora.";
  });
}

export async function publicarAccion(slug: string, id: string, publicado: boolean, _: EstadoFormulario) {
  return conEdicion(slug, async ({ tenantId }) => {
    await publicarEvento(tenantId, id, publicado);
    return publicado ? "Publicado: ya se ve en Fechas." : "Pasó a borrador.";
  });
}

export async function borrarEventoAccion(slug: string, id: string, _: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  if (fd.get("confirmar") !== "on") return { error: "Para borrar el show, confirmalo." };
  const r = await conEdicion(slug, ({ tenantId }) => borrarEvento(tenantId, id));
  if (r.error) return r;
  redirect(`/b/${slug}/entradas`);
}

export async function crearTipoAccion(slug: string, eventoId: string, _: EstadoFormulario, fd: FormData) {
  return conEdicion(slug, async ({ tenantId }) => {
    await crearTipo(tenantId, eventoId, datosTipo(fd));
    return "Tipo de entrada agregado.";
  });
}

export async function actualizarTipoAccion(slug: string, tipoId: string, _: EstadoFormulario, fd: FormData) {
  return conEdicion(slug, async ({ tenantId }) => {
    await actualizarTipo(tenantId, tipoId, datosTipo(fd));
    return "Guardado.";
  });
}

export async function borrarTipoAccion(slug: string, tipoId: string, _: EstadoFormulario) {
  return conEdicion(slug, async ({ tenantId }) => {
    await borrarTipo(tenantId, tipoId);
    return "Tipo borrado.";
  });
}

// ---------- Puerta ----------

async function conPuerta(slug: string, eventoId: string) {
  const volver = `/b/${slug}/puerta/${eventoId}`;
  const acceso = await accesoPanel(volver);
  if (!(await puedeEnPedido(VALIDAR, volver))) throw new Error("Tu rol no valida entradas.");
  const cerrada = acceso.estado === "SUSPENDIDO" || acceso.estado === "ARCHIVADO";
  if (!(await abiertoEnPuerta(acceso.tenantId, eventoId, cerrada))) throw new Error("Ese show no se atiende en la puerta (pasó o no está publicado).");
  return acceso;
}

/** Lo llama el teléfono de la puerta; `intento` se repite en los reintentos por mala señal. */
export async function validarAccion(slug: string, eventoId: string, codigo: string, intento: string): Promise<ResultadoValidacion> {
  const acceso = await conPuerta(slug, eventoId);
  return validarEntrada(acceso.tenantId, eventoId, codigo, acceso.usuarioId, intento);
}

export async function resumenAccion(slug: string, eventoId: string): Promise<ResumenPuerta> {
  const acceso = await conPuerta(slug, eventoId);
  return resumenPuerta(acceso.tenantId, eventoId);
}
