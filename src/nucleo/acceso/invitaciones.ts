// Invitaciones a la banda (D7): el titular suma gente sin el staff (un manager, alguien del equipo).
// Invita por email con un rol (nunca TITULAR: la titularidad se pasa); la persona entra con su
// cuenta de ese mismo email y acepta desde el selector de bandas. Vence a los 14 días; el titular
// la cancela mientras está pendiente. Quien tiene el acceso lo pierde cuando el titular lo saca
// del equipo (`quitarDelEquipo`): al instante, sin borrar nada de lo que hizo.
import { prisma } from "@/nucleo/db/cliente";
import { conTenant } from "@/nucleo/db/con-tenant";
import { enviarCorreoDelNucleo, escaparHtml as h } from "@/nucleo/correo";
import { esEmail } from "@/nucleo/correo/direccion";
import { registro } from "@/nucleo/modulos";
import { origenPlataforma } from "@/nucleo/tenant/hosts";
import { usuarioPropio } from "./usuario";
import { ErrorEquipo } from "./equipo";

export const INVITACION_DIAS = 14;

export type InvitacionPendiente = { id: string; tenantId: string; banda: string; rol: string; vence: Date };

const etiquetaDeRol = (rol: string) => registro().rol(rol)?.etiqueta ?? rol;

/** El titular invita a alguien por email con un rol. Le llega un mail. */
export async function invitar(titularId: string, tenantId: string, emailCrudo: string, rol: string, ahora = new Date()): Promise<string> {
  const email = emailCrudo.trim().toLowerCase();
  if (!esEmail(email)) throw new ErrorEquipo("Revisá el email.");
  if (!registro().rol(rol)) throw new ErrorEquipo("Elegí un rol.");
  if (rol === "TITULAR") throw new ErrorEquipo("Hay un solo titular por banda: para que lo sea otra persona, pasale la titularidad.");
  return conTenant(tenantId, async (tx) => {
    const ya = await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM miembros_de_banda() WHERE lower(email) = ${email}`;
    if (ya[0]?.n) throw new ErrorEquipo("Esa persona ya es parte de la banda.");
    // Una pendiente por email: la nueva reemplaza a la anterior.
    await tx.invitacion.updateMany({ where: { email, estado: "pendiente" }, data: { estado: "cancelada", resueltaEn: ahora } });
    const inv = await tx.invitacion.create({ data: { tenantId, email, rol, invitadoPor: titularId, vence: new Date(ahora.getTime() + INVITACION_DIAS * 86_400_000) } });
    await tx.auditoria.create({ data: { usuarioId: titularId, tenantId, accion: "membresia.invitada", detalle: { email, rol, invitacionId: inv.id } } });
    const banda = (await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nombre: true } })).nombre;
    const url = `${origenPlataforma()}/`;
    await enviarCorreoDelNucleo(
      tenantId,
      {
        para: email,
        asunto: `Te invitaron a ${banda} en Deoco`,
        html: `<p>${h(banda)} te invitó a su panel en Deoco como <strong>${h(etiquetaDeRol(rol))}</strong>.</p>
<p>Entrá con tu cuenta de este mismo email (${h(email)}) y aceptala desde <a href="${h(url)}">${h(url)}</a>. Vence en ${INVITACION_DIAS} días. Si no tenés cuenta, pedile una a quien te invitó o escribinos.</p>`,
        texto: `${banda} te invitó a su panel en Deoco como ${etiquetaDeRol(rol)}.\n\nEntrá con tu cuenta de este mismo email (${email}) y aceptala desde ${url}. Vence en ${INVITACION_DIAS} días.`,
      },
      { tx },
    );
    return inv.id;
  });
}

export async function cancelarInvitacion(titularId: string, tenantId: string, invitacionId: string): Promise<void> {
  await conTenant(tenantId, async (tx) => {
    const { count } = await tx.invitacion.updateMany({ where: { id: invitacionId, estado: "pendiente" }, data: { estado: "cancelada", resueltaEn: new Date() } });
    if (!count) throw new ErrorEquipo("Esa invitación ya no está pendiente.");
    await tx.auditoria.create({ data: { usuarioId: titularId, tenantId, accion: "membresia.invitacion_cancelada", detalle: { invitacionId } } });
  });
}

export const invitacionesDeBanda = (tenantId: string) =>
  conTenant(tenantId, (tx) => tx.invitacion.findMany({ where: { estado: "pendiente", vence: { gt: new Date() } }, orderBy: { creadoEn: "desc" } }));

/** Las invitaciones vigentes para el usuario (por su email). */
export async function invitacionesPara(usuarioId: string): Promise<InvitacionPendiente[]> {
  const u = await usuarioPropio(usuarioId);
  if (!u) return [];
  const filas = await prisma.$queryRaw<{ id: string; tenant_id: string; banda: string; rol: string; vence: Date }[]>`SELECT * FROM invitaciones_para(${u.email})`;
  return filas.map((f) => ({ id: f.id, tenantId: f.tenant_id, banda: f.banda, rol: f.rol, vence: f.vence }));
}

/** Acepta (o rechaza) una invitación para su email: aceptada, queda en el equipo con ese rol. */
export async function responderInvitacion(usuarioId: string, tenantId: string, invitacionId: string, acepta: boolean, ahora = new Date()): Promise<void> {
  const u = await usuarioPropio(usuarioId);
  if (!u) throw new ErrorEquipo("Entrá con tu cuenta.");
  await conTenant(tenantId, async (tx) => {
    const inv = await tx.invitacion.findUnique({ where: { id: invitacionId } });
    if (!inv || inv.email !== u.email.toLowerCase() || inv.estado !== "pendiente" || inv.vence <= ahora) throw new ErrorEquipo("Esa invitación ya no está vigente.");
    await tx.invitacion.update({ where: { id: inv.id }, data: { estado: acepta ? "aceptada" : "rechazada", resueltaEn: ahora } });
    if (acepta) {
      const ya = await tx.membresia.findFirst({ where: { usuarioId } });
      if (!ya) await tx.membresia.create({ data: { tenantId, usuarioId, rol: inv.rol } });
    }
    await tx.auditoria.create({ data: { usuarioId, tenantId, accion: acepta ? "membresia.invitacion_aceptada" : "membresia.invitacion_rechazada", detalle: { invitacionId, rol: inv.rol } } });
  });
}
