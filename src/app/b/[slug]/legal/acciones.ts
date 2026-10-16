"use server";

import { revalidatePath } from "next/cache";
import { exigirTitular } from "@/nucleo/acceso/panel";
import { aceptarDocumentos, ErrorLegal, guardarDatosLegales } from "@/nucleo/legal";
import type { EstadoFormulario } from "@/ui";
import { texto } from "@/ui/servidor";

async function comoTitular(slug: string, fn: (c: { tenantId: string; usuarioId: string }) => Promise<string>): Promise<EstadoFormulario> {
  const acceso = await exigirTitular(`/b/${slug}/legal`);
  try {
    const ok = await fn({ tenantId: acceso.tenantId, usuarioId: acceso.usuarioId });
    revalidatePath(`/b/${slug}`, "layout");
    return { ok };
  } catch (e) {
    if (e instanceof ErrorLegal) return { error: e.message };
    throw e;
  }
}

export async function guardarLegalAccion(slug: string, _: EstadoFormulario, fd: FormData) {
  return comoTitular(slug, async (c) => {
    await guardarDatosLegales(c.tenantId, c.usuarioId, {
      responsable: texto(fd, "responsable", 200),
      domicilio: texto(fd, "domicilio", 300),
      emailDatos: texto(fd, "emailDatos", 200),
      extraPrivacidad: texto(fd, "extraPrivacidad", 4000),
      extraTerminos: texto(fd, "extraTerminos", 4000),
    });
    return "Guardado. La política y los términos de tu sitio ya muestran estos datos (con una versión nueva).";
  });
}

export async function aceptarAccion(slug: string, _: EstadoFormulario, fd: FormData) {
  return comoTitular(slug, async (c) => {
    if (fd.get("acepto") !== "on") throw new ErrorLegal("Para aceptar, marcá la casilla: leíste los términos y el contrato de encargo.");
    const n = await aceptarDocumentos(c.tenantId, c.usuarioId);
    return n ? "Aceptado. Queda registrado con la fecha y la versión." : "Ya estaban aceptados.";
  });
}
