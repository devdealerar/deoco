import type { EstadoTenant } from "@/generated/prisma/client";

/**
 * Rutas del panel en app.<raiz>:
 *   /b/<slug>/...        panel de una banda
 *   /b/<slug>/pago/...   pago de la cuota: lo define el núcleo (una banda sin módulos
 *                        prendidos igual tiene que poder pagar). Abierto con el tenant
 *                        SUSPENDIDO, solo para el titular.
 */
const RUTA_PANEL_BANDA = /^\/b\/([^/]+)(\/.*)?$/;
const SUBRUTA_PAGO = "/pago";

export type RutaPanel = { slug: string; esPago: boolean };

/** Si `pathname` es el panel de una banda, su slug; si no, null (selector, login, etc.). */
export function rutaPanelBanda(pathname: string): RutaPanel | null {
  const m = RUTA_PANEL_BANDA.exec(pathname);
  if (!m) return null;
  const resto = m[2] ?? "";
  let slug: string;
  try {
    slug = decodeURIComponent(m[1]).toLowerCase();
  } catch {
    return null;
  }
  const esPago = resto === SUBRUTA_PAGO || resto.startsWith(SUBRUTA_PAGO + "/");
  return { slug, esPago };
}

export type Superficie = "panel" | "sitio";

export type Decision =
  | { tipo: "seguir"; soloTitular: boolean }
  | { tipo: "prohibido" } // 403
  | { tipo: "no-encontrado" }; // 404

/** Reglas de estado del tenant; iguales venga resuelto por host o por slug. */
export function decidirPorEstado(
  estado: EstadoTenant,
  superficie: Superficie,
  esPago = false,
): Decision {
  switch (estado) {
    case "ACTIVO":
    case "MOROSO": // funciona igual; el aviso al titular lo muestra el panel
      return { tipo: "seguir", soloTitular: false };
    case "SUSPENDIDO":
      if (superficie === "sitio") return { tipo: "seguir", soloTitular: false };
      return esPago ? { tipo: "seguir", soloTitular: true } : { tipo: "prohibido" };
    case "ARCHIVADO":
      return { tipo: "no-encontrado" };
    default: {
      const _exhaustivo: never = estado;
      return _exhaustivo;
    }
  }
}
