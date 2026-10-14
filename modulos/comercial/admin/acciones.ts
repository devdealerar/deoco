"use server";

import { revalidatePath } from "next/cache";
import { conStaff } from "@/nucleo/acceso/staff";
import { catalogoDeCuenta, ErrorCuenta } from "@/nucleo/cuenta";
import { leerPesos } from "@/nucleo/dinero";
import { ErrorPasarela } from "@/nucleo/pagos";
import type { EstadoFormulario } from "@/ui";
import { ErrorFormulario, obligatorio, texto } from "@/ui/servidor";
import { asignarPlan, type DatosPlan, ErrorComercial, guardarPlan, guardarPlazos, type ProAMedida } from "../cuenta";

const GB = BigInt(1024 ** 3);

/** Toda acción del back office comercial: staff (conStaff, si no 404) y errores como mensaje. */
async function accion(fn: () => Promise<string>): Promise<EstadoFormulario> {
  try {
    const ok = await fn();
    revalidatePath("/admin", "layout");
    return { ok };
  } catch (e) {
    if (e instanceof ErrorComercial || e instanceof ErrorFormulario || e instanceof ErrorCuenta) return { error: e.message };
    if (e instanceof ErrorPasarela) return { error: `Mercado Pago: ${e.message}` };
    throw e;
  }
}

function pesosOpcional(fd: FormData, campo: string, etiqueta: string): number | null {
  const t = texto(fd, campo, 20);
  if (!t) return null;
  const v = leerPesos(t);
  if (v === null || v <= 0) throw new ErrorFormulario(`${etiqueta}: escribilo en pesos, p. ej. 12500 o 12.500,50.`);
  return v;
}

function entero(fd: FormData, campo: string, etiqueta: string): number {
  const t = obligatorio(fd, campo, etiqueta, 6);
  if (!/^\d+$/.test(t)) throw new ErrorFormulario(`${etiqueta}: un número entero.`);
  return Number(t);
}

function gigas(fd: FormData, campo: string): bigint | null {
  const t = texto(fd, campo, 10).replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > 10_000) throw new ErrorFormulario("Espacio: en GB, mayor que cero (p. ej. 5 o 0,5).");
  return (BigInt(Math.round(n * 1000)) * GB) / BigInt(1000);
}

/** Módulos marcados (`<prefijo>modulo_<id>`) y topes (`<prefijo>tope_<limite>`, vacío: sin tope). */
function modulosYTopes(fd: FormData, prefijo = "") {
  const reg = catalogoDeCuenta();
  const modulos = reg.modulos.map((m) => m.id).filter((id) => fd.get(`${prefijo}modulo_${id}`) === "on");
  const topes: Record<string, number> = {};
  for (const l of reg.limites) {
    const t = texto(fd, `${prefijo}tope_${l.id}`, 6);
    if (!t) continue;
    if (!/^\d+$/.test(t)) throw new ErrorFormulario(`${l.etiqueta}: un número entero (vacío: sin tope).`);
    topes[l.id] = Number(t);
  }
  return { modulos, topes };
}

export async function guardarPlanAccion(planId: string, _: EstadoFormulario, fd: FormData) {
  return accion(async () => {
    const datos: DatosPlan = {
      nombre: obligatorio(fd, "nombre", "el nombre", 40),
      descripcion: texto(fd, "descripcion", 200),
      precioUsd: texto(fd, "precioUsd", 30),
      precio: pesosOpcional(fd, "precio", "Precio"),
      almacenamiento: gigas(fd, "almacenamiento"),
      aLaVenta: fd.get("aLaVenta") === "on",
      ...modulosYTopes(fd),
    };
    const n = await guardarPlan(conStaff, planId, datos);
    return `Plan guardado.${n ? ` Se aplicó a ${n} banda${n === 1 ? "" : "s"}.` : ""}`;
  });
}

export async function guardarPlazosAccion(_: EstadoFormulario, fd: FormData) {
  return accion(async () => {
    await guardarPlazos(conStaff, {
      diasPrueba: entero(fd, "diasPrueba", "Días de prueba"),
      planPrueba: obligatorio(fd, "planPrueba", "el plan de la prueba", 40),
      diasGracia: entero(fd, "diasGracia", "Días de gracia"),
      diasMoraASuspender: entero(fd, "diasMoraASuspender", "Días de mora"),
    });
    return "Plazos guardados.";
  });
}

export async function asignarPlanAccion(tenantId: string, _: EstadoFormulario, fd: FormData) {
  return accion(async () => {
    const planId = obligatorio(fd, "plan", "el plan", 40);
    let pro: ProAMedida | null = null;
    if (fd.get("aMedida") === "on") {
      const almacenamiento = gigas(fd, "pro_almacenamiento");
      pro = { precio: pesosOpcional(fd, "pro_precio", "Precio"), almacenamiento: almacenamiento?.toString() ?? null, ...modulosYTopes(fd, "pro_") };
    }
    await asignarPlan(conStaff, tenantId, planId, pro);
    return "Plan aplicado.";
  });
}
