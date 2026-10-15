// Lecturas del back office comercial (solo staff: leerComoStaff, 404 para cualquier otro).
// Los listados se resuelven en la base: 50 por página, filtro y orden en la URL.
import { Prisma } from "@/generated/prisma/client";
import { leerComoStaff } from "@/nucleo/acceso/staff";

export const POR_PAGINA = 50;
export type ParametrosUrl = Record<string, string | string[] | undefined>;

export function texto(p: URLSearchParams, clave: string): string {
  return (p.get(clave) ?? "").trim().slice(0, 100);
}
export function pagina(p: URLSearchParams): number {
  const n = Number(texto(p, "pagina"));
  return Number.isSafeInteger(n) && n >= 1 ? n : 1;
}
const contiene = (t: string) => `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const paginado = (total: number, pedida: number) => {
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  return { pagina: Math.min(pedida, paginas), paginas, total };
};

/** Situación del pago de una cuenta, para filtrar y mostrar. */
export const SITUACIONES = ["prueba", "al-dia", "vencida", "mora", "sin-cuenta"] as const;
export type Situacion = (typeof SITUACIONES)[number];

const CONDICION: Record<Situacion, Prisma.Sql> = {
  prueba: Prisma.sql`c."pruebaHasta" IS NOT NULL AND c."pagoHasta" IS NULL AND c."moraDesde" IS NULL`,
  "al-dia": Prisma.sql`c."moraDesde" IS NULL AND c."pagoHasta" > now()`,
  vencida: Prisma.sql`c."moraDesde" IS NULL AND COALESCE(c."pagoHasta", c."pruebaHasta") <= now()`,
  mora: Prisma.sql`c."moraDesde" IS NOT NULL`,
  "sin-cuenta": Prisma.sql`c."tenantId" IS NULL`,
};

export const ORDENES_CUENTA = ["nombre", "vence", "alta"] as const;
const COLUMNA: Record<(typeof ORDENES_CUENTA)[number], Prisma.Sql> = {
  nombre: Prisma.sql`t.nombre`,
  vence: Prisma.sql`COALESCE(c."pagoHasta", c."pruebaHasta")`,
  alta: Prisma.sql`t."creadoEn"`,
};

export type FilaCuenta = {
  id: string;
  nombre: string;
  slug: string;
  estado: "ACTIVO" | "MOROSO" | "SUSPENDIDO" | "ARCHIVADO";
  planId: string | null;
  pro: boolean;
  pruebaHasta: Date | null;
  pagoHasta: Date | null;
  moraDesde: Date | null;
  suscripcionEstado: string | null;
  medioDePago: string | null;
  proximoCobro: Date | null;
  montoSuscripcion: number | null;
};

export async function listarCuentas(f: {
  buscar?: string;
  situacion?: Situacion;
  plan?: string;
  orden: { columna: (typeof ORDENES_CUENTA)[number]; direccion: "asc" | "desc" };
  pagina: number;
}) {
  const cond = [Prisma.sql`TRUE`];
  if (f.buscar) cond.push(Prisma.sql`(t.nombre ILIKE ${contiene(f.buscar)} OR t.slug ILIKE ${contiene(f.buscar)})`);
  if (f.situacion) cond.push(CONDICION[f.situacion]);
  if (f.plan) cond.push(Prisma.sql`c."planId" = ${f.plan}`);
  const donde = Prisma.join(cond, " AND ");
  const dir = f.orden.direccion === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  return leerComoStaff(async (tx) => {
    const [{ total }] = await tx.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total FROM tenant t LEFT JOIN comercial_cuenta c ON c."tenantId" = t.id WHERE ${donde}`;
    const p = paginado(total, f.pagina);
    const filas = await tx.$queryRaw<FilaCuenta[]>`
      SELECT t.id, t.nombre, t.slug, t.estado::text AS estado, c."planId", (c.pro IS NOT NULL) AS pro,
             c."pruebaHasta", c."pagoHasta", c."moraDesde", c."suscripcionEstado", c."medioDePago",
             c."proximoCobro", c."montoSuscripcion"
      FROM tenant t LEFT JOIN comercial_cuenta c ON c."tenantId" = t.id
      WHERE ${donde}
      ORDER BY ${COLUMNA[f.orden.columna]} ${dir} NULLS LAST, t.id
      LIMIT ${POR_PAGINA} OFFSET ${(p.pagina - 1) * POR_PAGINA}`;
    return { filas, ...p };
  });
}

