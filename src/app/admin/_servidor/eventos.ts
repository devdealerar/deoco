import { ErrorEvento, reprocesarEvento } from "@/nucleo/eventos/bus";
import { ErrorFormulario } from "@/ui/servidor";
import { auditar } from "./auditoria";
import { dbAdmin } from "./db";
import { POR_PAGINA, desde, literal, paginado } from "./listado";

export type Fallo = { intento: number; moduloId: string; error: string; fecha: string };

export type FiltroFallidos = {
  /** Contiene, en el nombre o el slug de la banda. */
  banda?: string;
  /** Nombre exacto del evento (p. ej. `pedido.pagado`). */
  nombre?: string;
  pagina: number;
};

/** Una página de eventos FALLIDOS de todas las bandas, los más recientes primero. Filtra y pagina en la base. */
export async function listarFallidos(f: FiltroFallidos) {
  const db = dbAdmin();
  const where = {
    estado: "FALLIDO" as const,
    ...(f.nombre && { nombre: f.nombre }),
    ...(f.banda && {
      tenant: {
        OR: [
          { nombre: { contains: literal(f.banda), mode: "insensitive" as const } },
          { slug: { contains: literal(f.banda), mode: "insensitive" as const } },
        ],
      },
    }),
  };
  const p = paginado(await db.evento.count({ where }), f.pagina);
  const eventos = await db.evento.findMany({
    where,
    orderBy: [{ fecha: "desc" }, { id: "desc" }],
    skip: desde(p.pagina),
    take: POR_PAGINA,
    include: { tenant: { select: { nombre: true, slug: true } } },
  });
  return {
    filas: eventos.map((e) => ({ ...e, ultimosFallos: (e.fallos as Fallo[]).filter((f) => f.intento === e.intentos) })),
    ...p,
  };
}

/** Nombres de evento con algún fallido, para el filtro. */
export async function nombresConFallidos(): Promise<string[]> {
  const filas = await dbAdmin().evento.groupBy({ by: ["nombre"], where: { estado: "FALLIDO" }, orderBy: { nombre: "asc" } });
  return filas.map((f) => f.nombre);
}

/** Vuelve a entregar un evento fallido (solo a quien falló). Queda en la auditoría. */
export async function reprocesar(staffId: string, tenantId: string, eventoId: string) {
  try {
    await reprocesarEvento(tenantId, eventoId, {
      registrar: (tx) => auditar(tx, { usuarioId: staffId, tenantId, accion: "evento.reprocesado", detalle: { eventoId } }),
    });
  } catch (e) {
    if (e instanceof ErrorEvento) throw new ErrorFormulario(e.message);
    throw e;
  }
  const evento = await dbAdmin().evento.findUnique({ where: { id: eventoId }, select: { estado: true } });
  return evento?.estado;
}
