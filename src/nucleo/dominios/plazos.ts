// Plazos de los dominios comprados, en un solo lugar (los usan la lista, el vencimiento y la
// transferencia). A confirmar contra GoDaddy (docs/diseno-dominios.md §12).

/** Después de vencer, se renueva al precio de siempre durante estos días. */
export const GRACIA_DIAS = 30;
/** Después de la gracia, la recuperación del registrador (con recargo, la cotiza el staff). */
export const RECUPERACION_DIAS = 30;
/** Reglas del registro (ICANN): no se transfiere hasta 60 días después de registrarlo o cambiar el titular. */
export const BLOQUEO_TRANSFERENCIA_DIAS = 60;

const DIA = 86_400_000;
export const graciaHasta = (vencidoEn: Date) => new Date(vencidoEn.getTime() + GRACIA_DIAS * DIA);
export const transferibleDesde = (ultimoCambio: Date) => new Date(ultimoCambio.getTime() + BLOQUEO_TRANSFERENCIA_DIAS * DIA);
