"use server";

import { revalidatePath } from "next/cache";
import { exigirTitular } from "@/nucleo/acceso/panel";
import { ErrorDominio } from "@/nucleo/dominios";
import { configurarCorreo, probarCorreo, quitarCorreo, revisarCorreo } from "@/nucleo/dominios/correo";
import type { EstadoFormulario } from "@/ui";
import { texto } from "@/ui/servidor";

type Contexto = { tenantId: string; usuarioId: string };

/** Solo el titular. La banda sale del pedido (proxy), nunca de lo que manda el formulario. */
async function comoTitular(slug: string, fn: (c: Contexto) => Promise<EstadoFormulario>): Promise<EstadoFormulario> {
  const volver = `/b/${slug}/correo`;
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

export async function configurarAccion(slug: string, _: EstadoFormulario, fd: FormData) {
  return comoTitular(slug, async (c) => {
    const r = await configurarCorreo(c.usuarioId, c.tenantId, {
      dominioId: texto(fd, "dominio", 64),
      local: texto(fd, "local", 64),
      reenvioA: texto(fd, "reenvioA", 200) || undefined,
    });
    if (r.estado === "verificado") return { ok: `Listo: tus mails salen desde ${r.direccion}.` };
    return {
      ok: r.cargadosPorDeoco
        ? `Guardado. Lo revisamos solos: cuando se verifique, tus mails salen desde ${r.direccion}.`
        : `Guardado. Falta que se verifique ${r.direccion}: creá los registros de arriba en tu DNS.`,
    };
  });
}

export async function verificarAccion(slug: string, _: EstadoFormulario) {
  return comoTitular(slug, async (c) => {
    const r = await revisarCorreo(c.tenantId);
    if (r?.estado === "verificado") return { ok: `Verificada: tus mails salen desde ${r.direccion}.` };
    return { error: "Todavía no está verificada. Si recién creaste los registros, puede tardar unos minutos (a veces unas horas); lo revisamos solos." };
  });
}

export async function probarAccion(slug: string, _: EstadoFormulario) {
  return comoTitular(slug, async (c) => {
    const r = await probarCorreo(c.tenantId);
    return { ok: r.reenviaA ? `Mandamos un mail de prueba a ${r.para}: en unos minutos te tiene que llegar a ${r.reenviaA}.` : `Mandamos un mail de prueba a ${r.para}.` };
  });
}

export async function quitarAccion(slug: string, _: EstadoFormulario, fd: FormData) {
  return comoTitular(slug, async (c) => {
    if (fd.get("confirmar") !== "on") return { error: "Para dejar de usar tu dominio en el correo, confirmalo." };
    await quitarCorreo(c.usuarioId, c.tenantId);
    return { ok: "Listo: tus mails vuelven a salir desde Deoco." };
  });
}
