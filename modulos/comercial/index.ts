// Módulo comercial: los planes de Deoco y la cuota mensual de cada banda. Es el gestor de cuenta
// (gestionaCuenta): traduce el plan a módulos prendidos y límites, y el pago de la cuota a un
// estado de la banda (ACTIVO, MOROSO, SUSPENDIDO; ARCHIVADO solo a mano).
//
// LA CUOTA ES LA EXCEPCIÓN A LA REGLA DEL DINERO: la banda le paga A DEOCO, en la cuenta de
// Mercado Pago de Deoco (@/nucleo/pagos/cuota, credenciales del ENTORNO, nunca de `secreto`).
// Sus tablas (comercial_*) son solo de la cuota. Las ventas de la banda no pasan por acá.
import type { Modulo } from "@/nucleo/modulos/contrato";
import { AdminCobros, AdminCuenta, AdminCuentas, AdminPlanes } from "./admin/pantallas";
import { AdminDominios } from "./admin/dominios";
import { avisoDeCuota, avisoDeDominio } from "./aviso";
import { alCrearBanda, comoAmpliar, opcionesDeAlta, revisarVencimientos } from "./cuenta";
import { alertasDeDominios, cobrarDominio, pedirDevolucion, precioDominio, revisarDominios } from "./dominios";
import { inicioComercial } from "./inicio";
import { PantallaPago } from "./panel/pago";

const comercial: Modulo = {
  id: "comercial",
  nombre: "Comercial",
  // Plan y pago es del titular (ruta del núcleo /pago, exigirTitular): no hay permisos propios.
  permisos: [],
  gestionaCuenta: {
    alCrearBanda: (tenantId, _origen, opcion) => alCrearBanda(tenantId, opcion),
    opcionesDeAlta,
    pantallaPago: PantallaPago,
    comoAmpliar,
    // Dominios comprados en Deoco: misma cuenta de Deoco, pero aparte de la cuota (./dominios.ts).
    dominios: { precio: precioDominio, cobrar: cobrarDominio, devolver: pedirDevolucion },
  },
  // Avisos de la cuenta de Mercado Pago de Deoco: app.<raiz>/avisos/plataforma/comercial/cuota/mercadopago.
  // Y, aparte, los pagos de dominios: …/avisos/plataforma/comercial/dominio/mercadopago (la URL va en cada cobro).
  avisosPlataforma: [
    { ruta: "/cuota/[pasarela]", metodos: ["POST", "GET"], manejador: avisoDeCuota },
    { ruta: "/dominio/[pasarela]", metodos: ["POST", "GET"], manejador: avisoDeDominio },
  ],
  // Vencimientos, mora y fin de la prueba (el barrido la corre cada 5 minutos).
  tareasPeriodicas: [
    { nombre: "revisar-vencimientos", cadaSegundos: 300, correr: async (ahora) => void (await revisarVencimientos(ahora)) },
    // Pagos de dominios (por si un aviso se perdió), compras por arrancar y devoluciones.
    { nombre: "revisar-dominios", cadaSegundos: 60, correr: revisarDominios },
  ],
  // Devoluciones que no salen, arriba de todo el back office.
  alertasAdmin: () => alertasDeDominios(),
  rutasAdmin: [
    { ruta: "/", componente: AdminCuentas },
    { ruta: "/bandas/[id]", componente: AdminCuenta },
    { ruta: "/planes", componente: AdminPlanes },
    { ruta: "/cobros", componente: AdminCobros },
    { ruta: "/dominios", componente: AdminDominios },
  ],
  navegacion: [
    { etiqueta: "Cuentas", href: "/", admin: true, orden: 10 },
    { etiqueta: "Planes", href: "/planes", admin: true, orden: 20 },
    { etiqueta: "Cuotas fallidas", href: "/cobros", admin: true, orden: 30 },
    { etiqueta: "Dominios: precios y pagos", href: "/dominios", admin: true, orden: 40 },
  ],
  // Bloque "Tu cuenta" del inicio del panel.
  consultas: [{ nombre: "inicio", responder: inicioComercial }],
  tablasGlobales: ["comercial_plan", "comercial_config", "comercial_dominio_precio"],
};

export default comercial;
