// Módulo tienda: merch bajo demanda. La banda vende con su diseño sobre productos del
// catálogo base; el fan le paga a la banda en SU pasarela; un proveedor produce y envía.
// El dinero nunca pasa por Deoco.
import { inicioTienda } from "./inicio";
import { tiendaEnCurso } from "./en-curso";
import { conciliarPedidos } from "./pagos";
import { compradorDePedido, ventasDelPeriodo } from "./pedidos";
import { PedidosDelFan, tieneTienda } from "./publico/area-fan";
import type { Modulo } from "@/nucleo/modulos/contrato";
import { buscarDatosTienda, suprimirDatosTienda } from "./datos-personales";
import { conTenant } from "@/nucleo/db/con-tenant";
import { AdminCatalogo } from "./admin/catalogo";
import { AdminProductoBase } from "./admin/producto";
import { AdminDeudas } from "./admin/deudas";
import { AdminProveedores } from "./admin/proveedores";
import { AdminAccesosProveedor } from "./admin/accesos";
import { avisoDePago } from "./aviso";
import { alDespacharseOrden, alPagarsePedido } from "./correos";
import { DisenosTienda } from "./panel/disenos";
import { LIMITE_PUBLICADOS, ajustarPublicados, contarPublicados } from "./productos";
import { EditarProducto, NuevoProducto } from "./panel/producto";
import { DeudaTienda, PedidosTienda } from "./panel/pedidos";
import { ResumenTienda } from "./panel/resumen";
import { PortalCuenta, PortalOrden, PortalOrdenes } from "./portal/paginas";
import { ContadorCarrito } from "./publico/cabecera";
import {
  CarritoPublico,
  CatalogoPublico,
  CheckoutPublico,
  FichaProducto,
  metadatosFicha,
  PedidoPublico,
} from "./publico/paginas";

const VER = "tienda.producto.ver";

