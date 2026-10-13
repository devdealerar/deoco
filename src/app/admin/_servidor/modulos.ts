import { registro } from "@/nucleo/modulos";
import { apagarModulo, ErrorModulo, prenderModulo } from "@/nucleo/modulos/encendido";
import type { Registro } from "@/nucleo/modulos/registro";
import { ErrorFormulario } from "@/ui/servidor";
import { auditar } from "./auditoria";

// Prender y apagar usan las funciones del núcleo (con sus reglas de dependencia y su
// mensaje de error de siempre); la auditoría va en la misma transacción del cambio.

export async function prender(staffId: string, tenantId: string, moduloId: string, reg: Registro = registro()) {
  try {
    await prenderModulo(staffId, tenantId, moduloId, reg, {
      registrar: (tx) => auditar(tx, { usuarioId: staffId, tenantId, accion: "modulo.prendido", detalle: { moduloId } }),
    });
  } catch (e) {
    if (e instanceof ErrorModulo) throw new ErrorFormulario(e.message);
    throw e;
  }
}

export async function apagar(staffId: string, tenantId: string, moduloId: string, reg: Registro = registro()) {
  try {
    await apagarModulo(staffId, tenantId, moduloId, reg, {
      registrar: (tx) => auditar(tx, { usuarioId: staffId, tenantId, accion: "modulo.apagado", detalle: { moduloId } }),
    });
  } catch (e) {
    if (e instanceof ErrorModulo) throw new ErrorFormulario(e.message);
    throw e;
  }
}
