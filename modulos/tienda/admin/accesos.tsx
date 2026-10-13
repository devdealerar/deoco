import Link from "next/link";
import { notFound } from "next/navigation";
import type { PropsRutaAdmin } from "@/nucleo/modulos/contrato";
import { Campo, Formulario, Insignia, Tabla, Tarjeta } from "@/ui";
import { listarProveedores } from "../catalogo";
import { accesosDeProveedor } from "../proveedor";
import { darAccesoProveedorAccion, quitarAccesoProveedorAccion } from "./acciones";

const DIA = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

/** Back office · Accesos de un proveedor a su panel (app.<raiz>/portal/tienda). */
export async function AdminAccesosProveedor({ params }: PropsRutaAdmin) {
  const proveedor = (await listarProveedores()).find((p) => p.id === params.id);
  if (!proveedor) notFound();
  const cuentas = await accesosDeProveedor(proveedor.id);
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-display-xs font-semibold text-primary">Accesos de {proveedor.nombre}</h1>
        <p className="mt-1 text-md text-tertiary">
          Quien tenga acceso ve las órdenes de este proveedor de todas las bandas, las despacha y marca lo que cobró. Nunca ve
          un panel de banda ni montos de venta.{" "}
          <Link href="/admin/m/tienda/proveedores" className="font-semibold underline">
            Proveedores
          </Link>
        </p>
      </header>
      <Tabla
        titulo="Personas con acceso"
        columnas={[
          { id: "persona", etiqueta: "Persona" },
          { id: "desde", etiqueta: "Desde" },
          { id: "acciones", etiqueta: "" },
        ]}
        filas={cuentas.map((c) => ({
          id: c.id,
          celdas: [
            <div key="p" data-acceso={c.email}>
              <div className="font-medium text-primary">{c.nombre}</div>
              <div className="text-sm text-tertiary">
                {c.email} {c.claveTemporal && <Insignia color="advertencia">Clave temporal</Insignia>}
              </div>
            </div>,
            <span key="d">{DIA.format(c.creadoEn)}</span>,
            <Formulario key="a" puedeEditar enLinea variante="peligro" accion={quitarAccesoProveedorAccion.bind(null, c.id)} etiqueta="Quitar acceso" />,
          ],
        }))}
      />
      <Tarjeta titulo="Dar acceso" descripcion="Si el email no tiene usuario, se crea con una clave temporal que se muestra una sola vez.">
        <Formulario accion={darAccesoProveedorAccion.bind(null, proveedor.id)} puedeEditar etiqueta="Dar acceso" limpiarAlGuardar>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo name="email" type="email" etiqueta="Email" required />
            <Campo name="nombre" etiqueta="Nombre" ayuda="Solo si es un usuario nuevo." maxLength={120} />
          </div>
        </Formulario>
      </Tarjeta>
    </div>
  );
}
