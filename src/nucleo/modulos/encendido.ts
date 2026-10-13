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

/** Prende un módulo para una banda. Falla si le falta alguna dependencia prendida. */
export async function prenderModulo(tenantId: string, moduloId: string, reg: Registro = registroGlobal()) {
  const modulo = reg.modulo(moduloId);
  if (!modulo) throw new ErrorModulo(`No existe el módulo "${moduloId}".`);
  await conTenant(tenantId, async (tx) => {
    const prendidos = new Set((await tx.moduloTenant.findMany({ select: { moduloId: true } })).map((f) => f.moduloId));
    const faltan = (modulo.dependencias ?? []).filter((d) => !prendidos.has(d));
    if (faltan.length > 0) {
      throw new ErrorModulo(
        `No se puede prender "${moduloId}": necesita ${faltan.map((d) => `"${d}"`).join(", ")}, ` +
          `que no está prendido para esta banda. Prendé primero ${faltan.length > 1 ? "esos módulos" : "ese módulo"}.`,
      );
    }
    await tx.moduloTenant.createMany({ data: [{ tenantId, moduloId }], skipDuplicates: true });
  });
}

/** Apaga un módulo para una banda. Sus datos se conservan. */
export async function apagarModulo(tenantId: string, moduloId: string) {
  await conTenant(tenantId, (tx) => tx.moduloTenant.deleteMany({ where: { moduloId } }));
}
