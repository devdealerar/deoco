"use server";

import { revalidatePath } from "next/cache";
import { dominioRaiz } from "@/nucleo/tenant/hosts";
import type { EstadoFormulario } from "@/ui";
import { email, ErrorFormulario, obligatorio, texto } from "@/ui/servidor";
import { exigirStaff } from "../../_servidor/acceso";
import { altaBanda } from "../../_servidor/bandas";

export async function crearBanda(_: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const { usuarioId } = await exigirStaff();
  try {
    const titularEmail = email(fd, "titularEmail");
    if (!titularEmail) throw new ErrorFormulario("Falta el email del titular.");
    const r = await altaBanda(usuarioId, {
      nombre: obligatorio(fd, "nombre", "el nombre de la banda", 80),
      slug: obligatorio(fd, "slug", "el slug", 40),
      subdominio: texto(fd, "subdominio", 40),
      titularEmail,
      titularNombre: texto(fd, "titularNombre", 120),
    });
    revalidatePath("/admin");
    const panel = `https://app.${dominioRaiz()}/b/${r.slug}`;
    return {
      ok: r.claveTemporal
        ? `Banda creada (${r.dominio}). El titular ${r.titular} entra en ${panel} con la clave temporal ${r.claveTemporal} (se muestra una sola vez).`
        : `Banda creada (${r.dominio}). El titular ${r.titular} ya tenía usuario: entra en ${panel} con su clave.`,
    };
  } catch (e) {
    if (e instanceof ErrorFormulario) return { error: e.message };
    throw e;
  }
}