export async function cuentaParaStaff(tenantId: string) {
  return leerComoStaff(async (tx) => {
    const banda = await tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true, nombre: true, slug: true, estado: true } });
    if (!banda) return null;
    const cuenta = await tx.comercialCuenta.findUnique({ where: { tenantId } });
    const cobros = await tx.comercialCobro.findMany({ where: { tenantId }, orderBy: { fecha: "desc" }, take: 24 });
    return { banda, cuenta, cobros };
  });
}

/** Cobros de cuota rechazados (de todas las bandas), los más nuevos primero. */
export async function cobrosFallidos(paginaPedida: number) {
  return leerComoStaff(async (tx) => {
    const total = await tx.comercialCobro.count({ where: { estado: "rechazado" } });
    const p = paginado(total, paginaPedida);
    const cobros = await tx.comercialCobro.findMany({
      where: { estado: "rechazado" },
      orderBy: [{ fecha: "desc" }, { id: "asc" }],
      skip: (p.pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    });
    const bandas = new Map(
      (await tx.tenant.findMany({ where: { id: { in: [...new Set(cobros.map((c) => c.tenantId))] } }, select: { id: true, nombre: true, slug: true, estado: true } })).map((b) => [b.id, b]),
    );
    return { filas: cobros.map((c) => ({ ...c, banda: bandas.get(c.tenantId) ?? null })), ...p };
  });
}

// ── Dominios (aparte de la cuota) ─────────────────────────────────────────────────────────────

/** Qué pagos de dominios mostrar: los que el staff tiene que mirar, los devueltos o todos. */
export const FILTROS_PAGOS_DOMINIO = ["atencion", "devoluciones", "todos"] as const;
export type FiltroPagosDominio = (typeof FILTROS_PAGOS_DOMINIO)[number];

const DONDE_PAGOS: Record<FiltroPagosDominio, Prisma.ComercialDominioPagoWhereInput> = {
  atencion: { OR: [{ devolucion: { in: ["pendiente", "en-proceso", "fallida"] } }, { entrega: "pendiente" }] },
  devoluciones: { devolucion: { not: null } },
  todos: {},
};

/** Pagos de dominios de todas las bandas, los más nuevos primero (nunca mezclados con la cuota). */
export async function pagosDeDominios(filtro: FiltroPagosDominio, paginaPedida: number) {
  return leerComoStaff(async (tx) => {
    const where = DONDE_PAGOS[filtro];
    const total = await tx.comercialDominioPago.count({ where });
    const p = paginado(total, paginaPedida);
    const pagos = await tx.comercialDominioPago.findMany({
      where,
      include: { cobro: { select: { dominio: true, tipo: true, anios: true, monto: true } } },
      orderBy: [{ creadoEn: "desc" }, { id: "asc" }],
      skip: (p.pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    });
    const bandas = new Map(
      (await tx.tenant.findMany({ where: { id: { in: [...new Set(pagos.map((c) => c.tenantId))] } }, select: { id: true, nombre: true, slug: true } })).map((b) => [b.id, b]),
    );
    return { filas: pagos.map((c) => ({ ...c, banda: bandas.get(c.tenantId) ?? null })), ...p };
  });
}

/** Cobros de dominios creados que nadie pagó todavía (link de pago vigente). */
export async function cobrosDominioEsperando() {
  return leerComoStaff((tx) => tx.comercialDominioCobro.count({ where: { estado: "esperando" } }));
}
