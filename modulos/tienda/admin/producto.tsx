import Link from "next/link";
import { notFound } from "next/navigation";
import type { PropsRutaAdmin } from "@/nucleo/modulos/contrato";
import { urlArchivoPlataforma } from "@/nucleo/archivos/plataforma";
import { Casilla, Formulario, Tarjeta } from "@/ui";
import { listarProveedores } from "../catalogo";
import { prisma } from "@/nucleo/db/cliente";
import { actualizarProductoBaseAccion, borrarProductoBaseAccion } from "./acciones";
import { CamposProductoBase } from "./formulario";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Back office · un producto base: editar, desactivar o borrar (si nadie lo usa). */
export async function AdminProductoBase({ params }: PropsRutaAdmin) {
  if (!UUID.test(params.id)) notFound();
  const base = await prisma.tiendaProductoBase.findUnique({ where: { id: params.id } });
  if (!base) notFound();
  const proveedores = await listarProveedores();
  const porDefecto = proveedores.find((p) => p.porDefecto);
  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/m/tienda" className="text-sm font-semibold text-tertiary hover:text-secondary">
        ← Catálogo base
      </Link>
      <header className="flex items-center gap-4">
        {base.fotoArchivoId && base.fotoNombre && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={urlArchivoPlataforma({ id: base.fotoArchivoId, nombre: base.fotoNombre }, { variante: "web" })} alt="" className="size-16 rounded-lg object-cover" />
        )}
        <h1 className="text-display-xs font-semibold text-primary">{base.nombre}</h1>
      </header>
      <Tarjeta titulo="Datos" descripcion="Cambiar los costos no cambia lo que ya se vendió: cada pedido pagado guarda su copia.">
        <Formulario accion={actualizarProductoBaseAccion.bind(null, base.id)} puedeEditar etiqueta="Guardar">
          <CamposProductoBase base={base} proveedores={proveedores} porDefecto={porDefecto?.nombre ?? null} />
        </Formulario>
      </Tarjeta>
      <Tarjeta titulo="Borrar" descripcion="Solo si ninguna banda lo usó. Si alguna lo usa, desactivalo arriba.">
        <Formulario accion={borrarProductoBaseAccion.bind(null, base.id)} puedeEditar enLinea variante="peligro" etiqueta="Borrar">
          <Casilla name="confirmar" etiqueta="Confirmo borrarlo" />
        </Formulario>
      </Tarjeta>
    </div>
  );
}
