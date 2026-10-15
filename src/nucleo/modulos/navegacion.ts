import type { Acceso } from "@/nucleo/acceso/resolver";
import { accesoTienePermiso } from "@/nucleo/permisos/puede";
import type { Registro } from "./registro";

export type ItemNavegacion = { etiqueta: string; href: string; moduloId: string };

/** Menú del panel: entradas de módulos prendidos, filtradas por permiso, por orden. */
export function menuPanel(reg: Registro, prendidos: Set<string>, acceso: Acceso, slug: string): ItemNavegacion[] {
  return reg.navegacion
    .filter((n) => !n.publica && !n.admin && !n.externa && prendidos.has(n.moduloId))
    .filter((n) => !n.permiso || accesoTienePermiso(acceso, reg.permiso(n.permiso), prendidos, reg))
    .map((n) => ({ etiqueta: n.etiqueta, href: `/b/${slug}${n.href}`, moduloId: n.moduloId }));
}

/** Pestañas del sitio público: solo módulos prendidos, sin permisos, por orden. */
export function pestanasSitio(reg: Registro, prendidos: Set<string>): ItemNavegacion[] {
  return reg.navegacion
    .filter((n) => n.publica && prendidos.has(n.moduloId))
    .map((n) => ({ etiqueta: n.etiqueta, href: n.href, moduloId: n.moduloId }));
}

/** Menú del back office: entradas `admin` de todos los módulos (el staff ve todo), por orden. */
export function menuAdmin(reg: Registro): ItemNavegacion[] {
  return reg.navegacion
    .filter((n) => n.admin)
    .map((n) => ({ etiqueta: n.etiqueta, href: `/admin/m/${n.moduloId}${n.href === "/" ? "" : n.href}`, moduloId: n.moduloId }));
}

/**
 * Menú del back office agrupado por módulo (el nombre del módulo de título), en el orden de la
 * primera entrada de cada uno. Así se lee igual con dos módulos que con diez.
 */
export function menuAdminPorModulo(reg: Registro): { moduloId: string; titulo: string; items: ItemNavegacion[] }[] {
  const grupos = new Map<string, { moduloId: string; titulo: string; items: ItemNavegacion[] }>();
  for (const item of menuAdmin(reg)) {
    const g = grupos.get(item.moduloId) ?? { moduloId: item.moduloId, titulo: reg.modulo(item.moduloId)?.nombre ?? item.moduloId, items: [] };
    g.items.push(item);
    grupos.set(item.moduloId, g);
  }
  return [...grupos.values()];
}

/** Menú del portal de cuentas externas de un módulo, por orden. */
export function menuExterno(reg: Registro, moduloId: string): ItemNavegacion[] {
  return reg.navegacion
    .filter((n) => n.externa && n.moduloId === moduloId)
    .map((n) => ({ etiqueta: n.etiqueta, href: `/portal/${moduloId}${n.href === "/" ? "" : n.href}`, moduloId }));
}
