// Cómo viaja el tenant resuelto desde el proxy hasta la app: cabeceras del
// pedido (nunca la sesión). El proxy borra cualquier x-deoco-* que venga de afuera.
export const CABECERA = {
  tenantId: "x-deoco-tenant-id",
  estado: "x-deoco-tenant-estado",
  /** "panel" (app.<raiz>/b/<slug>) o "publico" (host de la banda: sitio público). */
  superficie: "x-deoco-superficie",
  soloTitular: "x-deoco-solo-titular",
  /** Banda SUSPENDIDA o ARCHIVADA en una ruta de módulo: la decide la ruta (accesoPanel). */
  bandaCerrada: "x-deoco-banda-cerrada",
  /** La ruta del panel después de /b/<slug> ("/puerta/<id>"), para decidir con la banda cerrada. */
  rutaPanel: "x-deoco-ruta-panel",
} as const;

export const PREFIJO_CABECERAS = "x-deoco-";
