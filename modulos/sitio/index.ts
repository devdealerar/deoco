// Módulo sitio: home y press kit, el sitio público de la banda.
// Borrador (tablas sitio_*) → publicar → sitio_publicacion (lo que ve el público).
import { inicioSitio } from "./inicio";
import type { Modulo } from "@/nucleo/modulos/contrato";
import { HomePanel } from "./panel/home";
import { Identidad } from "./panel/identidad";
import { PrensaPanel } from "./panel/prensa";
import { Resumen } from "./panel/resumen";
import { VistaPreviaHome, VistaPreviaPrensa } from "./panel/vista-previa";
import { HomePublica, MarcoPublicoSitio, metadatosDelSitio, metadatosPrensa, PrensaPublica } from "./publico";

const VER = "sitio.contenido.ver";

const sitio: Modulo = {
  id: "sitio",
  nombre: "Sitio",
  permisos: [
    { clave: "sitio.contenido.editar", rolesPorDefecto: ["TITULAR", "EDITOR", "COMERCIAL"] },
    { clave: VER, rolesPorDefecto: ["TITULAR", "EDITOR", "COMERCIAL", "PUERTA", "LECTURA"] },
  ],
  // Formularios del panel del sitio (accionesDelPanel): todo lo que se guarda va al borrador.
  edicion: { permiso: "sitio.contenido.editar", ruta: "/sitio", sinPermiso: "Tu rol no puede editar el sitio.", guardado: "Guardado en el borrador." },
  rutasPanel: [
    { ruta: "/sitio", permiso: VER, componente: Resumen },
    { ruta: "/sitio/identidad", permiso: VER, componente: Identidad },
    { ruta: "/sitio/home", permiso: VER, componente: HomePanel },
    { ruta: "/sitio/prensa", permiso: VER, componente: PrensaPanel },
    { ruta: "/sitio/vista-previa", permiso: VER, componente: VistaPreviaHome },
    { ruta: "/sitio/vista-previa/prensa", permiso: VER, componente: VistaPreviaPrensa },
  ],
  rutasPublicas: [
    { ruta: "/", componente: HomePublica },
    { ruta: "/prensa", componente: PrensaPublica, metadatos: metadatosPrensa },
  ],
  navegacion: [
    { etiqueta: "Sitio", href: "/sitio", permiso: VER, orden: 10 },
    { etiqueta: "Home", href: "/", publica: true, orden: 10 },
    { etiqueta: "Press kit", href: "/prensa", publica: true, orden: 20 },
  ],
  // Bloque "Sitio" del inicio del panel.
  consultas: [{ nombre: "inicio", responder: inicioSitio }],
  marcoPublico: MarcoPublicoSitio,
  metadatosPublicos: metadatosDelSitio,
};

export default sitio;
