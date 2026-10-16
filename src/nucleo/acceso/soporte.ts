// Suplantación segura (D3). El staff entra al panel de una banda sin membresía SOLO con una sesión
// de soporte: la pide con un motivo escrito (queda en la actividad de la banda), vence sola (15 a
// 60 minutos) y mientras dura actúa como GESTOR: todo lo que la banda gestiona, nada de la plata ni
// del control de la cuenta (cobro, plan, devoluciones, credenciales, dominios, equipo, exportar,
// datos personales de los fans). La banda ve que alguien de soporte entró, cuándo y por qué.
import { conTenant } from "@/nucleo/db/con-tenant";

export class ErrorSoporte extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorSoporte";
  }
}

export const DURACIONES_SOPORTE = [15, 30, 60] as const;

export type SesionDeSoporte = { id: string; motivo: string; venceEn: Date; creadaEn: Date };

/** La sesión vigente de esta persona del staff en esta banda, o null. */
export async function sesionDeSoporte(staffId: string, tenantId: string, ahora = new Date()): Promise<SesionDeSoporte | null> {
  return conTenant(tenantId, (tx) =>
    tx.sesionSoporte.findFirst({
      where: { staffId, terminadaEn: null, venceEn: { gt: ahora } },
      orderBy: { creadaEn: "desc" },
      select: { id: true, motivo: true, venceEn: true, creadaEn: true },
    }),
  );
}

/**
 * Abre una sesión de soporte (el llamador ya verificó que es staff). Motivo obligatorio (10
 * caracteres o más: la base también lo exige). Queda en la actividad de la banda.
 */
export async function iniciarSoporte(staffId: string, tenantId: string, motivo: string, minutos: number, ahora = new Date()): Promise<SesionDeSoporte> {
  const m = motivo.trim().replace(/\s+/g, " ").slice(0, 500);
  if (m.length < 10) throw new ErrorSoporte("Escribí el motivo (para qué entrás): la banda lo va a ver.");
  if (!(DURACIONES_SOPORTE as readonly number[]).includes(minutos)) throw new ErrorSoporte("Elegí cuánto dura: 15, 30 o 60 minutos.");
  return conTenant(tenantId, async (tx) => {
    // Una vigente a la vez por persona: la anterior se termina.
    await tx.sesionSoporte.updateMany({ where: { staffId, terminadaEn: null, venceEn: { gt: ahora } }, data: { terminadaEn: ahora } });
    const s = await tx.sesionSoporte.create({ data: { tenantId, staffId, motivo: m, creadaEn: ahora, venceEn: new Date(ahora.getTime() + minutos * 60_000) } });
    await tx.auditoria.create({ data: { usuarioId: staffId, tenantId, accion: "soporte.entrada", detalle: { sesionId: s.id, motivo: m, minutos } } });
    return { id: s.id, motivo: s.motivo, venceEn: s.venceEn, creadaEn: s.creadaEn };
  });
}

/** Termina la sesión vigente antes de que venza. */
export async function terminarSoporte(staffId: string, tenantId: string, ahora = new Date()): Promise<void> {
  await conTenant(tenantId, async (tx) => {
    const { count } = await tx.sesionSoporte.updateMany({ where: { staffId, terminadaEn: null, venceEn: { gt: ahora } }, data: { terminadaEn: ahora } });
    if (count) await tx.auditoria.create({ data: { usuarioId: staffId, tenantId, accion: "soporte.salida", detalle: {} } });
  });
}

/** Lo que la banda ve: las sesiones de soporte en su cuenta, las últimas primero. */
export const sesionesDeSoporteDeBanda = (tenantId: string, cuantas = 50) =>
  conTenant(tenantId, (tx) => tx.sesionSoporte.findMany({ orderBy: { creadaEn: "desc" }, take: cuantas }));

/** Las vigentes ahora (para el aviso en el panel de la banda). */
export const sesionesDeSoporteActivas = (tenantId: string, ahora = new Date()) =>
  conTenant(tenantId, (tx) => tx.sesionSoporte.findMany({ where: { terminadaEn: null, venceEn: { gt: ahora } }, orderBy: { creadaEn: "desc" } }));
