// Bloque del inicio del panel (consulta "sitio.inicio"): si el sitio está publicado y al día.
import { conTenant } from "@/nucleo/db/con-tenant";
import { ZONA } from "@/nucleo/fechas";
import { hayCambios, leerBorrador, leerPublicado } from "./contenido";

export async function inicioSitio(tenantId: string) {
  const [borrador, publicado] = await Promise.all([conTenant(tenantId, (tx) => leerBorrador(tx, tenantId)), leerPublicado(tenantId)]);
  const pendientes = [];
  if (!publicado) pendientes.push({ texto: "Tu sitio todavía no está publicado: armalo y publicalo.", href: "/sitio" });
  else if (hayCambios(borrador, publicado.contenido)) pendientes.push({ texto: "Hay cambios en el sitio sin publicar.", href: "/sitio" });
  return {
    titulo: "Sitio",
    datos: [{ etiqueta: "Publicado", valor: publicado ? publicado.publicadoEn.toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: ZONA }) : "Todavía no" }],
    pendientes,
  };
}
