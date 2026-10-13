import { conTenant } from "@/nucleo/db/con-tenant";
import type { PropsRutaPanel } from "@/nucleo/modulos/contrato";
import { CampoArchivo, Formulario, Selector, Tarjeta } from "@/ui";
import { guardarIdentidad } from "../acciones";
import { leerBorrador } from "../contenido";
import { FUENTES } from "../vista/estilo";
import { Encabezado, Miniatura, puedeEditar as puedeEditarEn } from "./comun";

function Color({ nombre, etiqueta, valor }: { nombre: string; etiqueta: string; valor: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-secondary">{etiqueta}</span>
      <input type="color" name={nombre} defaultValue={valor} className="h-11 w-24 cursor-pointer rounded-lg ring-1 ring-primary" />
    </label>
  );
}

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
                <label className="mt-2 flex items-center gap-2 text-sm text-secondary">
                  <input type="checkbox" name="quitarLogo" /> Quitar el logo (se muestra el nombre)
                </label>
              )}
            </div>
          </div>
          <div className="flex items-start gap-4">
            {identidad.fondo && <Miniatura slug={slug} archivo={identidad.fondo} />}
            <div className="flex-1">
              <CampoArchivo name="fondo" etiqueta="Imagen de fondo" accept="image/jpeg,image/png,image/webp" ayuda="JPG, PNG o WebP. Va detrás del logo en la home." />
              {identidad.fondo && (
                <label className="mt-2 flex items-center gap-2 text-sm text-secondary">
                  <input type="checkbox" name="quitarFondo" /> Quitar la imagen de fondo
                </label>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-6">
            <Color nombre="colorAcento" etiqueta="Color de acento" valor={identidad.colorAcento} />
            <Color nombre="colorFondo" etiqueta="Color de fondo" valor={identidad.colorFondo ?? "#111111"} />
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
