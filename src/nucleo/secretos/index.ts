// Secretos por banda: lo que usa un MÓDULO. Solo lectura, y solo de lo suyo.
// La carga (titular) está en ./carga, que los módulos no importan (tests/modulos.test.ts).
import { conTenant } from "@/nucleo/db/con-tenant";
import { registro as registroGlobal } from "@/nucleo/modulos";
import type { Modulo } from "@/nucleo/modulos/contrato";
import { modulosPrendidos } from "@/nucleo/modulos/encendido";
import type { Registro } from "@/nucleo/modulos/registro";
import { descifrar, ErrorSecreto } from "./cifrado";

export { ErrorSecreto };

/** Ata el cifrado a su fila: banda + módulo + clave. */
export const contextoSecreto = (tenantId: string, moduloId: string, clave: string) =>
  `deoco/secreto/${tenantId}/${moduloId}/${clave}`;

/**
 * El módulo pasa SU PROPIO objeto de contrato (`import modulo from "./index"`): el núcleo
 * exige que sea el mismo objeto registrado, y un módulo no puede importar el de otro.
 * Así cada módulo lee solo sus secretos.
 */
export function moduloDueno(modulo: Modulo, clave: string, reg: Registro = registroGlobal()) {
  if (reg.modulo(modulo.id) !== modulo) throw new ErrorSecreto(`"${modulo.id}" no es un módulo registrado.`);
  const def = modulo.secretos?.find((s) => s.clave === clave);
  if (!def) throw new ErrorSecreto(`El módulo "${modulo.id}" no declara el secreto "${clave}".`);
  return def;
}

/**
 * Valor de la credencial de esta banda para este módulo, o null si no la cargó el
 * titular (o el módulo está apagado para la banda). No lo loguees ni lo devuelvas al navegador.
 */
export async function leerSecreto(
  modulo: Modulo,
  tenantId: string,
  clave: string,
  reg: Registro = registroGlobal(),
): Promise<string | null> {
  moduloDueno(modulo, clave, reg);
  if (!(await modulosPrendidos(tenantId, reg)).has(modulo.id)) return null;
  const fila = await conTenant(tenantId, (tx) =>
    tx.secreto.findUnique({
      where: { tenantId_moduloId_clave: { tenantId, moduloId: modulo.id, clave } },
      select: { cifrado: true },
    }),
  );
  return fila ? descifrar(fila.cifrado, contextoSecreto(tenantId, modulo.id, clave)) : null;
}
