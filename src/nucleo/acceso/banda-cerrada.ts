// Con la banda SUSPENDIDA o ARCHIVADA el panel se cierra. La única excepción que viene de un
// módulo: una ruta de panel que declara `conBandaCerrada` (la puerta de un show ya vendido, que
// no se puede cortar por la cuota: documento maestro §14). Acá se decide si una ruta abre.
import { registro as registroGlobal } from "@/nucleo/modulos";
import { modulosPrendidos } from "@/nucleo/modulos/encendido";
import type { Registro } from "@/nucleo/modulos/registro";
import { accesoTienePermiso } from "@/nucleo/permisos/puede";
import type { Acceso } from "./resolver";

/**
 * ¿Abre `ruta` (lo que sigue a /b/<slug>, "/puerta/<id>") con la banda cerrada, para este acceso?
 * Solo si la ruta lo declara, su módulo está prendido, el acceso tiene el permiso de la ruta y
 * la ruta dice que sí para esta banda. Cualquier otra cosa: no.
 */
export async function rutaAbiertaConBandaCerrada(acceso: Acceso, ruta: string, reg: Registro = registroGlobal()): Promise<boolean> {
  const encontrada = reg.rutaPanel(ruta.split("?")[0] || "/");
  const { conBandaCerrada, permiso } = encontrada?.ruta ?? {};
  if (!encontrada || !conBandaCerrada || !permiso) return false;
  const prendidos = await modulosPrendidos(acceso.tenantId, reg);
  if (!prendidos.has(encontrada.moduloId)) return false;
  if (!accesoTienePermiso(acceso, reg.permiso(permiso), prendidos, reg)) return false;
  return conBandaCerrada(acceso.tenantId, encontrada.params);
}
