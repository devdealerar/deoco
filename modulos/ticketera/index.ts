// Módulo ticketera: shows de la banda con entradas nominadas, cobradas con la pasarela de la
// banda (núcleo: @/nucleo/pagos; el dinero nunca pasa por Deoco), y validación en la puerta.
import { inicioTicketera } from "./inicio";
import type { Modulo } from "@/nucleo/modulos/contrato";
import { avisoDePago } from "./aviso";
import { alPagarseCompra } from "./correos";
import { proximasFechas } from "./eventos";
import { EventoPanel, EventosPanel } from "./panel/paginas";
import { PuertaEvento, PuertaPanel } from "./panel/puerta";
import { CompraPublica, EventoPublico, FechasPublicas, metadatosEvento } from "./publico/paginas";
import { LIMITE_SHOWS, ajustarShowsPublicados, contarShowsPublicados } from "./eventos";

const VER = "ticketera.eventos.ver";
const VALIDAR = "ticketera.puerta.validar";

const ticketera: Modulo = {
  id: "ticketera",
  nombre: "Entradas",
  permisos: [
    { clave: VER, rolesPorDefecto: ["TITULAR", "EDITOR", "COMERCIAL", "LECTURA"] },
    { clave: "ticketera.eventos.editar", rolesPorDefecto: ["TITULAR", "EDITOR", "COMERCIAL"] },
    // La puerta: el rol PUERTA (y el titular). Solo valida: no ve compras ni datos de compradores.
    { clave: VALIDAR, rolesPorDefecto: ["TITULAR", "PUERTA"] },
  ],
  // Formularios de shows y tipos de entrada (accionesDelPanel).
  edicion: { permiso: "ticketera.eventos.editar", ruta: "/entradas", sinPermiso: "Tu rol no puede editar los shows." },
  rutasPanel: [
    { ruta: "/entradas", permiso: VER, componente: EventosPanel },
    { ruta: "/entradas/[id]", permiso: VER, componente: EventoPanel },
    { ruta: "/puerta", permiso: VALIDAR, componente: PuertaPanel },
    { ruta: "/puerta/[id]", permiso: VALIDAR, componente: PuertaEvento },
  ],
  rutasPublicas: [
    { ruta: "/fechas", componente: FechasPublicas, metadatos: () => ({ titulo: "Fechas" }) },
    { ruta: "/fechas/[id]", componente: EventoPublico, metadatos: metadatosEvento },
    { ruta: "/fechas/compra/[id]", componente: CompraPublica, metadatos: () => ({ titulo: "Tus entradas" }) },
  ],
  navegacion: [
    { etiqueta: "Entradas", href: "/entradas", permiso: VER, orden: 25 },
    { etiqueta: "Puerta", href: "/puerta", permiso: VALIDAR, orden: 26 },
    { etiqueta: "Fechas", href: "/fechas", publica: true, orden: 15 },
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
