// Título y vista previa de las páginas públicas. El sitio público es la cara de la banda:
// sin nada declarado, el título es el nombre de la banda, nunca "Deoco".
import type { MetadatosPagina } from "./contrato";
import { bandaBasica, modulosPrendidos } from "./encendido";
import { registro as registroGlobal } from "./index";
import type { Registro } from "./registro";

export type MetadatosResueltos = {
  /** Lo que va en <title>: "Press kit · Los Satélites", o solo la banda. */
  titulo: string;
  /** Nombre de la banda (og:site_name). */
  banda: string;
  descripcion?: string;
  imagen?: string;
};

const limpio = (t?: string) => t?.replace(/\s+/g, " ").trim() || undefined;

/** Si un módulo falla al armar sus metadatos, la página igual sale con el nombre de la banda. */
async function seguro(moduloId: string, fn: () => MetadatosPagina | Promise<MetadatosPagina>): Promise<MetadatosPagina> {
  try {
    return (await fn()) ?? {};
  } catch (e) {
    console.error(`[deoco] metadatos del módulo ${moduloId}: ${e instanceof Error ? e.message : e}`);
    return {};
  }
}

/** Nombre de la banda: una lectura por pedido (metadatos y marco). */
export const nombreDeBanda = async (tenantId: string) => ({ nombre: (await bandaBasica(tenantId)).nombre ?? undefined });

export async function resolverMetadatos(
  tenantId: string,
  path: string,
  consulta: URLSearchParams,
  reg: Registro = registroGlobal(),
): Promise<MetadatosResueltos> {
  const [prendidos, tenant] = [
    await modulosPrendidos(tenantId, reg),
    await nombreDeBanda(tenantId),
  ];
  const delSitio =
    reg.metadatosPublicos && prendidos.has(reg.metadatosPublicos.moduloId)
      ? await seguro(reg.metadatosPublicos.moduloId, () => reg.metadatosPublicos!.fn(tenantId))
      : {};
  const encontrada = reg.rutaPublica(path);
  const visible = encontrada && prendidos.has(encontrada.moduloId) ? encontrada : undefined;
  const pagina = visible?.ruta.metadatos
    ? await seguro(visible.moduloId, () => visible.ruta.metadatos!({ tenantId, params: visible.params, consulta }))
    : {};

  const banda = limpio(delSitio.titulo) ?? limpio(tenant?.nombre) ?? "";
  const propio = limpio(pagina.titulo);
  return {
    titulo: propio && propio !== banda ? `${propio} · ${banda}` : banda,
    banda,
    descripcion: limpio(pagina.descripcion) ?? limpio(delSitio.descripcion),
    imagen: limpio(pagina.imagen) ?? limpio(delSitio.imagen),
  };
}
