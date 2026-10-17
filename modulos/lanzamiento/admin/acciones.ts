"use server";

import { revalidatePath } from "next/cache";
import { conStaff } from "@/nucleo/acceso/staff";
import type { EstadoFormulario } from "@/ui";
import { ErrorFormulario, obligatorio, texto } from "@/ui/servidor";
import { ErrorLanzamiento, guardarFormato, guardarTarea } from "../campanias";

async function accion(fn: () => Promise<string>): Promise<EstadoFormulario> {
  try {
    const ok = await fn();
    revalidatePath("/admin", "layout");
    return { ok };
  } catch (e) {
    if (e instanceof ErrorLanzamiento || e instanceof ErrorFormulario) return { error: e.message };
    throw e;
  }
}

function entero(fd: FormData, campo: string, etiqueta: string): number {
  const t = obligatorio(fd, campo, etiqueta, 7);
  if (!/^-?\d+$/.test(t)) throw new ErrorFormulario(`${etiqueta}: un número entero.`);
  return Number(t);
}

export async function guardarTareaAccion(clave: string | null, _: EstadoFormulario, fd: FormData) {
  return accion(async () => {
    const k = clave ?? obligatorio(fd, "clave", "la clave", 40);
    const d = {
      titulo: obligatorio(fd, "titulo", "el título", 120),
      descripcion: texto(fd, "descripcion", 500),
      dias: entero(fd, "dias", "Días"),
      dependeDe: texto(fd, "dependeDe", 500).split(",").map((x) => x.trim()).filter(Boolean),
      orden: entero(fd, "orden", "Orden"),
      activa: fd.get("activa") === "on",
    };
    await conStaff("lanzamiento.tarea_guardada", async (tx, ctx) => {
      const r = await guardarTarea(tx, k, d);
      ctx.detalle({ clave: k, dias: r.dias, activa: r.activa });
    });
    return "Guardada: rige para las campañas nuevas.";
  });
}

export async function guardarFormatoAccion(id: string | null, _: EstadoFormulario, fd: FormData) {
  return accion(async () => {
    const k = id ?? obligatorio(fd, "id", "el id", 40);
    const d = {
      plataforma: obligatorio(fd, "plataforma", "la plataforma", 60),
      pieza: obligatorio(fd, "pieza", "la pieza", 80),
      ancho: entero(fd, "ancho", "Ancho"),
      alto: entero(fd, "alto", "Alto"),
      notas: texto(fd, "notas", 300),
      orden: entero(fd, "orden", "Orden"),
      activo: fd.get("activo") === "on",
    };
    await conStaff("lanzamiento.formato_guardado", async (tx, ctx) => {
      const r = await guardarFormato(tx, k, d);
      ctx.detalle({ id: k, ancho: r.ancho, alto: r.alto, activo: r.activo });
    });
    return "Guardada: rige para las campañas nuevas.";
  });
}
