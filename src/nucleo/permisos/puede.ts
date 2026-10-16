import { type Acceso, resolverAcceso } from "@/nucleo/acceso/resolver";
import type { DefinicionPermiso } from "@/nucleo/modulos/contrato";
import { modulosPrendidos } from "@/nucleo/modulos/encendido";
import { registro } from "@/nucleo/modulos";
import type { Registro } from "@/nucleo/modulos/registro";

/**
 * ¿El rol cuenta en esta banda? Los del núcleo, siempre; el de un módulo (PUERTA), si alguno de
 * los módulos que lo declaran está prendido. Uno que ya no existe en el build, nunca.
 */
export function rolVigente(rol: string, prendidos: Set<string>, reg: Registro = registro()): boolean {
  const r = reg.rol(rol);
  return !!r && (r.moduloIds.length === 0 || r.moduloIds.some((id) => prendidos.has(id)));
}

/**
 * Decisión por rol: ¿este acceso tiene este permiso? No mira si el módulo del permiso está
 * prendido; con `prendidos`, sí mira que el rol esté vigente (rolVigente).
 */
export function accesoTienePermiso(acceso: Acceso | null, def: DefinicionPermiso | undefined, prendidos?: Set<string>, reg?: Registro): boolean {
  if (!acceso || !def) return false; // permiso no declarado o sin acceso: no
  if (acceso.rol && def.rolesPorDefecto.includes(acceso.rol) && (!prendidos || rolVigente(acceso.rol, prendidos, reg))) return true;
  // GESTOR (núcleo): todo lo que puede el titular en los módulos, menos lo exclusivo del titular
  // (la pasarela de cobro). Las pantallas del núcleo de plata y control (pago, devoluciones,
  // credenciales, dominios, equipo) siguen siendo solo del titular (`exigirTitular`).
  if (acceso.rol === "GESTOR" && def.rolesPorDefecto.includes("TITULAR")) return !def.exclusivoTitular;

  // EXCEPCIÓN EXPLÍCITA · Staff de Deoco (D3, suplantación segura)
  // El staff sin membresía no tiene permisos en una banda salvo con una sesión de soporte
  // vigente (motivo escrito, vence sola): entonces, los de GESTOR. Nunca lo exclusivo del
  // titular (la pasarela de cobro) ni nada que la banda no podría hacer. Un staff que además es
  // parte de esa banda ya pasó arriba por su rol.
  if (acceso.esStaff && acceso.rol === null) return !!acceso.soporte && def.rolesPorDefecto.includes("TITULAR") && !def.exclusivoTitular;

  return false;
}

/**
 * ¿El usuario, en esta banda, tiene este permiso? El rol se resuelve en cada llamada.
 * Un permiso de un módulo apagado para la banda es siempre false.
 */
export async function puede(usuarioId: string, tenantId: string, permiso: string): Promise<boolean> {
  const def = registro().permiso(permiso);
  if (!def) return false;
  const prendidos = await modulosPrendidos(tenantId);
  if (!prendidos.has(def.moduloId)) return false;
  return accesoTienePermiso(await resolverAcceso(usuarioId, tenantId), def, prendidos);
}
