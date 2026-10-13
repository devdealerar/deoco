import Link from "next/link";
import type { PropsRutaPanel } from "@/nucleo/modulos/contrato";
import { puedeEnPedido } from "@/nucleo/acceso/panel";
import { Formulario, Insignia, Tabla, Tarjeta } from "@/ui";
import { formatearPesos } from "../dinero";
import tienda from "../index";
import { pasarelaLista } from "../pasarelas";
import { listarProductos, margen } from "../productos";
import { probarConexionAccion } from "./acciones";
import { Encabezado, puedeEditar as puedeEditarEn } from "./comun";

/** Panel · Tienda: los productos de la banda, con su precio y su margen. */
export async function ResumenTienda({ tenantId, slug, acceso }: PropsRutaPanel) {
  const [productos, puedeEditar, pasarela] = [await listarProductos(tenantId), await puedeEditarEn(slug), await pasarelaLista(tienda, tenantId)];
  return (
    <div className="flex flex-col gap-6">
      <Encabezado slug={slug} actual="" puedeEditar={puedeEditar} />
      {!pasarela.lista && (
        <div role="alert" data-tienda-sin-pasarela className="rounded-xl bg-error-primary p-4 text-md text-error-primary ring-1 ring-error_subtle ring-inset">
          <strong>Tu tienda no puede vender todavía.</strong> Los fans ven &quot;la tienda no está recibiendo pedidos&quot;. Falta cargar{" "}
          {pasarela.faltan.join(", ")} en{" "}
          {acceso.rol === "TITULAR" ? (
            <Link href={`/b/${slug}/credenciales`} className="font-semibold underline">
              Credenciales
            </Link>
          ) : (
            "Credenciales (lo carga el titular de la banda)"
          )}
          . El cobro va a tu cuenta de {pasarela.pasarela.nombre}: Deoco no toca la plata.
        </div>
      )}
      {pasarela.lista && (await puedeEnPedido("tienda.pasarela.conectar", `/b/${slug}/tienda`)) && (
        <Tarjeta titulo={`Cobro con ${pasarela.pasarela.nombre}`} descripcion="Los pagos de los fans entran directo a tu cuenta. Probá que sea la tuya.">
          <Formulario accion={probarConexionAccion.bind(null, slug)} puedeEditar variante="secundario" etiqueta="Probar conexión" />
        </Tarjeta>
      )}
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
