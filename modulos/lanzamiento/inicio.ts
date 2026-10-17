// Bloque del inicio del panel (consulta "lanzamiento.inicio"): el próximo lanzamiento y los hitos
// atrasados (3.2 lanzamiento d1: "un hito vence sin cumplirse → aparece en el inicio del panel").
import { conTenant } from "@/nucleo/db/con-tenant";
import { atrasados } from "./campanias";

const DIA = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires" });

export async function inicioLanzamiento(tenantId: string) {
  const [proxima, vencidos] = await Promise.all([
    conTenant(tenantId, (tx) => tx.lanzamientoCampania.findFirst({ where: { estado: "ACTIVA" }, orderBy: { fecha: "asc" } })),
    atrasados(tenantId),
  ]);
  if (!proxima && !vencidos.length) return null;
  // Uno por campaña con el más viejo y cuántos hay: el inicio no corta en silencio.
  const porCampania = new Map<string, { titulo: string; id: string; n: number; primero: string }>();
  for (const h of vencidos) {
    const x = porCampania.get(h.campania.id);
    if (x) x.n++;
    else porCampania.set(h.campania.id, { titulo: h.campania.titulo, id: h.campania.id, n: 1, primero: h.titulo });
  }
  return {
    titulo: "Lanzamientos",
    datos: proxima ? [{ etiqueta: "Próximo", valor: `${proxima.titulo} · ${DIA.format(proxima.fecha)}` }] : [],
    pendientes: [...porCampania.values()].map((c) => ({
      texto: c.n === 1 ? `${c.titulo}: atrasado «${c.primero}».` : `${c.titulo}: ${c.n} hitos atrasados (el primero, «${c.primero}»).`,
      href: `/lanzamientos/${c.id}`,
    })),
  };
}

/**
 * Consulta "lanzamiento.proximos" (para el manager, D7): las campañas en curso, con su fecha y
 * cuántos hitos atrasados tienen. [{ titulo, fecha: ISO, atrasados }]
 */
export async function proximosLanzamientos(tenantId: string) {
  const [lista, vencidos] = await Promise.all([
    conTenant(tenantId, (tx) => tx.lanzamientoCampania.findMany({ where: { estado: "ACTIVA" }, orderBy: { fecha: "asc" }, take: 20 })),
    atrasados(tenantId),
  ]);
  return lista.map((c) => ({ titulo: c.titulo, fecha: c.fecha.toISOString(), atrasados: vencidos.filter((h) => h.campaniaId === c.id).length }));
}
