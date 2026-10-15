import { ErrorDominio } from "@/nucleo/dominios";
import { reintentarCompra } from "@/nucleo/dominios/compra";
import { ErrorFormulario } from "@/ui/servidor";
import { auditar } from "./auditoria";
import { dbAdmin } from "./db";
import { POR_PAGINA, desde, literal, paginado } from "./listado";

/** Estados del filtro: "atencion" junta lo que el staff tiene que mirar. */
export type FiltroCompras = { estado?: "atencion" | "en-curso" | "datos" | "listo" | "fallido"; banda?: string; pagina: number };

/** Lo que necesita al staff: sin saldo, errores que no son pasajeros, muchos intentos, datos o una devolución pendiente. */
const ATENCION = {
  OR: [
    { estado: "en-curso", OR: [{ motivo: { in: ["sin-saldo", "desconocido"] } }, { intentos: { gte: 3 } }] },
    { estado: "datos" },
    { estado: "fallido", devolucion: "pendiente" },
  ],
};

/** Compras y renovaciones de dominios de todas las bandas, las más recientes primero. */
export async function listarCompras(f: FiltroCompras) {
  const db = dbAdmin();
  const where = {
    ...(f.estado === "atencion" ? ATENCION : f.estado ? { estado: f.estado } : {}),
    ...(f.banda && {
      tenant: {
        OR: [
          { nombre: { contains: literal(f.banda), mode: "insensitive" as const } },
          { slug: { contains: literal(f.banda), mode: "insensitive" as const } },
        ],
      },
    }),
  };
  const p = paginado(await db.dominioCompra.count({ where }), f.pagina);
  const filas = await db.dominioCompra.findMany({
    where,
    orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
    skip: desde(p.pagina),
    take: POR_PAGINA,
    include: { tenant: { select: { nombre: true, slug: true } } },
  });
  return { filas, ...p };
}

/** Cuántas compras necesitan al staff (para el título). */
export const cuantasAtencion = () => dbAdmin().dominioCompra.count({ where: ATENCION });

/** Dominios comprados que vencen en los próximos 30 días (la última compra o renovación de cada uno). */
export async function vencenPronto(ahora = new Date()) {
  const filas = await dbAdmin().dominioCompra.findMany({
    where: { estado: "listo", venceEn: { not: null } },
    orderBy: { terminadoEn: "desc" },
    include: { tenant: { select: { nombre: true, slug: true } } },
  });
  const ultima = new Map<string, (typeof filas)[number]>();
  for (const c of filas) if (!ultima.has(`${c.tenantId}|${c.dominio}`)) ultima.set(`${c.tenantId}|${c.dominio}`, c);
  const limite = ahora.getTime() + 30 * 86_400_000;
  return [...ultima.values()].filter((c) => c.venceEn!.getTime() <= limite).sort((x, y) => x.venceEn!.getTime() - y.venceEn!.getTime());
}

/** Reintenta ya una compra en curso (después de recargar saldo, por ejemplo). Queda en la auditoría. */
/** Compras fallidas cuya devolución todavía no se le pudo pedir al gestor (lleva más de 10 minutos). */
export async function devolucionesSinPedir(): Promise<number> {
  return dbAdmin().dominioCompra.count({ where: { devolucion: "pendiente", terminadoEn: { lt: new Date(Date.now() - 10 * 60_000) } } });
}

export async function reintentar(staffId: string, tenantId: string, compraId: string) {
  try {
    await reintentarCompra(tenantId, compraId);
  } catch (e) {
    if (e instanceof ErrorDominio) throw new ErrorFormulario(e.message);
    throw e;
  }
  await dbAdmin().$transaction((tx) => auditar(tx, { usuarioId: staffId, tenantId, accion: "dominio.compra_reintentada", detalle: { compraId } }));
}
