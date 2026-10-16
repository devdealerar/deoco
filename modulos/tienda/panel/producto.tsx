import Link from "next/link";
import { notFound } from "next/navigation";
import { urlArchivo } from "@/nucleo/archivos";
import { urlArchivoPlataforma } from "@/nucleo/archivos/plataforma";
import { prisma } from "@/nucleo/db/cliente";
import type { PropsRutaPanel } from "@/nucleo/modulos/contrato";
import { AreaTexto, Campo, CampoArchivo, Casilla, Formulario, Insignia, Selector, Tarjeta } from "@/ui";
import type { Opcion } from "../catalogo";
import { formatearPesos, pesosParaCampo } from "@/nucleo/dinero";
import { FECHA_CORTA } from "@/nucleo/fechas";
import { describirEspecificacion, medidaDeDiseno, problemasDeImpresion } from "../impresion";
import { ofertasDe } from "../catalogo";
import { ErrorTienda, historialDeArte, listarDisenos, margen, productoDe, tieneVentas } from "../productos";
import { actualizarProductoAccion, crearProductoAccion, duplicarProductoAccion, publicarAccion } from "./acciones";
import { Encabezado, PanelMargen, puedeEditar as puedeEditarEn } from "./comun";

type Base = Awaited<ReturnType<typeof prisma.tiendaProductoBase.findMany>>[number];
type Producto = Awaited<ReturnType<typeof productoDe>>;

type Ofertas = Awaited<ReturnType<typeof ofertasDe>>;
const textoOferta = (o: { proveedor: { nombre: string }; costoProduccion: number; costoEnvio: number; plazoDias: number }) =>
  `${o.proveedor.nombre} · producción ${formatearPesos(o.costoProduccion)} · envío ${formatearPesos(o.costoEnvio)} · ${o.plazoDias} días`;

/**
 * Quién lo produce (documento maestro §7: lo elige la banda). Con pedidos pagados queda fijo: para
 * cambiarlo se duplica el producto.
 */
function Proveedor({ ofertas, producto, vendido }: { ofertas: Ofertas; producto?: Producto; vendido: boolean }) {
  if (producto && vendido) {
    return (
      <div className="flex flex-col gap-1" data-proveedor-fijo>
        <input type="hidden" name="proveedorId" value={producto.proveedorId} />
        <span className="text-sm font-medium text-secondary">Proveedor</span>
        <span className="text-md text-primary">{textoOferta(producto.oferta)}</span>
        <span className="text-sm text-tertiary">Tiene pedidos pagados: el proveedor queda fijo. Para usar otro, duplicá el producto y elegilo en la copia.</span>
      </div>
    );
  }
  const opciones = ofertas.map((o) => ({ valor: o.proveedorId, texto: textoOferta(o) }));
  if (producto && !ofertas.some((o) => o.proveedorId === producto.proveedorId)) {
    opciones.unshift({ valor: producto.proveedorId, texto: `${textoOferta(producto.oferta)} (ya no lo ofrece para productos nuevos)` });
  }
  return (
    <Selector
      name="proveedorId"
      etiqueta="Proveedor"
      defaultValue={producto?.proveedorId ?? (ofertas.length === 1 ? ofertas[0].proveedorId : "")}
      opciones={[...(producto || ofertas.length === 1 ? [] : [{ valor: "", texto: "— elegí el proveedor —" }]), ...opciones]}
    />
  );
}

