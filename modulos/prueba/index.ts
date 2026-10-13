// Módulo de VERIFICACIÓN del núcleo, no de negocio. Sirve para las pruebas y como
// ejemplo de cómo se escribe un módulo. Apagado por defecto (sin fila en moduloTenant).
import type { Modulo } from "@/nucleo/modulos/contrato";
import { avisoDePago } from "./aviso";
import { PaginaPanel } from "./panel";
import { CabeceraPrueba, PaginaPublica } from "./publica";

// Suscripto de ejemplo, lento a propósito: demuestra que quien emite no lo espera.
// Idempotente: no hace nada que no pueda repetirse.
async function alVerificarse() {
  await new Promise((r) => setTimeout(r, 1500));
}

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
  // El lugar del carrito en la cabecera del sitio (uno solo; ver publica.tsx).
  cabeceraPublica: CabeceraPrueba,
  navegacion: [
    { etiqueta: "Prueba", href: "/prueba", permiso: "prueba.contenido.ver", orden: 900 },
    { etiqueta: "Prueba", href: "/prueba", publica: true, orden: 900 },
  ],
  // Credencial de ejemplo, como el token de una pasarela: la carga el titular.
  secretos: [{ clave: "token", etiqueta: "Token de prueba", ayuda: "Cualquier texto: sirve para verificar el núcleo." }],
  // Aviso externo de ejemplo (webhook): app.<raiz>/avisos/<tenantId>/prueba/pago
  avisos: [{ ruta: "/pago", manejador: avisoDePago }],
  eventosEmite: ["prueba.verificada"],
  eventosEscucha: [{ evento: "prueba.verificada", manejador: alVerificarse }],
};

export default prueba;
