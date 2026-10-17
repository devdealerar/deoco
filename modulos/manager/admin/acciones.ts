"use server";

import { revalidatePath } from "next/cache";
import { conStaff } from "@/nucleo/acceso/staff";
import type { EstadoFormulario } from "@/ui";
import { ErrorFormulario, obligatorio, texto } from "@/ui/servidor";
import { crearSello, darAcceso, ErrorManager, quitarAcceso } from "../sellos";

async function accion(fn: () => Promise<string>): Promise<EstadoFormulario> {
  try {
    const ok = await fn();
    revalidatePath("/admin", "layout");
    return { ok };
  } catch (e) {
    if (e instanceof ErrorManager || e instanceof ErrorFormulario) return { error: e.message };
    throw e;
  }
}

export async function crearSelloAccion(_: EstadoFormulario, fd: FormData) {
  return accion(async () => {
    await crearSello(conStaff, obligatorio(fd, "nombre", "el nombre", 120));
    return "Sello creado.";
  });
}

export async function darAccesoAccion(selloId: string, _: EstadoFormulario, fd: FormData) {
  return accion(async () => {
    const r = await darAcceso(conStaff, selloId, { email: obligatorio(fd, "email", "el email", 200), nombre: texto(fd, "nombre", 120) });
    return r.claveTemporal ? `Acceso dado. Usuario nuevo: ${r.email}, clave temporal ${r.claveTemporal} (se muestra una sola vez).` : `Acceso dado a ${r.email}.`;
  });
}

export async function quitarAccesoAccion(cuentaId: string, _: EstadoFormulario) {
  return accion(async () => {
    await quitarAcceso(conStaff, cuentaId);
    return "Acceso quitado.";
  });
}
