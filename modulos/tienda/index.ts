// Módulo tienda: merch bajo demanda. La banda vende con su diseño sobre productos del
// catálogo base; el fan le paga a la banda en SU pasarela; un proveedor produce y envía.
// El dinero nunca pasa por Deoco.
import type { Modulo } from "@/nucleo/modulos/contrato";
import { AdminCatalogo } from "./admin/catalogo";
import { AdminProductoBase } from "./admin/producto";
import { AdminDeudas } from "./admin/deudas";
import { AdminProveedores } from "./admin/proveedores";
import { AdminAccesosProveedor } from "./admin/accesos";
import { avisoDePago } from "./aviso";
import { alDespacharseOrden, alPagarsePedido } from "./correos";
import { DisenosTienda } from "./panel/disenos";
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
  permisos: [
    { clave: VER, rolesPorDefecto: ["TITULAR", "EDITOR", "COMERCIAL", "PUERTA", "LECTURA"] },
    // Productos y precios: el responsable comercial es el que fija precios.
    { clave: "tienda.producto.editar", rolesPorDefecto: ["TITULAR", "EDITOR", "COMERCIAL"] },
    // Probar la conexión con la cuenta de cobro: solo el titular (ni otro rol ni el staff).
    { clave: "tienda.pasarela.conectar", rolesPorDefecto: ["TITULAR"], exclusivoTitular: true },
  ],
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
    { ruta: "/tienda/pedido/[id]", componente: PedidoPublico, metadatos: () => ({ titulo: "Pedido" }) },
    { ruta: "/tienda/[producto]", componente: FichaProducto, metadatos: metadatosFicha },
  ],
  cabeceraPublica: ContadorCarrito,
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
  tablasGlobales: ["tienda_proveedor", "tienda_producto_base"],
};

export default tienda;
