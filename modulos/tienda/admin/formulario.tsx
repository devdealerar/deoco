import { AreaTexto, Campo, CampoArchivo, Casilla, Selector } from "@/ui";
import { opcionesComoTexto, type Opcion } from "../catalogo";

type Base = {
  nombre: string;
  descripcion: string;
  opciones: unknown;
  impresionAnchoPx: number;
  impresionAltoPx: number;
  impresionDpi: number;
  impresionFormatos: string[];
  activo: boolean;
};

/** Campos de un producto base (alta y edición). En el alta (`conOferta`), también la primera oferta. */
export function CamposProductoBase({
  base,
  proveedores,
  porDefecto,
  conOferta = false,
}: {
  base?: Base;
  proveedores: { id: string; nombre: string; activo: boolean }[];
  porDefecto: string | null;
  conOferta?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo name="nombre" etiqueta="Nombre" placeholder="Remera" defaultValue={base?.nombre} maxLength={80} required />
        <CampoArchivo name="foto" etiqueta={base ? "Cambiar foto" : "Foto"} accept="image/jpeg,image/png,image/webp" ayuda="JPG, PNG o WebP." />
      </div>
      <AreaTexto name="descripcion" etiqueta="Descripción" defaultValue={base?.descripcion} rows={2} maxLength={1000} />
      <AreaTexto
        name="opciones"
        etiqueta="Variantes"
        rows={3}
        defaultValue={base ? opcionesComoTexto(base.opciones as Opcion[]) : undefined}
        ayuda='Una por línea: "Talle: S, M, L, XL" · "Color: Negro, Blanco". Vacío si no tiene.'
      />
      {conOferta && (
        <div className="grid gap-4 sm:grid-cols-4">
          <Selector
            name="proveedorId"
            etiqueta="Proveedor (primera oferta)"
            defaultValue=""
            opciones={[
              { valor: "", texto: porDefecto ? `El de la plataforma (${porDefecto})` : "El de la plataforma (no hay)" },
              ...proveedores.filter((p) => p.activo).map((p) => ({ valor: p.id, texto: p.nombre })),
            ]}
          />
          <Campo name="costoProduccion" etiqueta="Costo de producción ($)" placeholder="9000" required />
          <Campo name="costoEnvio" etiqueta="Costo de envío ($)" placeholder="3500" ayuda="Fijo, a todo el país." required />
          <Campo name="plazoDias" etiqueta="Plazo (días)" defaultValue="7" required />
        </div>
      )}
      <fieldset className="flex flex-col gap-3 rounded-lg p-4 ring-1 ring-secondary">
        <legend className="px-1 text-sm font-semibold text-secondary">Archivo de impresión que sube la banda</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo name="impresionAnchoPx" etiqueta="Ancho (px)" defaultValue={base?.impresionAnchoPx?.toString()} placeholder="4200" required />
          <Campo name="impresionAltoPx" etiqueta="Alto (px)" defaultValue={base?.impresionAltoPx?.toString()} placeholder="4800" required />
          <Campo name="impresionDpi" etiqueta="Resolución (dpi)" defaultValue={base?.impresionDpi?.toString() ?? "300"} required />
        </div>
        <div className="flex gap-6">
          <Casilla name="formato_png" etiqueta="PNG de alta" marcada={base ? base.impresionFormatos.includes("png") : true} />
          <Casilla name="formato_pdf" etiqueta="PDF" marcada={base ? base.impresionFormatos.includes("pdf") : false} />
        </div>
      </fieldset>
      {base && <Casilla name="activo" etiqueta="Activo (se puede usar en productos nuevos)" marcada={base.activo} />}
    </div>
  );
}
