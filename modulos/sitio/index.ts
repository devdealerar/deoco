// Módulo sitio: home y press kit, el sitio público de la banda.
// Borrador (tablas sitio_*) → publicar → sitio_publicacion (lo que ve el público).
import type { Modulo } from "@/nucleo/modulos/contrato";
import { HomePanel } from "./panel/home";
import { Identidad } from "./panel/identidad";
import { PrensaPanel } from "./panel/prensa";
import { Resumen } from "./panel/resumen";
import { VistaPreviaHome, VistaPreviaPrensa } from "./panel/vista-previa";
import { HomePublica, MarcoPublicoSitio, PrensaPublica } from "./publico";

const VER = "sitio.contenido.ver";

const sitio: Modulo = {
  id: "sitio",
  nombre: "Sitio",
  permisos: [
    { clave: "sitio.contenido.editar", rolesPorDefecto: ["TITULAR", "EDITOR", "COMERCIAL"] },
    { clave: VER, rolesPorDefecto: ["TITULAR", "EDITOR", "COMERCIAL", "PUERTA", "LECTURA"] },
  ],
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
    { ruta: "/prensa", componente: PrensaPublica },
  ],
  navegacion: [
    { etiqueta: "Sitio", href: "/sitio", permiso: VER, orden: 10 },
    { etiqueta: "Home", href: "/", publica: true, orden: 10 },
    { etiqueta: "Press kit", href: "/prensa", publica: true, orden: 20 },
  ],
  marcoPublico: MarcoPublicoSitio,
};

export default sitio;
