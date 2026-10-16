// Módulo ticketera: shows de la banda con entradas nominadas, cobradas con la pasarela de la
// banda (núcleo: @/nucleo/pagos; el dinero nunca pasa por Deoco), y validación en la puerta.
import { inicioTicketera } from "./inicio";
import type { Modulo } from "@/nucleo/modulos/contrato";
import { conTenant } from "@/nucleo/db/con-tenant";
import { avisoDePago } from "./aviso";
import { alPagarseCompra } from "./correos";
import { proximasFechas } from "./eventos";
import { EventoPanel, EventosPanel } from "./panel/paginas";
import { PuertaEvento, PuertaPanel } from "./panel/puerta";
import { puertaAbiertaConBandaCerrada, puertaDeShowAbiertaConBandaCerrada } from "./puerta";
import { CompraPublica, EventoPublico, FechasPublicas, metadatosEvento } from "./publico/paginas";
import { LIMITE_SHOWS, ajustarShowsPublicados, contarShowsPublicados } from "./eventos";

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
  // Uso de la banda (se ve en /admin).
  mediciones: [
    { clave: "ticketera.shows", etiqueta: "Shows", medir: (t) => conTenant(t, (tx) => tx.ticketeraEvento.count()) },
    { clave: "ticketera.shows-publicados", etiqueta: "Shows próximos publicados", medir: contarShowsPublicados },
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
  ],
  // Tope de la cuenta (lo fija el plan): shows próximos publicados.
  limites: [{ clave: LIMITE_SHOWS, etiqueta: "shows publicados", usados: contarShowsPublicados, ajustar: ajustarShowsPublicados }],
};

export default ticketera;
