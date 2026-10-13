// Módulo sitio: home y press kit, el sitio público de la banda.
// Pantallas del panel y rutas públicas: pendientes (Paso 2, después de aprobar archivos).
import type { Modulo } from "@/nucleo/modulos/contrato";

const sitio: Modulo = {
  id: "sitio",
  nombre: "Sitio",
  permisos: [
    { clave: "sitio.contenido.editar", rolesPorDefecto: ["TITULAR", "EDITOR", "COMERCIAL"] },
    { clave: "sitio.contenido.ver", rolesPorDefecto: ["TITULAR", "EDITOR", "COMERCIAL", "PUERTA", "LECTURA"] },
  ],
};

export default sitio;