/** Campos del producto: proveedor, diseño, nombre, descripción, precio, variantes ofrecidas, foto. */
async function Campos({ tenantId, base, producto, vendido = false }: { tenantId: string; base: Base; producto?: Producto; vendido?: boolean }) {
  const ofertas = await ofertasDe(base.id);
  const disenos = (await listarDisenos(tenantId)).filter((d) => problemasDeImpresion(medidaDeDiseno(d), base).length === 0 || d.id === producto?.disenoId);
  // El arte actual puede ser una versión de este producto (no está en la biblioteca): va primero.
  if (producto && !disenos.some((d) => d.id === producto.disenoId)) disenos.unshift({ ...producto.diseno, nombre: `${producto.diseno.nombre} (el actual)` });
  const ofrecidas = (producto?.variantes ?? null) as Opcion[] | null;
  return (
    <div className="flex flex-col gap-4">
      <Proveedor ofertas={ofertas} producto={producto} vendido={vendido} />
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
  // Solo los que algún proveedor ofrece hoy.
  const bases = await prisma.tiendaProductoBase.findMany({
    where: { activo: true, ofertas: { some: { activa: true, proveedor: { activo: true } } } },
    orderBy: { nombre: "asc" },
    include: { ofertas: { where: { activa: true, proveedor: { activo: true } }, select: { costoProduccion: true } } },
  });
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
                    <div className="text-tertiary" data-ofertas={b.ofertas.length}>
                      {b.ofertas.length === 1 ? "1 proveedor" : `${b.ofertas.length} proveedores`} · producción desde{" "}
                      {formatearPesos(Math.min(...b.ofertas.map((o) => o.costoProduccion)))}
                    </div>
                    <div className="mt-1 text-tertiary">{describirEspecificacion(b)}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Tarjeta>
      ) : (
        <Tarjeta titulo={`Nuevo producto · ${base.nombre}`} descripcion={`Archivo de impresión: ${describirEspecificacion(base)}. Elegí quién lo produce: tu margen es el precio menos su costo de producción, y el envío lo paga el fan aparte.`}>
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
            {consulta.get("duplicado") && <span>Duplicado: es una copia en borrador. Cambiá lo que quieras y publicala.</span>}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {base.activo && (
            <div data-duplicar>
              <Formulario accion={duplicarProductoAccion.bind(null, slug, producto.id)} puedeEditar={puedeEditar} variante="secundario" etiqueta="Duplicar" />
            </div>
          )}
          <div data-publicar>
            <Formulario
              accion={publicarAccion.bind(null, slug, producto.id, !producto.publicado)}
              puedeEditar={puedeEditar}
              variante={producto.publicado ? "secundario" : "primario"}
              etiqueta={producto.publicado ? "Pasar a borrador" : "Publicar"}
            />
          </div>
        </div>
      </div>
      <PanelMargen m={margen(producto.precio, producto.oferta)} envio={producto.oferta.costoEnvio} />
      <HistorialArte tenantId={tenantId} productoId={producto.id} />
      <Tarjeta titulo="Datos" descripcion={`${base.nombre} · archivo de impresión: ${describirEspecificacion(base)}`}>
        <Formulario accion={actualizarProductoAccion.bind(null, slug, producto.id)} puedeEditar={puedeEditar}>
          <Campos tenantId={tenantId} base={base} producto={producto} vendido={await tieneVentas(tenantId, producto.id)} />
        </Formulario>
      </Tarjeta>
    </div>
  );
}

/** Las artes que tuvo el producto: el arte vendido no se pisa nunca (cada pedido conserva el suyo). */
async function HistorialArte({ tenantId, productoId }: { tenantId: string; productoId: string }) {
  const artes = await historialDeArte(tenantId, productoId);
  return (
    <Tarjeta titulo="Historial del arte" descripcion="Si cambiás el arte de un producto ya vendido, se crea una versión nueva: cada pedido conserva el arte con que se compró.">
      <ul className="flex flex-col gap-2 text-md" data-historial-arte>
        {artes.map((a) => (
          <li key={a.disenoId} className="flex flex-wrap items-baseline gap-x-3" data-arte={a.archivoNombre}>
            <span className="font-medium text-primary">{a.nombre}</span>
            <span className="text-sm text-tertiary">{a.archivoNombre}</span>
            <span className="text-sm text-tertiary">desde el {FECHA_CORTA.format(a.desde)}</span>
            <span className="text-sm text-tertiary" data-pedidos>
              {a.pedidos === 1 ? "1 pedido" : `${a.pedidos} pedidos`}
            </span>
            {a.actual && <Insignia color="exito">Actual</Insignia>}
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}
