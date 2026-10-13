// Módulo tienda: merch bajo demanda. La banda vende con su diseño sobre productos del
// catálogo base; el fan le paga a la banda en SU pasarela; un proveedor produce y envía.
// El dinero nunca pasa por Deoco.
import type { Modulo } from "@/nucleo/modulos/contrato";
import { AdminCatalogo } from "./admin/catalogo";
import { AdminProductoBase } from "./admin/producto";
import { AdminProveedores } from "./admin/proveedores";
import { DisenosTienda } from "./panel/disenos";
import { EditarProducto, NuevoProducto } from "./panel/producto";
import { ResumenTienda } from "./panel/resumen";
import { credencialesDeTodas } from "./pasarelas";
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
  ],
  rutasPanel: [
    { ruta: "/tienda", permiso: VER, componente: ResumenTienda },
    { ruta: "/tienda/disenos", permiso: VER, componente: DisenosTienda },
    { ruta: "/tienda/productos/nuevo", permiso: VER, componente: NuevoProducto },
    { ruta: "/tienda/productos/[id]", permiso: VER, componente: EditarProducto },
  ],
  // Back office (solo staff): catálogo base y proveedores, iguales para todas las bandas.
  rutasAdmin: [
    { ruta: "/", componente: AdminCatalogo },
    { ruta: "/productos/[id]", componente: AdminProductoBase },
    { ruta: "/proveedores", componente: AdminProveedores },
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
  // Credenciales de la pasarela de la banda (las carga el titular en Credenciales).
  secretos: credencialesDeTodas(),
  navegacion: [
    { etiqueta: "Tienda", href: "/tienda", permiso: VER, orden: 20 },
    { etiqueta: "Tienda", href: "/tienda", publica: true, orden: 30 },
    { etiqueta: "Catálogo base", href: "/", admin: true, orden: 100 },
    { etiqueta: "Proveedores", href: "/proveedores", admin: true, orden: 110 },
  ],
  tablasGlobales: ["tienda_proveedor", "tienda_producto_base"],
};

export default tienda;
