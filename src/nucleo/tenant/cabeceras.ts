// Cómo viaja el tenant resuelto desde el proxy hasta la app: cabeceras del
// pedido (nunca la sesión). El proxy borra cualquier x-deoco-* que venga de afuera.
export const CABECERA = {
  tenantId: "x-deoco-tenant-id",
  estado: "x-deoco-tenant-estado",
  /** "panel" (app.<raiz>/b/<slug>) o "sitio" (host de la banda). */
  superficie: "x-deoco-superficie",
  soloTitular: "x-deoco-solo-titular",
} as const;

export const PREFIJO_CABECERAS = "x-deoco-";
