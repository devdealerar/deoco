import Link from "next/link";
import type { PropsRutaAdmin } from "@/nucleo/modulos/contrato";
import { Campo, Casilla, Formulario, Insignia, Tabla, Tarjeta } from "@/ui";
import { listarProveedores } from "../catalogo";
import { activoProveedorAccion, crearProveedorAccion, porDefectoAccion } from "./acciones";

/** Back office · Proveedores: producen y envían. Les llegan las órdenes por mail. */
export async function AdminProveedores(_: PropsRutaAdmin) {
  const proveedores = await listarProveedores();
  const enLinea = { puedeEditar: true, enLinea: true, variante: "secundario" as const };
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-display-xs font-semibold text-primary">Proveedores</h1>
        <p className="mt-1 text-md text-tertiary">
          El de la plataforma produce todo producto base sin proveedor propio.{" "}
          <Link href="/admin/m/tienda" className="font-semibold underline">Catálogo base</Link>
        </p>
      </header>
      <Tabla
        titulo="Proveedores"
        columnas={[
          { id: "proveedor", etiqueta: "Proveedor" },
          { id: "formatos", etiqueta: "Acepta" },
          { id: "estado", etiqueta: "" },
          { id: "acciones", etiqueta: "" },
        ]}
        filas={proveedores.map((p) => ({
          id: p.id,
          celdas: [
            <div key="p" data-proveedor={p.nombre}>
              <div className="font-medium text-primary">{p.nombre}</div>
              <div className="text-sm text-tertiary">
                {p.email}
                {p.contacto && ` · ${p.contacto}`}
              </div>
            </div>,
            <span key="f">{p.formatos.join(", ").toUpperCase()}</span>,
            <div key="e" className="flex gap-2">
              {p.porDefecto && <Insignia color="marca">Por defecto</Insignia>}
              {!p.activo && <Insignia>Desactivado</Insignia>}
            </div>,
            <div key="a" className="flex gap-2">
              {!p.porDefecto && p.activo && <Formulario {...enLinea} accion={porDefectoAccion.bind(null, p.id)} etiqueta="Por defecto" />}
              {!p.porDefecto && (
                <Formulario {...enLinea} accion={activoProveedorAccion.bind(null, p.id, !p.activo)} etiqueta={p.activo ? "Desactivar" : "Activar"} />
              )}
            </div>,
          ],
        }))}
      />
      <Tarjeta titulo="Nuevo proveedor" descripcion="El primero que cargues es el de la plataforma.">
        <Formulario accion={crearProveedorAccion} puedeEditar etiqueta="Cargar proveedor" limpiarAlGuardar>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo name="nombre" etiqueta="Nombre" maxLength={80} required />
            <Campo name="email" type="email" etiqueta="Mail de órdenes" ayuda="Ahí llegan las órdenes de producción." required />
            <Campo name="contacto" etiqueta="Persona de contacto" maxLength={120} />
          </div>
          <div className="flex gap-6">
            <Casilla name="formato_png" etiqueta="Acepta PNG de alta" marcada />
            <Casilla name="formato_pdf" etiqueta="Acepta PDF" marcada />
          </div>
        </Formulario>
      </Tarjeta>
    </div>
  );
}
