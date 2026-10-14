// Bloque del inicio del panel (consulta "comercial.inicio"): plan, vencimiento y espacio. Lo ve
// el titular (el núcleo lo decide: es el gestor de cuenta).
import { formatearBytes, usoAlmacenamiento } from "@/nucleo/archivos";
import { ZONA } from "@/nucleo/fechas";
import { cuentaDe, planEfectivo, planes } from "./cuenta";

const dia = (d: Date) => d.toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: ZONA });

export async function inicioComercial(tenantId: string) {
  const cuenta = await cuentaDe(tenantId);
  if (!cuenta) return null;
  const [plan, uso] = await Promise.all([planes().then((t) => planEfectivo(cuenta, t)), usoAlmacenamiento(tenantId)]);
  const ahora = new Date();
  const enPrueba = !!cuenta.pruebaHasta && !cuenta.pagoHasta;
  const activa = cuenta.suscripcionEstado === "activa";
  const datos = [
    { etiqueta: "Plan", valor: enPrueba ? `${plan.nombre} (prueba)` : plan.nombre },
    cuenta.moraDesde
      ? { etiqueta: "Cuota", valor: `Pendiente desde el ${dia(cuenta.moraDesde)}` }
      : { etiqueta: enPrueba ? "Prueba hasta" : "Pagado hasta", valor: enPrueba ? dia(cuenta.pruebaHasta!) : cuenta.pagoHasta ? dia(cuenta.pagoHasta) : "—" },
    { etiqueta: "Espacio", valor: `${formatearBytes(uso.usado)} de ${formatearBytes(uso.limite)}` },
  ];
  const pendientes = [];
  if (cuenta.moraDesde) pendientes.push({ texto: "No pudimos cobrar la cuota: revisá tu forma de pago.", href: "/pago" });
  else if (enPrueba && !activa && cuenta.pruebaHasta! > ahora && !cuenta.pro) {
    pendientes.push({ texto: `Elegí tu plan antes del ${dia(cuenta.pruebaHasta!)} para seguir usando el panel.`, href: "/pago" });
  }
  return { titulo: "Tu cuenta", datos, pendientes };
}
