// Módulo ticketera: shows de la banda con entradas nominadas, cobradas con la pasarela de la
// banda (núcleo: @/nucleo/pagos; el dinero nunca pasa por Deoco), y validación en la puerta.
import { inicioTicketera } from "./inicio";
import { ticketeraEnCurso } from "./en-curso";
import { compradorDeCompra, conciliarCompras } from "./compras";
import type { Modulo } from "@/nucleo/modulos/contrato";
import { buscarDatosTicketera, suprimirDatosTicketera } from "./datos-personales";
import { conTenant } from "@/nucleo/db/con-tenant";
import { avisoDePago } from "./aviso";
import { alPagarseCompra } from "./correos";
import { proximasFechas, ventasDelPeriodo } from "./eventos";
import { EventoPanel, EventosPanel } from "./panel/paginas";
import { PuertaEvento, PuertaPanel } from "./panel/puerta";
import { puertaAbiertaConBandaCerrada, puertaDeShowAbiertaConBandaCerrada } from "./puerta";
import { AceptarTransferenciaPublica, CompraPublica, ConfirmarTransferenciaPublica, EventoPublico, FechasPublicas, metadatosEvento } from "./publico/paginas";
import { EntradasDelFan, tieneTicketera } from "./publico/area-fan";
import { vencerTransferencias } from "./transferencias";
import { LIMITE_ENTRADAS, LIMITE_SHOWS, ajustarShowsPublicados, contarEntradasDelMes, contarShowsPublicados } from "./eventos";

const VER = "ticketera.eventos.ver";
const VALIDAR = "ticketera.puerta.validar";

