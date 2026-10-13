// Contacto de la tienda: a quién le responde el fan (responder-a del mail de compra) y con
// quién habla el proveedor. Lo carga la banda; si no, el mail del titular de la banda.
import { conTenant } from "@/nucleo/db/con-tenant";

export type Contacto = { nombre: string; email: string; telefono: string; cargado: boolean };

const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

export class ErrorContacto extends Error {}

export async function contactoDeTienda(tenantId: string): Promise<Contacto> {
  return conTenant(tenantId, async (tx) => {
    const config = await tx.tiendaConfig.findUnique({ where: { tenantId } });
    const banda = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nombre: true } });
    if (config?.contactoEmail) {
      return { nombre: config.contactoNombre || banda.nombre, email: config.contactoEmail, telefono: config.contactoTelefono, cargado: true };
    }
    const titular = await tx.membresia.findFirst({ where: { rol: "TITULAR" }, orderBy: { id: "asc" }, include: { usuario: { select: { email: true } } } });
    return { nombre: config?.contactoNombre || banda.nombre, email: titular?.usuario.email ?? "", telefono: config?.contactoTelefono ?? "", cargado: false };
  });
}

export async function guardarContacto(tenantId: string, d: { nombre: string; email: string; telefono: string }) {
  const email = d.email.trim().toLowerCase();
  if (email && !EMAIL.test(email)) throw new ErrorContacto(`"${d.email}" no es un mail válido.`);
  const datos = { contactoNombre: d.nombre.trim().slice(0, 120), contactoEmail: email, contactoTelefono: d.telefono.trim().slice(0, 40) };
  await conTenant(tenantId, (tx) => tx.tiendaConfig.upsert({ where: { tenantId }, create: { tenantId, ...datos }, update: datos }));
}
