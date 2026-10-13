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
  navegacion: [
    { etiqueta: "Tienda", href: "/tienda", permiso: VER, orden: 20 },
    { etiqueta: "Catálogo base", href: "/", admin: true, orden: 100 },
    { etiqueta: "Proveedores", href: "/proveedores", admin: true, orden: 110 },
  ],
  tablasGlobales: ["tienda_proveedor", "tienda_producto_base"],
};

export default tienda;
