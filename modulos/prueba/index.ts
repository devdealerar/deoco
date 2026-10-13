// Módulo de VERIFICACIÓN del núcleo, no de negocio. Sirve para las pruebas y como
// ejemplo de cómo se escribe un módulo. Apagado por defecto (sin fila en moduloTenant).
import type { Modulo } from "@/nucleo/modulos/contrato";
import { PaginaPanel } from "./panel";
import { PaginaPublica } from "./publica";

const prueba: Modulo = {
  id: "prueba",
  nombre: "Módulo de prueba",
  permisos: [
    { clave: "prueba.contenido.ver", rolesPorDefecto: ["TITULAR", "EDITOR"] },
    // Exclusivo del titular, como la pasarela de cobro: ni otros roles ni el staff.
    { clave: "prueba.pasarela.conectar", rolesPorDefecto: ["TITULAR"], exclusivoTitular: true },
  ],
  rutasPanel: [{ ruta: "/prueba", permiso: "prueba.contenido.ver", componente: PaginaPanel }],
  rutasPublicas: [{ ruta: "/prueba", componente: PaginaPublica }],
  navegacion: [
    { etiqueta: "Prueba", href: "/prueba", permiso: "prueba.contenido.ver", orden: 900 },
    { etiqueta: "Prueba", href: "/prueba", publica: true, orden: 900 },
  ],
};

export default prueba;
