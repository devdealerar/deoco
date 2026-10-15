"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirTitular } from "@/nucleo/acceso/panel";
import { agregarDominio, dominiosDeBanda, ErrorDominio, marcarPrincipal, pasarADelegado, quitarDominio, verificarDominio } from "@/nucleo/dominios";
import { cambiarTitularRegistral } from "@/nucleo/dominios/compra";
import type { Contacto } from "@/nucleo/dominios/registrador";
import { llevarseElDns, quedarseEnDeoco } from "@/nucleo/dominios/salida";
import { pedirCodigoDeTransferencia } from "@/nucleo/dominios/transferencia";
import { fijarVencimiento } from "@/nucleo/dominios/vencimiento";
import { normalizarTelefono, pagarRenovacion } from "@/nucleo/dominios/venta";
import type { EstadoFormulario } from "@/ui";
import { ErrorFormulario, obligatorio, texto } from "@/ui/servidor";
import { mensajeVerificacion } from "../../../_dominios/mensajes";

type Contexto = { tenantId: string; usuarioId: string };

/** Solo el titular. La banda sale del pedido (proxy), nunca de lo que manda el formulario. */
async function comoTitular(slug: string, fn: (c: Contexto) => Promise<EstadoFormulario>): Promise<EstadoFormulario> {
  const volver = `/b/${slug}/dominios`;
  const acceso = await exigirTitular(volver);
  try {
    const r = await fn({ tenantId: acceso.tenantId, usuarioId: acceso.usuarioId });
    revalidatePath(volver);
    return r;
  } catch (e) {
    if (e instanceof ErrorDominio || e instanceof ErrorFormulario) return { error: e.message };
    throw e;
  }
}

export async function agregarAccion(slug: string, _: EstadoFormulario, fd: FormData) {
  return comoTitular(slug, async (c) => {
    const via = fd.get("via") === "zona" ? "zona" : "cname";
    await agregarDominio(c.usuarioId, c.tenantId, texto(fd, "dominio", 253), via);
    return { ok: via === "zona" ? "Listo. Ahora cambiá los nameservers donde está registrado (los pasos están en su tarjeta)." : "Dominio agregado. Ahora creá los registros DNS y verificalo." };
  });
}

export async function verificarAccion(slug: string, dominioId: string, _: EstadoFormulario) {
  return comoTitular(slug, async (c) => mensajeVerificacion(await verificarDominio(c.usuarioId, c.tenantId, dominioId)));
}

export async function principalAccion(slug: string, dominioId: string, _: EstadoFormulario) {
  return comoTitular(slug, async (c) => {
    await marcarPrincipal(c.usuarioId, c.tenantId, dominioId);
    return { ok: "Listo: es el dominio principal. Los demás redirigen a él." };
  });
}

export async function delegarAccion(slug: string, dominioId: string, _: EstadoFormulario) {
  return comoTitular(slug, async (c) => {
    await pasarADelegado(c.usuarioId, c.tenantId, dominioId);
    return { ok: "Listo. Ahora cambiá los nameservers donde está registrado (los pasos están en la tarjeta)." };
  });
}

export async function llevarseAccion(slug: string, dominioId: string, _: EstadoFormulario, fd: FormData) {
  return comoTitular(slug, async (c) => {
    await llevarseElDns(c.usuarioId, c.tenantId, dominioId, { seguirConSitio: fd.get("seguirConSitio") === "on" });
    return { ok: "Listo: los pasos están en la tarjeta." };
  });
}

export async function quedarseAccion(slug: string, dominioId: string, _: EstadoFormulario) {
  return comoTitular(slug, async (c) => {
    await quedarseEnDeoco(c.usuarioId, c.tenantId, dominioId);
    return { ok: "Listo: el dominio sigue delegado en Deoco." };
  });
}

export async function quitarAccion(slug: string, dominioId: string, _: EstadoFormulario, fd: FormData) {
  return comoTitular(slug, async (c) => {
    await quitarDominio(c.usuarioId, c.tenantId, dominioId, fd.get("confirmar") === "on");
    return { ok: "Dominio quitado." };
  });
}

/** Renovar un comprado: va a pagar (cuenta de Deoco). Con la banda en cualquier estado. */
export async function renovarAccion(slug: string, dominioId: string, _: EstadoFormulario) {
  let destino = "";
  const r = await comoTitular(slug, async (c) => {
    const d = (await dominiosDeBanda(c.tenantId)).find((x) => x.id === dominioId);
    if (!d) throw new ErrorDominio("Ese dominio no existe en la banda.");
    destino = (await pagarRenovacion(c.tenantId, c.usuarioId, d.dominio)).redireccion;
    return {};
  });
  if (destino) redirect(destino);
  return r;
}

/** El código para llevárselo a otro registrador: se muestra acá (no va por mail ni se guarda). */
export async function pedirCodigoAccion(slug: string, dominioId: string, _: EstadoFormulario) {
  return comoTitular(slug, async (c) => {
    const { dominio, codigo } = await pedirCodigoDeTransferencia(c.usuarioId, c.tenantId, dominioId);
    return { ok: `Código de transferencia de ${dominio}: ${codigo} — cargalo en tu registrador nuevo. Ya está desbloqueado.` };
  });
}

export async function cambiarTitularAccion(slug: string, dominioId: string, _: EstadoFormulario, fd: FormData) {
  return comoTitular(slug, async (c) => {
    const d = (await dominiosDeBanda(c.tenantId)).find((x) => x.id === dominioId);
    if (!d) throw new ErrorDominio("Ese dominio no existe en la banda.");
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
    await cambiarTitularRegistral(c.usuarioId, c.tenantId, d.dominio, contacto);
    return { ok: "Pedido: lo ves en Tus compras de dominios. Te avisamos por mail cuando esté." };
  });
}

export async function fijarVenceAccion(slug: string, dominioId: string, _: EstadoFormulario, fd: FormData) {
  return comoTitular(slug, async (c) => {
    const t = texto(fd, "venceEn", 10);
    const fecha = t ? new Date(`${t}T12:00:00-03:00`) : null;
    if (fecha && Number.isNaN(fecha.getTime())) throw new ErrorFormulario("Fecha inválida.");
    await fijarVencimiento(c.usuarioId, c.tenantId, dominioId, fecha);
    return { ok: fecha ? "Listo: te avisamos antes de que venza." : "Listo: no te avisamos." };
  });
}
