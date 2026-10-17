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
export const RUTAS_NUCLEO_PANEL = ["/", "/pago", "/devoluciones", "/exportar", "/datos-personales", "/legal", "/soporte", "/actividad", "/equipo", "/archivos", "/dominios", "/correo", "/credenciales"];

/**
 * `subruta`: "pago" para lo que la banda le debe resolver a alguien o se lleva (Plan y pago, Pagos
 * para devolver, Exportar todo: abiertos en todos los estados, solo para el titular cuando la
 * banda está cerrada);
 * "dominios" (llevarse sus dominios); "modulo" si la ruta no es del núcleo. `resto`: lo que sigue
 * al slug ("/" si nada).
 */
export type RutaPanel = { slug: string; subruta: "pago" | "dominios" | "modulo" | "legal" | null; resto: string };

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
  const subruta = es("/pago") || es("/devoluciones") || es("/exportar") || es("/datos-personales") ? "pago" : es("/dominios") ? "dominios" : RUTAS_NUCLEO_PANEL.some((r) => r !== "/" && es(r)) || resto === "/" ? null : "modulo";
  return { slug, subruta, resto };
}

export type Superficie = "panel" | "publico";

export type Decision =
  /**
   * `bandaCerrada`: ruta de módulo con la banda SUSPENDIDA (sitio público) o ARCHIVADA: la decide
   * la ruta (`conBandaCerrada`). `soloLectura`: el panel se ve, pero no guarda nada.
   */
  | { tipo: "seguir"; soloTitular: boolean; bandaCerrada?: true; soloLectura?: true }
  | { tipo: "no-encontrado" }; // 404

/** Rutas del sitio público que son del núcleo (primer segmento). Las demás son de módulos. */
export const RUTAS_NUCLEO_PUBLICAS = ["/ingresar", "/api", "/b", "/archivos", "/admin", "/avisos", "/clave", "/descargas", "/portal", "/registro", "/encargo", "/privacidad", "/terminos", "/datos-personales", "/arrepentimiento", "/mis-compras"];

/**
 * Las páginas legales del sitio de la banda (D2): abiertas en TODOS los estados, también con el
 * sitio suspendido o la banda archivada. Los plazos de la ley (acceso, borrado, arrepentimiento)
 * no se suspenden por la cuota impaga de la banda. Y "Mis compras" (D5): lo que el fan ya pagó
 * (sus entradas, su pedido) no se le esconde por la cuota de la banda.
 */
export const RUTAS_LEGALES_PUBLICAS = ["/privacidad", "/terminos", "/datos-personales", "/arrepentimiento", "/mis-compras"];

/** En el sitio público de una banda: "modulo" si la ruta es de un módulo (la home también), "legal" si es legal, null si es del núcleo. */
export function rutaPublicaDeModulo(pathname: string): "modulo" | "legal" | null {
  const es = (r: string) => pathname === r || pathname.startsWith(r + "/");
  if (RUTAS_LEGALES_PUBLICAS.some(es)) return "legal";
  return RUTAS_NUCLEO_PUBLICAS.some(es) ? null : "modulo";
}

const seguir = { tipo: "seguir", soloTitular: false } as const;

/**
 * Reglas de estado del tenant; iguales venga resuelto por host o por slug. La escalera de la
 * cuota impaga (los días los pone el gestor de cuenta):
 *   ACTIVO, MOROSO, MOROSO_GRAVE  todo funciona (los avisos los muestra el panel).
 *   SOLO_LECTURA                  el panel se ve y no guarda (salvo Plan y pago, y Dominios); el
 *                                 sitio y las ventas siguen.
 *   SUSPENDIDO                    además, el sitio deja de estar publicado: solo quedan las rutas
 *                                 de módulo que abren con la banda cerrada (las entradas y el
 *                                 pedido del fan). Las ventas se cortan en crearCobro.
 *   ARCHIVADO                     todo 404, salvo Plan y pago (darse de baja o volver), Pagos para
 *                                 devolver y Dominios para el titular, y lo que abra una ruta con
 *                                 la banda cerrada (la puerta de un show ya vendido).
 */
export function decidirPorEstado(
  estado: EstadoTenant,
  superficie: Superficie,
  subruta: RutaPanel["subruta"] = null,
): Decision {
  if (superficie === "publico" && subruta === "legal") return seguir;
  switch (estado) {
    case "ACTIVO":
    case "MOROSO":
    case "MOROSO_GRAVE":
      return seguir;
    case "SOLO_LECTURA":
      if (superficie === "publico" || subruta === "pago" || subruta === "dominios") return seguir;
      return { ...seguir, soloLectura: true };
    case "SUSPENDIDO":
      if (superficie === "publico") return subruta === "modulo" ? { ...seguir, bandaCerrada: true } : { tipo: "no-encontrado" };
      if (subruta === "pago" || subruta === "dominios") return { tipo: "seguir", soloTitular: true };
      return { ...seguir, soloLectura: true };
    case "ARCHIVADO":
      if (subruta === "modulo") return { ...seguir, bandaCerrada: true };
      return superficie === "panel" && (subruta === "dominios" || subruta === "pago") ? { tipo: "seguir", soloTitular: true } : { tipo: "no-encontrado" };
    default: {
      const _exhaustivo: never = estado;
      return _exhaustivo;
    }
  }
}
