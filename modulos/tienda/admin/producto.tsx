import Link from "next/link";
import { notFound } from "next/navigation";
import type { PropsRutaAdmin } from "@/nucleo/modulos/contrato";
import { urlArchivoPlataforma } from "@/nucleo/archivos/plataforma";
import { Campo, Casilla, Formulario, Selector, Tarjeta } from "@/ui";
import { pesosParaCampo } from "@/nucleo/dinero";
import { listarProveedores } from "../catalogo";
import { prisma } from "@/nucleo/db/cliente";
import { actualizarProductoBaseAccion, borrarProductoBaseAccion, guardarOfertaAccion } from "./acciones";
import { CamposProductoBase } from "./formulario";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Back office · un producto base: editar, desactivar o borrar (si nadie lo usa). */
export async function AdminProductoBase({ params }: PropsRutaAdmin) {
  if (!UUID.test(params.id)) notFound();
  const base = await prisma.tiendaProductoBase.findUnique({ where: { id: params.id }, include: { ofertas: { include: { proveedor: true }, orderBy: { creadoEn: "asc" } } } });
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
      <Tarjeta titulo="Datos">
        <Formulario accion={actualizarProductoBaseAccion.bind(null, base.id)} puedeEditar etiqueta="Guardar">
          <CamposProductoBase base={base} proveedores={proveedores} porDefecto={porDefecto?.nombre ?? null} />
        </Formulario>
      </Tarjeta>
      <div className="flex flex-col gap-3" data-ofertas>
        <h2 className="text-lg font-semibold text-primary">Proveedores que lo ofrecen</h2>
        <p className="text-sm text-tertiary">
          La banda elige uno al crear su producto. Cambiar un costo rige para lo que se pague desde ahora (lo ya cobrado guarda su copia). Retirar una oferta: no se elige en productos nuevos; los que ya la usan siguen andando.
        </p>
        {base.ofertas.map((o) => (
          <Tarjeta key={o.id} titulo={o.proveedor.nombre}>
            <Formulario accion={guardarOfertaAccion.bind(null, base.id, o.proveedorId)} puedeEditar etiqueta="Guardar oferta">
              <div className="grid gap-4 sm:grid-cols-3">
                <Campo name="costoProduccion" etiqueta="Costo de producción ($)" defaultValue={pesosParaCampo(o.costoProduccion)} required />
                <Campo name="costoEnvio" etiqueta="Costo de envío ($)" defaultValue={pesosParaCampo(o.costoEnvio)} required />
                <Campo name="plazoDias" etiqueta="Plazo (días)" defaultValue={String(o.plazoDias)} required />
              </div>
              <Casilla name="activa" etiqueta="Activa (se puede elegir en productos nuevos)" marcada={o.activa} />
            </Formulario>
          </Tarjeta>
        ))}
        <Tarjeta titulo="Sumar un proveedor">
          <Formulario accion={guardarOfertaAccion.bind(null, base.id, null)} puedeEditar etiqueta="Sumar oferta" limpiarAlGuardar>
            <div className="grid gap-4 sm:grid-cols-4">
              <Selector
                name="proveedorId"
                etiqueta="Proveedor"
                defaultValue=""
                opciones={[
                  { valor: "", texto: "— elegí —" },
                  ...proveedores.filter((p) => p.activo && !base.ofertas.some((o) => o.proveedorId === p.id)).map((p) => ({ valor: p.id, texto: p.nombre })),
                ]}
              />
              <Campo name="costoProduccion" etiqueta="Costo de producción ($)" required />
              <Campo name="costoEnvio" etiqueta="Costo de envío ($)" required />
              <Campo name="plazoDias" etiqueta="Plazo (días)" defaultValue="7" required />
            </div>
          </Formulario>
        </Tarjeta>
      </div>
      <Tarjeta titulo="Borrar" descripcion="Solo si ninguna banda lo usó. Si alguna lo usa, desactivalo arriba.">
        <Formulario accion={borrarProductoBaseAccion.bind(null, base.id)} puedeEditar enLinea variante="peligro" etiqueta="Borrar">
          <Casilla name="confirmar" etiqueta="Confirmo borrarlo" />
        </Formulario>
      </Tarjeta>
    </div>
  );
}