const ticketera: Modulo = {
  id: "ticketera",
  nombre: "Entradas",
  // Roles de negocio de la ticketera: quien valida en la puerta, y quien maneja la venta.
  roles: [
    { clave: "PUERTA", etiqueta: "Puerta", descripcion: "Valida entradas en la puerta del show." },
    { clave: "COMERCIAL", etiqueta: "Comercial", descripcion: "Maneja precios y ventas." },
  ],
  permisos: [
    { clave: VER, rolesPorDefecto: ["TITULAR", "EDITOR", "COMERCIAL", "LECTURA"] },
    { clave: "ticketera.eventos.editar", rolesPorDefecto: ["TITULAR", "EDITOR", "COMERCIAL"] },
    // La puerta: el rol PUERTA (y el titular). Solo valida: no ve compras ni datos de compradores.
    { clave: VALIDAR, rolesPorDefecto: ["TITULAR", "PUERTA"] },
  ],
  // Un cambio de plan no la apaga con shows vendidos por delante, reservas o pagos en revisión.
  // Derechos del fan sobre sus datos (D2): lo que hay de una persona y cómo se anonimiza.
  datosPersonales: {
    buscar: buscarDatosTicketera,
    suprimir: suprimirDatosTicketera,
    queRecolecta: "Si comprás entradas: nombre y email de quien compra, y nombre y documento de cada asistente (obligatorios: las entradas son nominadas y se validan en la puerta); DNI o CUIT de quien compra (opcional, para la factura).",
    terminos: { titulo: "Entradas", texto: "Las entradas son nominadas: cada una va a nombre de un asistente y tiene un código único que se valida en la puerta una sola vez. La reserva vence si no se paga a tiempo." },
  },
  enCurso: ticketeraEnCurso,
  // Conciliación: las compras sin pago se le preguntan a la pasarela (los avisos se pierden).
  tareasPeriodicas: [
    { nombre: "conciliar-compras", cadaSegundos: 120, correr: conciliarCompras },
    // Las transferencias sin aceptar a tiempo vencen (la entrada nunca cambió).
    { nombre: "vencer-transferencias", cadaSegundos: 300, correr: vencerTransferencias },
  ],
  // Área del fan (D5): sus entradas con el QR, transferir y reenviar.
  areaDelFan: { orden: 10, tiene: tieneTicketera, componente: EntradasDelFan },
  // Uso de la banda (se ve en /admin).
  mediciones: [
    { clave: "ticketera.shows", etiqueta: "Shows", medir: (t) => conTenant(t, (tx) => tx.ticketeraEvento.count()) },
    { clave: "ticketera.shows-publicados", etiqueta: "Shows publicados este mes", medir: contarShowsPublicados },
    { clave: "ticketera.entradas-del-mes", etiqueta: "Entradas vendidas este mes", medir: (t: string) => contarEntradasDelMes(t) },
    { clave: "ticketera.entradas-vendidas", etiqueta: "Entradas vendidas", medir: (t) => conTenant(t, (tx) => tx.ticketeraEntrada.count()) },
  ],
  // La foto de cada show; en el panel la ve quien ve los shows (no la puerta).
  archivos: [{ recurso: "foto-show", permiso: VER }],
  // Formularios de shows y tipos de entrada (accionesDelPanel).
  edicion: { permiso: "ticketera.eventos.editar", ruta: "/entradas", sinPermiso: "Tu rol no puede editar los shows." },
  rutasPanel: [
    { ruta: "/entradas", permiso: VER, componente: EventosPanel },
    { ruta: "/entradas/[id]", permiso: VER, componente: EventoPanel },
    // Con la banda suspendida o archivada, la puerta sigue para los shows ya vendidos que no
    // terminaron: el escaneo no se corta por la cuota (documento maestro §14).
    { ruta: "/puerta", permiso: VALIDAR, componente: PuertaPanel, conBandaCerrada: puertaAbiertaConBandaCerrada },
    { ruta: "/puerta/[id]", permiso: VALIDAR, componente: PuertaEvento, conBandaCerrada: puertaDeShowAbiertaConBandaCerrada },
  ],
  rutasPublicas: [
    { ruta: "/fechas", componente: FechasPublicas, metadatos: () => ({ titulo: "Fechas" }) },
    { ruta: "/fechas/[id]", componente: EventoPublico, metadatos: metadatosEvento },
    // Las entradas del fan siguen a la vista con la banda cerrada: la puerta sigue validando.
    { ruta: "/fechas/compra/[id]", componente: CompraPublica, metadatos: () => ({ titulo: "Tus entradas" }), conBandaCerrada: async () => true },
    // Transferir una entrada (D5): los links de los mails. También con la banda cerrada.
    { ruta: "/fechas/transferencia/confirmar", componente: ConfirmarTransferenciaPublica, metadatos: () => ({ titulo: "Transferir una entrada" }), conBandaCerrada: async () => true },
    { ruta: "/fechas/transferencia/aceptar", componente: AceptarTransferenciaPublica, metadatos: () => ({ titulo: "Tu entrada" }), conBandaCerrada: async () => true },
  ],
  navegacion: [
    { etiqueta: "Entradas", href: "/entradas", permiso: VER, orden: 25 },
    { etiqueta: "Puerta", href: "/puerta", permiso: VALIDAR, orden: 26 },
    { etiqueta: "Fechas", href: "/fechas", publica: true, orden: 15 },
  ],
  // Los QR van firmados (firma.ts): sin la clave, no se vende.
  entorno: [
    {
      variable: "DEOCO_CLAVE_QR",
      ayuda: "la clave que firma los QR de las entradas, 32 bytes en base64 (`openssl rand -base64 32`). Cambiarla invalida las entradas ya vendidas.",
      valida: (v) => Buffer.from(v, "base64").length >= 32,
    },
  ],
  // Cobra con la pasarela de la banda; el aviso llega a app.<raiz>/avisos/<banda>/ticketera/pago/<pasarela>.
  cobros: true,
  avisos: [{ ruta: "/pago/[pasarela]", metodos: ["POST", "GET"], manejador: avisoDePago }],
  eventosEmite: ["compra.pagada"],
  // Al pagarse: mail con un QR por entrada (idempotente).
  eventosEscucha: [{ evento: "compra.pagada", manejador: alPagarseCompra }],
  // Para el sitio (y cualquier módulo): las próximas fechas publicadas. Forma en eventos.ts.
  consultas: [
    { nombre: "proximas-fechas", responder: proximasFechas },
    // Bloque "Entradas" del inicio del panel.
    { nombre: "inicio", responder: inicioTicketera },
    // Para la base de fans: quién pagó una compra (lo pide el módulo fans al recibir compra.pagada).
    { nombre: "comprador", responder: compradorDeCompra },
    // Para el manager (D7): cuánto se vendió en un período. Solo números.
    { nombre: "ventas", responder: ventasDelPeriodo },
  ],
  // Tope de la cuenta (lo fija el plan): shows próximos publicados.
  limites: [
    { clave: LIMITE_SHOWS, etiqueta: "shows publicados en un mismo mes", usados: contarShowsPublicados, ajustar: ajustarShowsPublicados, porMes: true },
    // Solo mide: una venta nunca se corta por el plan. El excedente se ve en Plan y pago.
    { clave: LIMITE_ENTRADAS, etiqueta: "entradas vendidas por mes", usados: (t) => contarEntradasDelMes(t), ajustar: async () => 0, porMes: true, soloMide: true },
  ],
};

export default ticketera;
