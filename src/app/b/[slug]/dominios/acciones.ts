"use server";

import { revalidatePath } from "next/cache";
import { exigirTitular } from "@/nucleo/acceso/panel";
import { agregarDominio, ErrorDominio, marcarPrincipal, pasarADelegado, quitarDominio, verificarDominio } from "@/nucleo/dominios";
import type { EstadoFormulario } from "@/ui";
import { texto } from "@/ui/servidor";
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
    if (e instanceof ErrorDominio) return { error: e.message };
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

export async function quitarAccion(slug: string, dominioId: string, _: EstadoFormulario, fd: FormData) {
  return comoTitular(slug, async (c) => {
    await quitarDominio(c.usuarioId, c.tenantId, dominioId, fd.get("confirmar") === "on");
    return { ok: "Dominio quitado." };
  });
}
