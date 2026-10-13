import Link from "next/link";
import type { PropsRutaAdmin } from "@/nucleo/modulos/contrato";
import { urlArchivoPlataforma } from "@/nucleo/archivos/plataforma";
import { Formulario, Insignia, Tabla, Tarjeta } from "@/ui";
import { listarProductosBase, listarProveedores } from "../catalogo";
import { formatearPesos } from "../dinero";
import { crearProductoBaseAccion } from "./acciones";
import { CamposProductoBase } from "./formulario";

/** Back office · Catálogo base: lo que las bandas pueden vender. Igual para todas. */
export async function AdminCatalogo(_: PropsRutaAdmin) {
  const [productos, proveedores] = [await listarProductosBase(), await listarProveedores()];
  const porDefecto = proveedores.find((p) => p.porDefecto);
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-display-xs font-semibold text-primary">Catálogo base</h1>
        <p className="mt-1 text-md text-tertiary">
          Productos que las bandas pueden vender con su diseño. <Link href="/admin/m/tienda/proveedores" className="font-semibold underline">Proveedores</Link>
        </p>
      </header>
      <Tabla
        titulo="Productos base"
        columnas={[
          { id: "producto", etiqueta: "Producto" },
          { id: "costos", etiqueta: "Producción · envío" },
          { id: "proveedor", etiqueta: "Proveedor" },
          { id: "impresion", etiqueta: "Impresión" },
          { id: "estado", etiqueta: "" },
        ]}
        filas={productos.map((p) => ({
          id: p.id,
          celdas: [
            <Link key="p" href={`/admin/m/tienda/productos/${p.id}`} className="flex items-center gap-3" data-producto-base={p.nombre}>
              {p.fotoArchivoId && p.fotoNombre && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urlArchivoPlataforma({ id: p.fotoArchivoId, nombre: p.fotoNombre }, { variante: "web" })} alt="" className="size-10 rounded object-cover" />
              )}
              <span className="font-medium text-primary">{p.nombre}</span>
            </Link>,
            <span key="c">
              {formatearPesos(p.costoProduccion)} · {formatearPesos(p.costoEnvio)}
            </span>,
            <span key="v" data-proveedor>
              {p.proveedor ? p.proveedor.nombre : `${porDefecto?.nombre ?? "—"} (por defecto)`}
            </span>,
            <span key="i" className="text-sm text-tertiary">
              {p.impresionAnchoPx}×{p.impresionAltoPx} px · {p.impresionDpi} dpi · {p.impresionFormatos.join(", ").toUpperCase()}
            </span>,
            p.activo ? <Insignia key="e" color="exito">Activo</Insignia> : <Insignia key="e">Desactivado</Insignia>,
          ],
        }))}
      />
      <Tarjeta titulo="Nuevo producto base" descripcion="Los costos valen para los pedidos que se paguen desde ahora.">
        <Formulario accion={crearProductoBaseAccion} puedeEditar etiqueta="Agregar al catálogo" limpiarAlGuardar>
          <CamposProductoBase proveedores={proveedores} porDefecto={porDefecto?.nombre ?? null} />
        </Formulario>
      </Tarjeta>
    </div>
  );
}
