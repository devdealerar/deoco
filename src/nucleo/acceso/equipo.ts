// El equipo de la banda, desde su panel (3.2 núcleo d6). El titular saca gente, cambia roles y
// pasa la titularidad; cualquiera puede dejar la banda. Lo que no se hace desde acá:
// - tocar a otra persona TITULAR (sacarla, bajarle el rol): Deoco no arbitra disputas entre
//   integrantes; esa persona conserva el control hasta que lo deje ella;
// - sumar gente: lo hace el staff (`/admin`), hasta que haya invitaciones por mail.
// Que la banda nunca quede sin titular lo impone la base (`deoco_banda_con_titular`). Lo que cambia
// vale en el siguiente pedido: el rol se resuelve en cada uno (`resolver.ts`).
import { conTenant, type TxTenant } from "@/nucleo/db/con-tenant";
import { registro } from "@/nucleo/modulos";

export class ErrorEquipo extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorEquipo";
  }
}

export type Miembro = { id: string; usuarioId: string; nombre: string; email: string; rol: string };

export const miembrosDeBanda = (tenantId: string) =>
  conTenant(tenantId, (tx) => tx.$queryRaw<Miembro[]>`SELECT id, "usuarioId", nombre, email, rol FROM miembros_de_banda()`);

const SIN_TITULAR = "La banda no puede quedar sin titular: pasale la titularidad a otra persona antes.";

/** Corre el cambio y lo deja en la auditoría; la base rechaza si la banda queda sin titular. */
async function enEquipo<T>(tenantId: string, fn: (tx: TxTenant) => Promise<T>): Promise<T> {
  try {
    return await conTenant(tenantId, fn);
  } catch (e) {
    if (e instanceof Error && e.message.includes("deoco:banda-sin-titular")) throw new ErrorEquipo(SIN_TITULAR);
    throw e;
  }
}

async function miembro(tx: TxTenant, membresiaId: string) {
  const m = await tx.membresia.findUnique({ where: { id: membresiaId } });
  if (!m) throw new ErrorEquipo("Esa persona ya no es parte de la banda.");
  return m;
}

const auditar = (tx: TxTenant, tenantId: string, usuarioId: string, accion: string, detalle: object) =>
  tx.auditoria.createMany({ data: [{ usuarioId, tenantId, accion, detalle }] });

/** El titular le cambia el rol a alguien (no a otra persona TITULAR). Dar TITULAR comparte el control. */
export async function cambiarRolEnEquipo(titularId: string, tenantId: string, membresiaId: string, rol: string) {
  if (!registro().rol(rol)) throw new ErrorEquipo("Elegí un rol.");
  await enEquipo(tenantId, async (tx) => {
    const m = await miembro(tx, membresiaId);
    if (m.rol === rol) return;
    if (m.rol === "TITULAR" && m.usuarioId !== titularId) {
      throw new ErrorEquipo("A otra persona titular no se le cambia el rol desde acá: tiene el mismo control que vos. Si quiere, lo deja ella.");
    }
    await tx.membresia.update({ where: { id: m.id }, data: { rol } });
    await auditar(tx, tenantId, titularId, "membresia.rol_cambiado", { usuarioId: m.usuarioId, de: m.rol, a: rol, desde: "panel" });
  });
}

/** El titular saca a alguien de la banda: pierde el acceso en su próximo pedido. */
export async function quitarDelEquipo(titularId: string, tenantId: string, membresiaId: string) {
  await enEquipo(tenantId, async (tx) => {
    const m = await miembro(tx, membresiaId);
    if (m.usuarioId === titularId) throw new ErrorEquipo("Para irte vos, usá «Dejar esta banda».");
    if (m.rol === "TITULAR") throw new ErrorEquipo("A otra persona titular no se la saca desde acá: tiene el mismo control que vos. Si quiere, deja la banda ella.");
    await tx.membresia.delete({ where: { id: m.id } });
    await auditar(tx, tenantId, titularId, "membresia.quitada", { usuarioId: m.usuarioId, rol: m.rol, desde: "panel" });
  });
}

/** El titular pasa la titularidad a otra persona de la banda y queda como EDITOR. */
export async function pasarTitularidad(titularId: string, tenantId: string, membresiaId: string) {
  await enEquipo(tenantId, async (tx) => {
    const m = await miembro(tx, membresiaId);
    if (m.usuarioId === titularId) throw new ErrorEquipo("Elegí a otra persona.");
    const propia = await tx.membresia.findUnique({ where: { usuarioId_tenantId: { usuarioId: titularId, tenantId } } });
    if (propia?.rol !== "TITULAR") throw new ErrorEquipo("Solo una persona titular puede pasar la titularidad.");
    await tx.membresia.update({ where: { id: m.id }, data: { rol: "TITULAR" } });
    await tx.membresia.update({ where: { id: propia.id }, data: { rol: "EDITOR" } });
    await auditar(tx, tenantId, titularId, "membresia.titularidad_pasada", { a: m.usuarioId, de: m.rol, desde: "panel" });
  });
}

/** Cualquiera deja la banda. La última persona titular, no: antes pasa la titularidad. */
export async function dejarLaBanda(usuarioId: string, tenantId: string) {
  await enEquipo(tenantId, async (tx) => {
    const m = await tx.membresia.findUnique({ where: { usuarioId_tenantId: { usuarioId, tenantId } } });
    if (!m) throw new ErrorEquipo("No sos parte de esta banda.");
    await tx.membresia.delete({ where: { id: m.id } });
    await auditar(tx, tenantId, usuarioId, "membresia.dejada", { rol: m.rol });
  });
}
