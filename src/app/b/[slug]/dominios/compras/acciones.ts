"use server";

import { revalidatePath } from "next/cache";
import { exigirTitular } from "@/nucleo/acceso/panel";
import { ErrorDominio } from "@/nucleo/dominios";
import { corregirDatosCompra } from "@/nucleo/dominios/compra";
import type { Contacto } from "@/nucleo/dominios/registrador";
import { normalizarTelefono } from "@/nucleo/dominios/venta";
import type { EstadoFormulario } from "@/ui";
import { ErrorFormulario, obligatorio } from "@/ui/servidor";

/** El registrador rechazó un dato del titular: la banda lo corrige y la compra sigue sola. */
export async function corregirAccion(slug: string, compraId: string, _: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const acceso = await exigirTitular(`/b/${slug}/dominios/compras`);
  try {
    const contacto: Contacto = {
      nombre: obligatorio(fd, "nombre", "el nombre", 60),
      apellido: obligatorio(fd, "apellido", "el apellido", 60),
      email: obligatorio(fd, "email", "el email", 200),
      telefono: normalizarTelefono(obligatorio(fd, "telefono", "el teléfono", 30)),
      direccion: obligatorio(fd, "direccion", "la dirección", 120),
      ciudad: obligatorio(fd, "ciudad", "la ciudad", 60),
      provincia: obligatorio(fd, "provincia", "la provincia", 60),
      codigoPostal: obligatorio(fd, "codigoPostal", "el código postal", 12),
      pais: obligatorio(fd, "pais", "el país", 2).toUpperCase(),
    };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contacto.email)) throw new ErrorFormulario("El email no es válido.");
    if (!/^[A-Z]{2}$/.test(contacto.pais)) throw new ErrorFormulario("País: el código de dos letras (AR para Argentina).");
    await corregirDatosCompra(acceso.tenantId, compraId, contacto);
    revalidatePath(`/b/${slug}/dominios/compras`);
    return { ok: "Listo: seguimos con el registro." };
  } catch (e) {
    if (e instanceof ErrorDominio || e instanceof ErrorFormulario) return { error: e.message };
    throw e;
  }
}
