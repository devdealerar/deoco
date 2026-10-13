import { conTenant } from "@/nucleo/db/con-tenant";
import type { PropsRutaPanel } from "@/nucleo/modulos/contrato";
import { AreaTexto, Campo, CampoArchivo, Casilla, Formulario, Tarjeta } from "@/ui";
import { agregarDescargable, borrarDescargable, guardarPrensa } from "../acciones";
import { Encabezado, Miniatura, puedeEditar as puedeEditarEn } from "./comun";

export async function PrensaPanel({ tenantId, slug }: PropsRutaPanel) {
  const [datos, puedeEditar] = await Promise.all([
    // En serie dentro de la transacción (una sola conexión).
    conTenant(tenantId, async (tx) => ({
      perfil: await tx.sitioPerfil.findUnique({ where: { tenantId } }),
      descargables: await tx.sitioDescargable.findMany({ orderBy: { orden: "asc" } }),
      archivos: await tx.archivo.findMany({ where: { moduloId: "sitio" }, select: { id: true, nombre: true, tipo: true } }),
    })),
    puedeEditarEn(slug),
  ]);
  const archivo = (id: string | null | undefined) => datos.archivos.find((a) => a.id === id);
  const rider = archivo(datos.perfil?.riderArchivoId);

  const lista = (tipo: "FOTO" | "LOGO") => {
    const items = datos.descargables.filter((d) => d.tipo === tipo);
    if (items.length === 0) return null;
    return (
      <ul className="mb-5 divide-y divide-secondary">
        {items.map((d) => {
          const a = archivo(d.archivoId);
          return (
            <li key={d.id} className="flex items-center gap-4 py-3">
              {a && <Miniatura slug={slug} archivo={a} />}
              <div className="min-w-0 flex-1 text-sm">
                <div className="truncate font-medium text-primary">{a?.nombre}</div>
                {d.descripcion && <div className="truncate text-tertiary">{d.descripcion}</div>}
              </div>
              <Formulario puedeEditar={puedeEditar} enLinea variante="secundario" accion={borrarDescargable.bind(null, slug, d.id)} etiqueta="Quitar" />
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <Encabezado slug={slug} actual="/prensa" puedeEditar={puedeEditar} />

      <Tarjeta titulo="Textos, rider y contacto">
        <Formulario accion={guardarPrensa.bind(null, slug)} puedeEditar={puedeEditar}>
          <AreaTexto name="bioLarga" etiqueta="Bio larga" maxLength={10000} rows={10} defaultValue={datos.perfil?.bioLarga ?? ""} ayuda="Separá los párrafos con una línea en blanco." />
          <div>
            <CampoArchivo name="rider" etiqueta="Rider técnico" accept="application/pdf" ayuda={rider ? `Actual: ${rider.nombre}. Subí otro para reemplazarlo.` : "PDF."} />
            {rider && (
              <div className="mt-2">
                <Casilla name="quitarRider" etiqueta="Quitar el rider" />
              </div>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo name="prensaNombre" etiqueta="Contacto de prensa" defaultValue={datos.perfil?.prensaNombre ?? ""} maxLength={120} />
            <Campo name="prensaEmail" type="email" etiqueta="Email" defaultValue={datos.perfil?.prensaEmail ?? ""} />
            <Campo name="prensaTelefono" etiqueta="Teléfono" defaultValue={datos.perfil?.prensaTelefono ?? ""} maxLength={60} />
          </div>
        </Formulario>
      </Tarjeta>

      <Tarjeta titulo="Fotos en alta" descripcion="Se descargan en su tamaño original. En la página se muestran livianas.">
        {lista("FOTO")}
        <Formulario accion={agregarDescargable.bind(null, slug, "FOTO")} puedeEditar={puedeEditar} limpiarAlGuardar etiqueta="Agregar foto">
          <CampoArchivo name="archivo" etiqueta="Foto" accept="image/jpeg,image/png,image/webp" required ayuda="JPG, PNG o WebP, hasta 25 MB." />
          <Campo name="descripcion" etiqueta="Crédito o descripción" maxLength={200} />
        </Formulario>
      </Tarjeta>

      <Tarjeta titulo="Logos" descripcion="PNG, WebP, JPG, SVG o PDF. Los SVG y PDF se ofrecen solo como descarga.">
        {lista("LOGO")}
        <Formulario accion={agregarDescargable.bind(null, slug, "LOGO")} puedeEditar={puedeEditar} limpiarAlGuardar etiqueta="Agregar logo">
          <CampoArchivo name="archivo" etiqueta="Logo" accept="image/png,image/webp,image/jpeg,image/svg+xml,application/pdf" required />
          <Campo name="descripcion" etiqueta="Variante" placeholder="Blanco sobre transparente" maxLength={200} />
        </Formulario>
      </Tarjeta>
    </div>
  );
}
