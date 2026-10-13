import Link from "next/link";
import { notFound } from "next/navigation";
import { urlArchivo } from "@/nucleo/archivos";
import { urlArchivoPlataforma } from "@/nucleo/archivos/plataforma";
import { prisma } from "@/nucleo/db/cliente";
import type { PropsRutaPanel } from "@/nucleo/modulos/contrato";
import { AreaTexto, Campo, CampoArchivo, Casilla, Formulario, Insignia, Selector, Tarjeta } from "@/ui";
import type { Opcion } from "../catalogo";
import { formatearPesos, pesosParaCampo } from "../dinero";
import { describirEspecificacion, medidaDeDiseno, problemasDeImpresion } from "../impresion";
import { ErrorTienda, listarDisenos, margen, productoDe } from "../productos";
import { actualizarProductoAccion, crearProductoAccion, publicarAccion } from "./acciones";
import { Encabezado, PanelMargen, puedeEditar as puedeEditarEn } from "./comun";

type Base = Awaited<ReturnType<typeof prisma.tiendaProductoBase.findMany>>[number];
type Producto = Awaited<ReturnType<typeof productoDe>>;

/** Campos del producto: diseño, nombre, descripción, precio, variantes ofrecidas, foto. */
async function Campos({ tenantId, base, producto }: { tenantId: string; base: Base; producto?: Producto }) {
  const disenos = (await listarDisenos(tenantId)).filter((d) => problemasDeImpresion(medidaDeDiseno(d), base).length === 0 || d.id === producto?.disenoId);
  const ofrecidas = (producto?.variantes ?? null) as Opcion[] | null;
  return (
    <div className="flex flex-col gap-4">
      <Selector
        name="disenoId"
        etiqueta="Diseño"
        defaultValue={producto?.disenoId ?? ""}
        opciones={[
          { valor: "", texto: disenos.length ? "— elegí un diseño —" : "— no hay diseños que sirvan: subí uno —" },
          ...disenos.map((d) => ({ valor: d.id, texto: d.nombre })),
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo name="nombre" etiqueta="Nombre" defaultValue={producto?.nombre ?? base.nombre} maxLength={80} required />
        <Campo name="precio" etiqueta="Precio de venta ($)" defaultValue={producto ? pesosParaCampo(producto.precio) : undefined} ayuda="Lo que paga el fan por el producto." required />
      </div>
      <AreaTexto name="descripcion" etiqueta="Descripción" defaultValue={producto?.descripcion ?? base.descripcion} rows={3} maxLength={1000} />
      {(base.opciones as Opcion[]).map((o, i) => (
        <fieldset key={o.nombre} className="flex flex-col gap-2" data-opcion={o.nombre}>
          <legend className="mb-1 text-sm font-medium text-secondary">{o.nombre} que ofrecés</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {o.valores.map((v, j) => (
              <Casilla
                key={v}
                name={`var_${i}_${j}`}
                etiqueta={v}
                marcada={ofrecidas ? (ofrecidas.find((x) => x.nombre === o.nombre)?.valores.includes(v) ?? false) : true}
              />
            ))}
          </div>
        </fieldset>
      ))}
      <CampoArchivo name="foto" etiqueta={producto?.fotoArchivoId ? "Cambiar foto" : "Foto del producto"} accept="image/jpeg,image/png,image/webp" ayuda="Si no subís una, se usa la del producto base." />
      {producto?.fotoArchivoId && <Casilla name="quitarFoto" etiqueta="Quitar la foto (usar la del producto base)" />}
    </div>
  );
}

function Foto({ slug, base, producto }: { slug: string; base: Base; producto?: Producto }) {
  const src = producto?.fotoArchivoId && producto.fotoNombre
    ? urlArchivo({ id: producto.fotoArchivoId, nombre: producto.fotoNombre }, { variante: "web", panelSlug: slug })
    : base.fotoArchivoId && base.fotoNombre
      ? urlArchivoPlataforma({ id: base.fotoArchivoId, nombre: base.fotoNombre }, { variante: "web" })
      : null;
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" data-foto className="size-24 rounded-xl bg-secondary object-cover" /> : null;
}

/** Panel · Nuevo producto: primero el producto base, después el resto. */
export async function NuevoProducto({ tenantId, slug, consulta }: PropsRutaPanel) {
  const puedeEditar = await puedeEditarEn(slug);
  const bases = await prisma.tiendaProductoBase.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } });
  const base = bases.find((b) => b.id === consulta.get("base"));
  return (
    <div className="flex flex-col gap-6">
      <Encabezado slug={slug} actual="" puedeEditar={puedeEditar} />
      {!base ? (
        <Tarjeta titulo="Nuevo producto" descripcion="Elegí el producto base. Lo produce y lo envía el proveedor.">
          <ul className="grid gap-3 sm:grid-cols-2">
            {bases.map((b) => (
              <li key={b.id}>
                <Link href={`/b/${slug}/tienda/productos/nuevo?base=${b.id}`} data-base={b.nombre} className="flex gap-4 rounded-xl p-4 ring-1 ring-secondary hover:bg-primary_hover">
                  <Foto slug={slug} base={b} />
                  <div className="text-sm">
                    <div className="text-md font-semibold text-primary">{b.nombre}</div>
                    <div className="text-tertiary">
                      Producción {formatearPesos(b.costoProduccion)} · envío {formatearPesos(b.costoEnvio)}
                    </div>
                    <div className="mt-1 text-tertiary">{describirEspecificacion(b)}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Tarjeta>
      ) : (
        <Tarjeta titulo={`Nuevo producto · ${base.nombre}`} descripcion={`Archivo de impresión: ${describirEspecificacion(base)}. Producción ${formatearPesos(base.costoProduccion)} + envío ${formatearPesos(base.costoEnvio)}: tu margen es el precio menos eso.`}>
          <Formulario accion={crearProductoAccion.bind(null, slug, base.id)} puedeEditar={puedeEditar} etiqueta="Crear (queda en borrador)">
            <Campos tenantId={tenantId} base={base} />
          </Formulario>
        </Tarjeta>
      )}
    </div>
  );
}

/** Panel · Un producto: datos, margen, y publicado o borrador. */
export async function EditarProducto({ tenantId, slug, params, consulta }: PropsRutaPanel) {
  let producto: Producto;
  try {
    producto = await productoDe(tenantId, params.id);
  } catch (e) {
    if (e instanceof ErrorTienda) notFound();
    throw e;
  }
  const puedeEditar = await puedeEditarEn(slug);
  const base = producto.productoBase;
  return (
    <div className="flex flex-col gap-6">
      <Encabezado slug={slug} actual="" puedeEditar={puedeEditar} />
      <div className="flex flex-wrap items-center gap-4">
        <Foto slug={slug} base={base} producto={producto} />
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold text-primary">{producto.nombre}</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-tertiary" data-estado-producto>
            {producto.publicado ? <Insignia color="exito">Publicado</Insignia> : <Insignia>Borrador: no se ve en la tienda</Insignia>}
            {!base.activo && <Insignia color="advertencia">{base.nombre} ya no se ofrece para productos nuevos (este sigue andando)</Insignia>}
            {consulta.get("creado") && <span>Creado.</span>}
          </div>
        </div>
        <div className="ml-auto" data-publicar>
          <Formulario
            accion={publicarAccion.bind(null, slug, producto.id, !producto.publicado)}
            puedeEditar={puedeEditar}
            variante={producto.publicado ? "secundario" : "primario"}
            etiqueta={producto.publicado ? "Pasar a borrador" : "Publicar"}
          />
        </div>
      </div>
      <PanelMargen m={margen(producto.precio, base)} />
      <Tarjeta titulo="Datos" descripcion={`${base.nombre} · archivo de impresión: ${describirEspecificacion(base)}`}>
        <Formulario accion={actualizarProductoAccion.bind(null, slug, producto.id)} puedeEditar={puedeEditar}>
          <Campos tenantId={tenantId} base={base} producto={producto} />
        </Formulario>
      </Tarjeta>
    </div>
  );
}
