// Módulo comercial: los planes de Deoco y la cuota mensual de cada banda. Es el gestor de cuenta
// (gestionaCuenta): traduce el plan a módulos prendidos y límites, y el pago de la cuota a un
// estado de la banda (ACTIVO, MOROSO, SUSPENDIDO; ARCHIVADO solo a mano).
//
// LA CUOTA ES LA EXCEPCIÓN A LA REGLA DEL DINERO: la banda le paga A DEOCO, en la cuenta de
// Mercado Pago de Deoco (@/nucleo/pagos/cuota, credenciales del ENTORNO, nunca de `secreto`).
// Sus tablas (comercial_*) son solo de la cuota. Las ventas de la banda no pasan por acá.
import type { Modulo } from "@/nucleo/modulos/contrato";
import { AdminCobros, AdminCuenta, AdminCuentas, AdminPlanes } from "./admin/pantallas";
import { avisoDeCuota } from "./aviso";
import { alCrearBanda, comoAmpliar, opcionesDeAlta, revisarVencimientos } from "./cuenta";
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
  },
  // Avisos de la cuenta de Mercado Pago de Deoco: app.<raiz>/avisos/plataforma/comercial/cuota/mercadopago.
  avisosPlataforma: [{ ruta: "/cuota/[pasarela]", metodos: ["POST", "GET"], manejador: avisoDeCuota }],
  // Vencimientos, mora y fin de la prueba (el barrido la corre cada 5 minutos).
  tareasPeriodicas: [{ nombre: "revisar-vencimientos", cadaSegundos: 300, correr: async (ahora) => void (await revisarVencimientos(ahora)) }],
  rutasAdmin: [
    { ruta: "/", componente: AdminCuentas },
    { ruta: "/bandas/[id]", componente: AdminCuenta },
    { ruta: "/planes", componente: AdminPlanes },
    { ruta: "/cobros", componente: AdminCobros },
  ],
  navegacion: [
    { etiqueta: "Cuentas", href: "/", admin: true, orden: 10 },
    { etiqueta: "Planes", href: "/planes", admin: true, orden: 20 },
    { etiqueta: "Cuotas fallidas", href: "/cobros", admin: true, orden: 30 },
  ],
  // Bloque "Tu cuenta" del inicio del panel.
  consultas: [{ nombre: "inicio", responder: inicioComercial }],
  tablasGlobales: ["comercial_plan", "comercial_config"],
};

export default comercial;
