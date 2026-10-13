import type { Acceso } from "@/nucleo/acceso/resolver";
import { accesoTienePermiso } from "@/nucleo/permisos/puede";
import type { Registro } from "./registro";

export type ItemNavegacion = { etiqueta: string; href: string; moduloId: string };

/** Menú del panel: entradas de módulos prendidos, filtradas por permiso, por orden. */
export function menuPanel(reg: Registro, prendidos: Set<string>, acceso: Acceso, slug: string): ItemNavegacion[] {
  return reg.navegacion
    .filter((n) => !n.publica && prendidos.has(n.moduloId))
    .filter((n) => !n.permiso || accesoTienePermiso(acceso, reg.permiso(n.permiso)))
    .map((n) => ({ etiqueta: n.etiqueta, href: `/b/${slug}${n.href}`, moduloId: n.moduloId }));
}

/** Pestañas del sitio público: solo módulos prendidos, sin permisos, por orden. */
export function pestanasSitio(reg: Registro, prendidos: Set<string>): ItemNavegacion[] {
  return reg.navegacion
    .filter((n) => n.publica && prendidos.has(n.moduloId))
    .map((n) => ({ etiqueta: n.etiqueta, href: n.href, moduloId: n.moduloId }));
}
