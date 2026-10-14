import { dbAdmin } from "./db";
import { type Direccion, POR_PAGINA, desde, literal, paginado } from "./listado";

export const ORDENES_USUARIO = ["alta", "nombre"] as const;
export type FiltroUsuarios = {
  /** Contiene, en el nombre o el email. */
  buscar?: string;
  soloStaff?: boolean;
  orden: { columna: (typeof ORDENES_USUARIO)[number]; direccion: Direccion };
  pagina: number;
};

/** Una página de usuarios con sus membresías (banda y rol). Filtra, ordena y pagina en la base. */
export async function listarUsuarios(f: FiltroUsuarios) {
  const db = dbAdmin();
  const where = {
    ...(f.soloStaff && { esStaff: true }),
    ...(f.buscar && {
      OR: [
        { nombre: { contains: literal(f.buscar), mode: "insensitive" as const } },
        { email: { contains: literal(f.buscar), mode: "insensitive" as const } },
      ],
    }),
  };
  const p = paginado(await db.usuario.count({ where }), f.pagina);
  const d = f.orden.direccion;
  const filas = await db.usuario.findMany({
    where,
    orderBy: [f.orden.columna === "nombre" ? { nombre: d } : { creadoEn: d }, { id: d }],
    skip: desde(p.pagina),
    take: POR_PAGINA,
    select: {
      id: true,
      email: true,
      nombre: true,
      esStaff: true,
      claveTemporal: true,
      creadoEn: true,
      membresias: { select: { rol: true, tenant: { select: { nombre: true, slug: true, estado: true } } } },
    },
  });
  return { filas, ...p };
}
