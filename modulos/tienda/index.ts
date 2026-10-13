// Módulo tienda: merch bajo demanda. La banda vende con su diseño sobre productos del
// catálogo base; el fan le paga a la banda en SU pasarela; un proveedor produce y envía.
// El dinero nunca pasa por Deoco.
import type { Modulo } from "@/nucleo/modulos/contrato";
import { AdminCatalogo } from "./admin/catalogo";
import { AdminProductoBase } from "./admin/producto";
import { AdminProveedores } from "./admin/proveedores";

const tienda: Modulo = {
  id: "tienda",
  nombre: "Tienda",
  permisos: [],
  // Back office (solo staff): catálogo base y proveedores, iguales para todas las bandas.
  rutasAdmin: [
    { ruta: "/", componente: AdminCatalogo },
    { ruta: "/productos/[id]", componente: AdminProductoBase },
    { ruta: "/proveedores", componente: AdminProveedores },
  ],
  navegacion: [
    { etiqueta: "Catálogo base", href: "/", admin: true, orden: 100 },
    { etiqueta: "Proveedores", href: "/proveedores", admin: true, orden: 110 },
  ],
  tablasGlobales: ["tienda_proveedor", "tienda_producto_base"],
};

export default tienda;