const tienda: Modulo = {
  id: "tienda",
  nombre: "Tienda",
  // Rol de negocio de la tienda (el mismo que el de la ticketera: es el mismo rol).
  roles: [{ clave: "COMERCIAL", etiqueta: "Comercial", descripcion: "Maneja precios y ventas." }],
  permisos: [
    // PUERTA no: solo valida en la puerta (no ve pedidos, montos ni la deuda con proveedores).
    { clave: VER, rolesPorDefecto: ["TITULAR", "EDITOR", "COMERCIAL", "LECTURA"] },
    // Productos y precios: el responsable comercial es el que fija precios.
    { clave: "tienda.producto.editar", rolesPorDefecto: ["TITULAR", "EDITOR", "COMERCIAL"] },
    // Probar la conexión con la cuenta de cobro: solo el titular (ni otro rol ni el staff).
    { clave: "tienda.pasarela.conectar", rolesPorDefecto: ["TITULAR"], exclusivoTitular: true },
  ],
  // Uso de la banda (se ve en /admin).
  mediciones: [
    { clave: "tienda.productos", etiqueta: "Productos", medir: (t) => conTenant(t, (tx) => tx.tiendaProducto.count()) },
    { clave: "tienda.productos-publicados", etiqueta: "Productos publicados", medir: contarPublicados },
  ],
  // Archivos: el de impresión y la foto de cada producto; en el panel los ve quien ve la tienda.
  archivos: [
    { recurso: "diseno", permiso: VER },
    { recurso: "foto-producto", permiso: VER },
  ],
  // Tope de la cuenta (lo fija el plan): al pasarlo no se publica más; si baja, se despublica
  // lo último publicado.
  limites: [{ clave: LIMITE_PUBLICADOS, etiqueta: "productos publicados", usados: contarPublicados, ajustar: ajustarPublicados }],
  // Formularios del panel de la tienda (accionesDelPanel).
  edicion: { permiso: "tienda.producto.editar", ruta: "/tienda", sinPermiso: "Tu rol no puede editar la tienda." },
  rutasPanel: [
    { ruta: "/tienda", permiso: VER, componente: ResumenTienda },
    { ruta: "/tienda/disenos", permiso: VER, componente: DisenosTienda },
    { ruta: "/tienda/productos/nuevo", permiso: VER, componente: NuevoProducto },
    { ruta: "/tienda/productos/[id]", permiso: VER, componente: EditarProducto },
    { ruta: "/tienda/pedidos", permiso: VER, componente: PedidosTienda },
    { ruta: "/tienda/deuda", permiso: VER, componente: DeudaTienda },
  ],
  // Back office (solo staff): catálogo base y proveedores, iguales para todas las bandas.
  rutasAdmin: [
    { ruta: "/", componente: AdminCatalogo },
    { ruta: "/productos/[id]", componente: AdminProductoBase },
    { ruta: "/proveedores", componente: AdminProveedores },
    { ruta: "/proveedores/[id]", componente: AdminAccesosProveedor },
    { ruta: "/deudas", componente: AdminDeudas },
  ],
  // Sitio público: catálogo, ficha, carrito (en el navegador del fan), checkout.
  rutasPublicas: [
    { ruta: "/tienda", componente: CatalogoPublico, metadatos: () => ({ titulo: "Tienda" }) },
    { ruta: "/tienda/carrito", componente: CarritoPublico, metadatos: () => ({ titulo: "Carrito" }) },
    { ruta: "/tienda/checkout", componente: CheckoutPublico, metadatos: () => ({ titulo: "Checkout" }) },
    // El fan sigue viendo su pedido con la banda cerrada (las órdenes en curso se completan).
    { ruta: "/tienda/pedido/[id]", componente: PedidoPublico, metadatos: () => ({ titulo: "Pedido" }), conBandaCerrada: async () => true },
    { ruta: "/tienda/[producto]", componente: FichaProducto, metadatos: metadatosFicha },
  ],
  cabeceraPublica: { componente: ContadorCarrito, orden: 10 },
  // Panel del proveedor (cuenta externa: la da el staff), en app.<raiz>/portal/tienda.
  // La referencia de la cuenta es el id del proveedor.
  cuentasExternas: { etiqueta: "Panel de proveedor" },
  rutasExternas: [
    { ruta: "/", componente: PortalOrdenes },
    { ruta: "/ordenes/[id]", componente: PortalOrden },
    { ruta: "/cuenta", componente: PortalCuenta },
  ],
  // Aviso de pago de la pasarela (webhook), en app.<raiz>/avisos/<tenantId>/tienda/pago/<pasarela>.
  avisos: [{ ruta: "/pago/[pasarela]", metodos: ["POST", "GET"], manejador: avisoDePago }],
  eventosEmite: ["pedido.pagado", "orden.despachada"],
  // Al pagarse: mail al fan y una orden de producción por proveedor (idempotente).
  // Al despachar el proveedor: mail al fan con el seguimiento.
  eventosEscucha: [
    { evento: "pedido.pagado", manejador: alPagarsePedido },
    { evento: "orden.despachada", manejador: alDespacharseOrden },
  ],
  // Cobra con la pasarela de la banda (núcleo: @/nucleo/pagos; credenciales en Credenciales → Cobros).
  cobros: true,
  navegacion: [
    { etiqueta: "Tienda", href: "/tienda", permiso: VER, orden: 20 },
    { etiqueta: "Tienda", href: "/tienda", publica: true, orden: 30 },
    { etiqueta: "Catálogo base", href: "/", admin: true, orden: 100 },
    { etiqueta: "Proveedores", href: "/proveedores", admin: true, orden: 110 },
    { etiqueta: "Deuda con proveedores", href: "/deudas", admin: true, orden: 120 },
    { etiqueta: "Órdenes", href: "/", externa: true, orden: 10 },
    { etiqueta: "Cuenta corriente", href: "/cuenta", externa: true, orden: 20 },
  ],
  // Bloque "Tienda" del inicio del panel.
  consultas: [
    { nombre: "inicio", responder: inicioTienda },
    // Para la base de fans: quién pagó un pedido (lo pide el módulo fans al recibir pedido.pagado).
    { nombre: "comprador", responder: compradorDePedido },
    // Para el manager (D7): cuánto se vendió en un período. Solo números.
    { nombre: "ventas", responder: ventasDelPeriodo },
  ],
  // Un cambio de plan no la apaga con pedidos por pagar, en revisión o sin despachar.
  // Derechos del fan sobre sus datos (D2): lo que hay de una persona y cómo se anonimiza.
  // Área del fan (D5): sus pedidos en /mis-compras.
  areaDelFan: { orden: 20, tiene: tieneTienda, componente: PedidosDelFan },
  datosPersonales: {
    buscar: buscarDatosTienda,
    suprimir: suprimirDatosTienda,
    queRecolecta: "Si comprás en la tienda: nombre, email, teléfono y domicilio de envío (obligatorios, para mandarte el pedido) y DNI o CUIT (opcional, para la factura).",
    compartidoCon: "Con el proveedor que fabrica y envía tu pedido: solo lo necesario para hacerlo (nombre, domicilio, teléfono).",
    terminos: { titulo: "Tienda", texto: "Los productos se fabrican a pedido y los envía el proveedor que elige la banda, con su plazo y su costo de envío, que se muestran antes de pagar. El pedido sin pagar vence a los 7 días." },
  },
  enCurso: tiendaEnCurso,
  // Conciliación (los avisos se pierden) y vencimiento de los pedidos sin pagar.
  tareasPeriodicas: [{ nombre: "conciliar-pedidos", cadaSegundos: 120, correr: conciliarPedidos }],
  tablasGlobales: ["tienda_proveedor", "tienda_producto_base", "tienda_oferta"],
};

export default tienda;
