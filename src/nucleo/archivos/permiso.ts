// Quién ve un archivo de la banda en el panel (/b/<slug>/archivos/<id>): el que tiene el permiso
// del recurso al que pertenece (lo declara el módulo en `archivos`), con el módulo prendido.
// Tener el id no es un permiso. Sin recurso conocido (archivos viejos que no se pudieron deducir):
// solo el titular.
import type { Acceso } from "@/nucleo/acceso/resolver";
import { conTenant } from "@/nucleo/db/con-tenant";
import { registro as registroGlobal } from "@/nucleo/modulos";
import { modulosPrendidos } from "@/nucleo/modulos/encendido";
import type { Registro } from "@/nucleo/modulos/registro";
import { accesoTienePermiso } from "@/nucleo/permisos/puede";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function accesoAlArchivo(acceso: Acceso, archivoId: string, reg: Registro = registroGlobal()): Promise<"permitido" | "prohibido" | "no-existe"> {
  if (!UUID.test(archivoId)) return "no-existe";
  const fila = await conTenant(acceso.tenantId, (tx) => tx.archivo.findUnique({ where: { id: archivoId }, select: { moduloId: true, recurso: true } }));
  if (!fila) return "no-existe";
  const def = reg.modulo(fila.moduloId)?.archivos?.find((a) => a.recurso === fila.recurso);
  if (!def) return acceso.rol === "TITULAR" ? "permitido" : "prohibido";
  const prendidos = await modulosPrendidos(acceso.tenantId, reg);
  if (!prendidos.has(fila.moduloId)) return "prohibido";
  return accesoTienePermiso(acceso, reg.permiso(def.permiso), prendidos, reg) ? "permitido" : "prohibido";
}
