import type { EstadoTenant } from "@/generated/prisma/client";

/**
 * Rutas del panel en app.<raiz>:
 *   /b/<slug>/...        panel de una banda
 *   /b/<slug>/pago/...   pago de la cuota: lo define el núcleo (una banda sin módulos
 *                        prendidos igual tiene que poder pagar).
 *   /b/<slug>/dominios   los dominios de la banda: ni la cuota impaga ni el archivo le impiden
 *                        llevárselos (docs/diseno-dominios.md §2, "ninguna banda queda presa").
 * Con el tenant SUSPENDIDO, las dos abiertas solo para el titular; ARCHIVADO, solo Dominios.
 * Las rutas de módulo con la banda cerrada (SUSPENDIDO o ARCHIVADO) pasan marcadas: las decide
 * la ruta (`conBandaCerrada` en el contrato, en accesoPanel). Todas las demás, cerradas.
 */
const RUTA_PANEL_BANDA = /^\/b\/([^/]+)(\/.*)?$/;

/** Rutas del panel que son del núcleo (primer segmento): ningún módulo las puede ocupar. */
export const RUTAS_NUCLEO_PANEL = ["/", "/pago", "/archivos", "/dominios", "/correo", "/credenciales"];

/** `subruta`: "modulo" si la ruta no es del núcleo; `resto`: lo que sigue al slug ("/" si nada). */
export type RutaPanel = { slug: string; subruta: "pago" | "dominios" | "modulo" | null; resto: string };

/** Si `pathname` es el panel de una banda, su slug; si no, null (selector, login, etc.). */
export function rutaPanelBanda(pathname: string): RutaPanel | null {
  const m = RUTA_PANEL_BANDA.exec(pathname);
  if (!m) return null;
  const resto = m[2] && m[2] !== "/" ? m[2] : "/";
  let slug: string;
  try {
    slug = decodeURIComponent(m[1]).toLowerCase();
  } catch {
    return null;
  }
  const es = (r: string) => resto === r || resto.startsWith(r + "/");
  const subruta = es("/pago") ? "pago" : es("/dominios") ? "dominios" : RUTAS_NUCLEO_PANEL.some((r) => r !== "/" && es(r)) || resto === "/" ? null : "modulo";
  return { slug, subruta, resto };
}

export type Superficie = "panel" | "publico";

export type Decision =
  /** `bandaCerrada`: ruta de módulo con la banda SUSPENDIDA o ARCHIVADA (la decide la ruta). */
  | { tipo: "seguir"; soloTitular: boolean; bandaCerrada?: true }
  | { tipo: "prohibido" } // 403
  | { tipo: "no-encontrado" }; // 404

/** Reglas de estado del tenant; iguales venga resuelto por host o por slug. */
export function decidirPorEstado(
  estado: EstadoTenant,
  superficie: Superficie,
  subruta: RutaPanel["subruta"] = null,
): Decision {
  switch (estado) {
    case "ACTIVO":
    case "MOROSO": // funciona igual; el aviso al titular lo muestra el panel
      return { tipo: "seguir", soloTitular: false };
    case "SUSPENDIDO":
      if (superficie === "publico") return { tipo: "seguir", soloTitular: false };
      if (subruta === "modulo") return { tipo: "seguir", soloTitular: false, bandaCerrada: true };
      return subruta ? { tipo: "seguir", soloTitular: true } : { tipo: "prohibido" };
    case "ARCHIVADO":
      // Todo 404, salvo los dominios para el titular (el dominio es suyo) y lo que una ruta de
      // módulo abra con la banda cerrada (la puerta de un show ya vendido).
      if (superficie === "panel" && subruta === "modulo") return { tipo: "seguir", soloTitular: false, bandaCerrada: true };
      return superficie === "panel" && subruta === "dominios" ? { tipo: "seguir", soloTitular: true } : { tipo: "no-encontrado" };
    default: {
      const _exhaustivo: never = estado;
      return _exhaustivo;
    }
  }
}
