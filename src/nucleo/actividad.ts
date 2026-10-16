// La actividad de una banda (tabla `auditoria`, bajo RLS): lo que se hizo en su panel, lo que
// hizo Deoco sola (el gestor, el barrido) y los accesos del staff. Solo se agrega: nadie la
// cambia ni la borra (migración *_auditoria_inmutable). La lee el titular en /b/<slug>/actividad.
import { conTenant } from "@/nucleo/db/con-tenant";

export const POR_PAGINA_ACTIVIDAD = 50;

export type FilaActividad = { id: string; fecha: Date; quien: string; accion: string; detalle: unknown };

/** Una página de la actividad de la banda, la más nueva primero. `accion`: filtra por prefijo ("banda."). */
export async function actividadDeBanda(tenantId: string, opciones: { pagina?: number; accion?: string } = {}) {
  const pagina = Math.max(1, opciones.pagina ?? 1);
  const accion = opciones.accion?.trim().slice(0, 60) || undefined;
  return conTenant(tenantId, async (tx) => {
    const where = { tenantId, ...(accion ? { accion: { startsWith: accion } } : {}) };
    const [total, filas] = await Promise.all([
      tx.auditoria.count({ where }),
      tx.auditoria.findMany({ where, orderBy: { fecha: "desc" }, skip: (pagina - 1) * POR_PAGINA_ACTIVIDAD, take: POR_PAGINA_ACTIVIDAD }),
    ]);
    const ids = [...new Set(filas.map((f) => f.usuarioId).filter((x): x is string => !!x))];
    const autores = ids.length ? await tx.$queryRaw<{ id: string; nombre: string }[]>`SELECT id, nombre FROM autores_de_actividad(${ids}::uuid[])` : [];
    const nombre = new Map(autores.map((a) => [a.id, a.nombre]));
    const vista: FilaActividad[] = filas.map((f) => ({
      id: f.id,
      fecha: f.fecha,
      quien: f.usuarioId ? (nombre.get(f.usuarioId) ?? "Alguien que ya no está en la banda") : "Deoco (automático)",
      accion: f.accion,
      detalle: f.detalle,
    }));
    return { filas: vista, total, pagina, paginas: Math.max(1, Math.ceil(total / POR_PAGINA_ACTIVIDAD)) };
  });
}
