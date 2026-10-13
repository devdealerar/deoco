import type { EstadoTenant } from "@/generated/prisma/client";

/** Todo lo que cuelga de este prefijo, en el host de una banda, es su panel. */
export const PREFIJO_PANEL = "/panel";

/**
 * Rutas del panel que siguen abiertas con el tenant SUSPENDIDO (solo para el titular).
 * PENDIENTE: confirmar si las define el núcleo o las declara un módulo.
 */
export const RUTAS_PAGO_PANEL = ["/panel/pago"];

export type Decision =
  | { tipo: "seguir"; soloTitular: boolean }
  | { tipo: "prohibido" } // 403
  | { tipo: "no-encontrado" }; // 404

function bajo(pathname: string, prefijo: string) {
  return pathname === prefijo || pathname.startsWith(prefijo + "/");
}

export function esRutaPanel(pathname: string) {
  return bajo(pathname, PREFIJO_PANEL);
}

/** Reglas de estado del tenant, para un pedido a `pathname` en el host de la banda. */
export function decidirPorEstado(estado: EstadoTenant, pathname: string): Decision {
  switch (estado) {
    case "ACTIVO":
    case "MOROSO": // funciona igual; el aviso al titular lo muestra el panel
      return { tipo: "seguir", soloTitular: false };
    case "SUSPENDIDO":
      if (!esRutaPanel(pathname)) return { tipo: "seguir", soloTitular: false };
      if (RUTAS_PAGO_PANEL.some((r) => bajo(pathname, r))) return { tipo: "seguir", soloTitular: true };
      return { tipo: "prohibido" };
    case "ARCHIVADO":
      return { tipo: "no-encontrado" };
    default: {
      const _exhaustivo: never = estado;
      return _exhaustivo;
    }
  }
}
