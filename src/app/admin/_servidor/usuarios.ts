import { dbAdmin } from "./db";

/** Todos los usuarios con sus membresías (banda y rol). */
export async function listarUsuarios() {
  return dbAdmin().usuario.findMany({
    orderBy: { email: "asc" },
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
}
