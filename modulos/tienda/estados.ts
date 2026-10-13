// Cómo se dice cada estado del pedido, para el fan y para la banda. (Sin dependencias: lo
// usan páginas del servidor y del panel.)

type Pedido = { estado: string; estadoCobro: string | null };

/** Para el fan (página del pedido). `resultado`: lo que volvió de la pasarela (?resultado=). */
export function estadoParaFan(p: Pedido, resultado?: string | null): { titulo: string; detalle: string } {
  switch (p.estado) {
    case "PAGADO":
      return { titulo: "¡Pago recibido!", detalle: "Tu pedido pasó a producción. El proveedor lo fabrica y te lo envía." };
    case "EN_REVISION":
      return { titulo: "Estamos revisando tu pago", detalle: "Recibimos un pago que no coincide con el pedido. La banda lo revisa y te contacta." };
    case "DESPACHADO":
      return { titulo: "¡Tu pedido salió!", detalle: "El proveedor lo despachó. Te mandamos el número de seguimiento por mail." };
    case "CANCELADO":
      return { titulo: "Pedido cancelado", detalle: "Este pedido no sigue." };
  }
  if (resultado === "exito" || p.estadoCobro === "approved") {
    return { titulo: "Estamos confirmando tu pago", detalle: "Puede tardar unos minutos. Esta página se actualiza sola cuando se acredite." };
  }
  if (["in_process", "pending", "authorized", "in_mediation"].includes(p.estadoCobro ?? "") || resultado === "pendiente") {
    return { titulo: "Tu pago está pendiente", detalle: "La pasarela todavía no lo acreditó. Te avisamos por mail cuando se confirme." };
  }
  if (["rejected", "cancelled"].includes(p.estadoCobro ?? "") || resultado === "fallo") {
    return { titulo: "El pago no se completó", detalle: "No se te cobró nada. Podés intentar de nuevo." };
  }
  return { titulo: "Falta el pago", detalle: "Tu pedido está reservado hasta que pagues." };
}

/** Para la banda (panel). */
export const ESTADO_PANEL: Record<string, { texto: string; color: "gris" | "exito" | "advertencia" | "error" }> = {
  PENDIENTE: { texto: "Esperando el pago", color: "gris" },
  PAGADO: { texto: "Pagado · en producción", color: "exito" },
  EN_REVISION: { texto: "Pago a revisar", color: "error" },
  CANCELADO: { texto: "Cancelado", color: "gris" },
  DESPACHADO: { texto: "Despachado", color: "exito" },
};
