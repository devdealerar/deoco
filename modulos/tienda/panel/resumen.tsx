import Link from "next/link";
import type { PropsRutaPanel } from "@/nucleo/modulos/contrato";
import { Insignia, Tabla } from "@/ui";
import { formatearPesos } from "../dinero";
import { listarProductos, margen } from "../productos";
import { Encabezado, puedeEditar as puedeEditarEn } from "./comun";

/** Panel · Tienda: los productos de la banda, con su precio y su margen. */
export async function ResumenTienda({ tenantId, slug }: PropsRutaPanel) {
  const [productos, puedeEditar] = [await listarProductos(tenantId), await puedeEditarEn(slug)];
  return (
    <div className="flex flex-col gap-6">
      <Encabezado slug={slug} actual="" puedeEditar={puedeEditar} />
      <p className="text-md text-tertiary">
        Merch bajo demanda: no hace falta stock. El fan te paga a vos, un proveedor produce y envía cada pedido.{" "}
        <strong className="text-secondary">Deoco no se lleva nada de la venta.</strong>
      </p>
      <Tabla
        titulo="Productos"
        acciones={
          puedeEditar ? (
            <Link href={`/b/${slug}/tienda/productos/nuevo`} className="rounded-lg bg-brand-solid px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-solid_hover">
              Nuevo producto
            </Link>
          ) : undefined
        }
        columnas={[
          { id: "producto", etiqueta: "Producto" },
          { id: "precio", etiqueta: "Precio" },
          { id: "margen", etiqueta: "Margen para la banda" },
          { id: "estado", etiqueta: "" },
        ]}
        filas={productos.map((p) => {
          const m = margen(p.precio, p.productoBase);
          return {
            id: p.id,
            celdas: [
              <Link key="p" href={`/b/${slug}/tienda/productos/${p.id}`} data-producto={p.nombre}>
                <div className="font-medium text-primary">{p.nombre}</div>
                <div className="text-sm text-tertiary">{p.productoBase.nombre}</div>
              </Link>,
              <span key="$" className="tabular-nums">
                {formatearPesos(p.precio)}
              </span>,
              <span key="m" className={`tabular-nums ${m.negativo ? "font-semibold text-error-primary" : ""}`}>
                {formatearPesos(m.margen)} · {m.porcentaje.toLocaleString("es-AR")}%{m.negativo && " (a pérdida)"}
              </span>,
              p.publicado ? <Insignia key="e" color="exito">Publicado</Insignia> : <Insignia key="e">Borrador</Insignia>,
            ],
          };
        })}
      />
    </div>
  );
}
