import { urlArchivo } from "@/nucleo/archivos";
import { prisma } from "@/nucleo/db/cliente";
import type { PropsRutaPanel } from "@/nucleo/modulos/contrato";
import { Campo, CampoArchivo, Formulario, Insignia, Selector, Tarjeta } from "@/ui";
import { describirEspecificacion, describirMedida, medidaDeDiseno, problemasDeImpresion } from "../impresion";
import { listarDisenos } from "../productos";
import { subirDisenoAccion } from "./acciones";
import { Encabezado, puedeEditar as puedeEditarEn } from "./comun";

/** Panel · Diseños: archivos de impresión. Cada uno dice para qué productos sirve. */
export async function DisenosTienda({ tenantId, slug }: PropsRutaPanel) {
  const [disenos, bases, puedeEditar] = [
    await listarDisenos(tenantId),
    await prisma.tiendaProductoBase.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
    await puedeEditarEn(slug),
  ];
  return (
    <div className="flex flex-col gap-6">
      <Encabezado slug={slug} actual="/disenos" puedeEditar={puedeEditar} />

      <Tarjeta titulo="Qué archivo pide cada producto" descripcion="Más grande está bien; más chico, no se puede imprimir bien.">
        <ul className="flex flex-col gap-2 text-sm" data-especificaciones>
          {bases.map((b) => (
            <li key={b.id}>
              <span className="font-semibold text-primary">{b.nombre}</span> <span className="text-tertiary">· {describirEspecificacion(b)}</span>
            </li>
          ))}
        </ul>
      </Tarjeta>

      <Tarjeta titulo="Subir diseño" descripcion="PNG de alta resolución o PDF. Un diseño sirve para varios productos.">
        <Formulario accion={subirDisenoAccion.bind(null, slug)} puedeEditar={puedeEditar} etiqueta="Subir" limpiarAlGuardar>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo name="nombre" etiqueta="Nombre" placeholder="Logo gira 2026" maxLength={80} />
            <Selector
              name="paraBaseId"
              etiqueta="Revisarlo para"
              defaultValue=""
              opciones={[{ valor: "", texto: "— sin revisar ahora —" }, ...bases.map((b) => ({ valor: b.id, texto: b.nombre }))]}
            />
          </div>
          <CampoArchivo name="archivo" etiqueta="Archivo de impresión" accept="image/png,application/pdf" required />
        </Formulario>
      </Tarjeta>

      {disenos.map((d) => {
        const medida = medidaDeDiseno(d);
        return (
          <Tarjeta
            key={d.id}
            data-diseno={d.nombre}
            titulo={d.nombre}
            descripcion={describirMedida(medida)}
            imagen={
              d.conVistaPrevia ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={urlArchivo({ id: d.archivoId, nombre: d.archivoNombre }, { variante: "web", panelSlug: slug })}
                  alt=""
                  className="size-16 rounded-lg bg-secondary object-contain"
                />
              ) : (
                <div className="flex size-16 items-center justify-center rounded-lg bg-secondary text-xs font-bold text-tertiary">PDF</div>
              )
            }
          >
            <ul className="flex flex-col gap-1 text-sm">
              {bases.map((b) => {
                const problemas = problemasDeImpresion(medida, b);
                return (
                  <li key={b.id} className="flex flex-wrap items-baseline gap-2" data-compatible={problemas.length === 0 ? b.nombre : undefined}>
                    {problemas.length === 0 ? <Insignia color="exito">Sirve para {b.nombre}</Insignia> : <Insignia color="advertencia">{b.nombre}</Insignia>}
                    {problemas.length > 0 && <span className="text-tertiary">{problemas.join(" ")}</span>}
                  </li>
                );
              })}
            </ul>
          </Tarjeta>
        );
      })}
    </div>
  );
}
