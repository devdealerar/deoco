import { prisma } from "@/nucleo/db/cliente";
import { conTenant } from "@/nucleo/db/con-tenant";
import { registro as registroGlobal } from "./index";
import type { Registro } from "./registro";

/**
 * Módulos prendidos para una banda (fila en moduloTenant = prendido).
 * Solo cuenta los que existen en el registro: una fila de un módulo que ya no
 * está en el código no prende nada.
 */
export async function modulosPrendidos(tenantId: string, reg: Registro = registroGlobal()): Promise<Set<string>> {
  const filas = await conTenant(tenantId, (tx) => tx.moduloTenant.findMany({ select: { moduloId: true } }));
  return new Set(filas.map((f) => f.moduloId).filter((id) => reg.modulo(id)));
}

export class ErrorModulo extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorModulo";
  }
}

const lista = (ids: string[]) => ids.map((d) => `"${d}"`).join(", ");

/** Prender y apagar módulos es tarea del staff de Deoco (sin pantalla por ahora). */
async function exigirStaff(staffId: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id: staffId }, select: { esStaff: true } });
  if (!usuario?.esStaff) throw new ErrorModulo("Solo el staff de Deoco puede prender o apagar módulos.");
}

/** Prende un módulo para una banda. Falla si le falta alguna dependencia prendida. */
export async function prenderModulo(
  staffId: string,
  tenantId: string,
  moduloId: string,
  reg: Registro = registroGlobal(),
) {
  await exigirStaff(staffId);
  const modulo = reg.modulo(moduloId);
  if (!modulo) throw new ErrorModulo(`No existe el módulo "${moduloId}".`);
  await conTenant(tenantId, async (tx) => {
    const prendidos = new Set((await tx.moduloTenant.findMany({ select: { moduloId: true } })).map((f) => f.moduloId));
    const faltan = (modulo.dependencias ?? []).filter((d) => !prendidos.has(d));
    if (faltan.length > 0) {
      throw new ErrorModulo(
        `No se puede prender "${moduloId}": necesita ${lista(faltan)}, que no está prendido para esta banda. ` +
          `Prendé primero ${faltan.length > 1 ? "esos módulos" : "ese módulo"}.`,
      );
    }
    await tx.moduloTenant.createMany({ data: [{ tenantId, moduloId }], skipDuplicates: true });
  });
}

/**
 * Apaga un módulo para una banda. Sus datos se conservan.
 * Falla si otro módulo prendido en esa banda depende de él (no apaga en cascada).
 */
export async function apagarModulo(
  staffId: string,
  tenantId: string,
  moduloId: string,
  reg: Registro = registroGlobal(),
) {
  await exigirStaff(staffId);
  await conTenant(tenantId, async (tx) => {
    const prendidos = (await tx.moduloTenant.findMany({ select: { moduloId: true } })).map((f) => f.moduloId);
    const loUsan = prendidos.filter((id) => reg.modulo(id)?.dependencias?.includes(moduloId));
    if (loUsan.length > 0) {
      throw new ErrorModulo(
        `No se puede apagar "${moduloId}": lo usa ${lista(loUsan)}, que está prendido para esta banda. ` +
          `Apagá primero ${loUsan.length > 1 ? "esos módulos" : "ese módulo"}.`,
      );
    }
    await tx.moduloTenant.deleteMany({ where: { moduloId } });
  });
}
