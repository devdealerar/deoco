"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { exigirTitular } from "@/nucleo/acceso/panel";
import { ErrorDominio, normalizarDominio } from "@/nucleo/dominios";
import type { Contacto } from "@/nucleo/dominios/registrador";
import { condicionesDe, normalizarTelefono, pagarDominio } from "@/nucleo/dominios/venta";
import { ipDelVisitante } from "@/nucleo/publico/visitante";
import type { EstadoFormulario } from "@/ui";
import { ErrorFormulario, obligatorio, texto } from "@/ui/servidor";
import { borrarBorrador, guardarBorrador, leerBorrador } from "./borrador";

/** Solo el titular, con la banda en condiciones de comprar (no suspendida ni archivada). */
async function titular(slug: string) {
  const acceso = await exigirTitular(`/b/${slug}/dominios`);
  if (acceso.estado !== "ACTIVO" && acceso.estado !== "MOROSO") {
    throw new ErrorFormulario("Con el panel suspendido o archivado no se compran dominios nuevos (sí se renuevan y se llevan los que tenés).");
  }
  return acceso;
}

async function conErrores(fn: () => Promise<EstadoFormulario>): Promise<EstadoFormulario> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ErrorDominio || e instanceof ErrorFormulario) return { error: e.message };
    throw e;
  }
}

export async function buscarAccion(slug: string, _: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const q = texto(fd, "q", 80);
  if (!q) return { error: "Escribí el nombre que querés (p. ej. labanda)." };
  redirect(`/b/${slug}/dominios/comprar?q=${encodeURIComponent(q)}`);
}

/** Paso 1 (titular): valida y guarda el borrador; sigue al resumen. */
export async function titularAccion(slug: string, dominioCrudo: string, _: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  let destino = "";
  const r = await conErrores(async () => {
    await titular(slug);
    const dominio = normalizarDominio(dominioCrudo);
    const email = obligatorio(fd, "email", "el email", 200);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ErrorFormulario("El email no es válido.");
    const contacto: Contacto = {
      nombre: obligatorio(fd, "nombre", "el nombre", 60),
      apellido: obligatorio(fd, "apellido", "el apellido", 60),
      email,
      telefono: normalizarTelefono(obligatorio(fd, "telefono", "el teléfono", 30)),
      direccion: obligatorio(fd, "direccion", "la dirección", 120),
      ciudad: obligatorio(fd, "ciudad", "la ciudad", 60),
      provincia: obligatorio(fd, "provincia", "la provincia", 60),
      codigoPostal: obligatorio(fd, "codigoPostal", "el código postal", 12),
      pais: obligatorio(fd, "pais", "el país", 2).toUpperCase(),
    };
    if (!/^[A-Z]{2}$/.test(contacto.pais)) throw new ErrorFormulario("País: el código de dos letras (AR para Argentina).");
    await guardarBorrador(slug, { dominio, contacto, hacerPrincipal: fd.get("hacerPrincipal") === "on" });
    destino = `/b/${slug}/dominios/comprar/${encodeURIComponent(dominio)}/resumen`;
    return {};
  });
  if (destino) redirect(destino);
  return r;
}

/** Paso 2 (resumen): con las condiciones aceptadas, crea el cobro y manda a pagar. */
export async function pagarAccion(slug: string, dominioCrudo: string, _: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  let destino = "";
  const r = await conErrores(async () => {
    const acceso = await titular(slug);
    const dominio = normalizarDominio(dominioCrudo);
    const b = await leerBorrador(dominio);
    if (!b) throw new ErrorFormulario("Pasó mucho tiempo: volvé a cargar los datos del titular.");
    const claves = (await condicionesDe(dominio)).map((c) => c.clave).filter((c) => fd.get(`acepto_${c}`) === "on");
    const pago = await pagarDominio(acceso.tenantId, acceso.usuarioId, {
      dominio,
      anios: 1,
      contacto: b.contacto,
      aceptacion: { fecha: new Date(), ip: ipDelVisitante(await headers()) ?? "desconocida", claves },
      hacerPrincipal: b.hacerPrincipal,
    });
    await borrarBorrador(slug);
    destino = pago.redireccion;
    return {};
  });
  if (destino) redirect(destino);
  return r;
}
