import { conTenant } from "@/nucleo/db/con-tenant";
import type { PropsRutaPanel } from "@/nucleo/modulos/contrato";
import { CampoArchivo, CampoColor, Casilla, Formulario, Selector, Tarjeta } from "@/ui";
import { guardarIdentidad } from "../acciones";
import { leerBorrador } from "../contenido";
import { FUENTES } from "../vista/estilo";
import { Encabezado, Miniatura, puedeEditar as puedeEditarEn } from "./comun";

export async function Identidad({ tenantId, slug }: PropsRutaPanel) {
  const [c, puedeEditar] = await Promise.all([conTenant(tenantId, (tx) => leerBorrador(tx, tenantId)), puedeEditarEn(slug)]);
  const { identidad } = c;
  return (
    <div className="flex flex-col gap-6">
      <Encabezado slug={slug} actual="/identidad" puedeEditar={puedeEditar} />
      <Tarjeta titulo="Identidad visual" descripcion="El sitio se arma con esto: logo, colores y tipografía.">
        <Formulario accion={guardarIdentidad.bind(null, slug)} puedeEditar={puedeEditar}>
          <div className="flex items-start gap-4">
            {identidad.logo && <Miniatura slug={slug} archivo={identidad.logo} />}
            <div className="flex-1">
              <CampoArchivo name="logo" etiqueta="Logo" accept="image/png,image/webp" ayuda="PNG o WebP, idealmente con fondo transparente." />
              {identidad.logo && (
                <div className="mt-2">
                  <Casilla name="quitarLogo" etiqueta="Quitar el logo (se muestra el nombre)" />
                </div>
              )}
            </div>
          </div>
          <div className="flex items-start gap-4">
            {identidad.fondo && <Miniatura slug={slug} archivo={identidad.fondo} />}
            <div className="flex-1">
              <CampoArchivo name="fondo" etiqueta="Imagen de fondo" accept="image/jpeg,image/png,image/webp" ayuda="JPG, PNG o WebP. Va detrás del logo en la home." />
              {identidad.fondo && (
                <div className="mt-2">
                  <Casilla name="quitarFondo" etiqueta="Quitar la imagen de fondo" />
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-6">
            <CampoColor name="colorAcento" etiqueta="Color de acento" defaultValue={identidad.colorAcento} />
            <CampoColor name="colorFondo" etiqueta="Color de fondo" defaultValue={identidad.colorFondo ?? "#111111"} />
          </div>
          <Selector
            name="tipografia"
            etiqueta="Tipografía"
            defaultValue={identidad.tipografia}
            opciones={Object.entries(FUENTES).map(([valor, f]) => ({ valor, texto: f.nombre }))}
          />
        </Formulario>
      </Tarjeta>
    </div>
  );
}
