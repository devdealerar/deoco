import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

function cx(...clases: (string | false | undefined)[]) {
  return clases.filter(Boolean).join(" ");
}

type VarianteBoton = "primario" | "secundario" | "peligro" | "enlace";
const VARIANTES: Record<VarianteBoton, string> = {
  primario: "bg-brand-solid text-white shadow-xs hover:bg-brand-solid_hover",
  secundario: "bg-primary text-secondary ring-1 ring-primary ring-inset shadow-xs hover:bg-primary_hover",
  peligro: "bg-error-solid text-white shadow-xs hover:bg-error-solid_hover",
  enlace: "text-brand-secondary hover:text-brand-secondary_hover px-0",
};

export function Boton({
  variante = "primario",
  tamano = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteBoton; tamano?: "sm" | "md" }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        tamano === "sm" ? "px-3 py-2 text-sm" : "px-3.5 py-2.5 text-sm",
        VARIANTES[variante],
        className,
      )}
    />
  );
}

const CLASE_CAMPO =
  "w-full rounded-lg bg-primary px-3.5 py-2.5 text-md text-primary shadow-xs ring-1 ring-primary ring-inset placeholder:text-placeholder focus:ring-2 focus:ring-brand focus:outline-none disabled:bg-secondary disabled:text-tertiary";

function Etiqueta({ texto, ayuda, children }: { texto: string; ayuda?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-secondary">{texto}</span>
      {children}
      {ayuda && <span className="text-sm text-tertiary">{ayuda}</span>}
    </label>
  );
}

export function Campo({ etiqueta, ayuda, ...props }: InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; ayuda?: string }) {
  return (
    <Etiqueta texto={etiqueta} ayuda={ayuda}>
      <input {...props} className={cx(CLASE_CAMPO, props.className)} />
    </Etiqueta>
  );
}

export function AreaTexto({
  etiqueta,
  ayuda,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { etiqueta: string; ayuda?: string }) {
  return (
    <Etiqueta texto={etiqueta} ayuda={ayuda}>
      <textarea {...props} className={cx(CLASE_CAMPO, "min-h-28", props.className)} />
    </Etiqueta>
  );
}

export function Selector({
  etiqueta,
  opciones,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { etiqueta: string; opciones: { valor: string; texto: string }[] }) {
  return (
    <Etiqueta texto={etiqueta}>
      <select {...props} className={CLASE_CAMPO}>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </Etiqueta>
  );
}

export function CampoArchivo({
  etiqueta,
  ayuda,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; ayuda?: string }) {
  return (
    <Etiqueta texto={etiqueta} ayuda={ayuda}>
      <input
        type="file"
        {...props}
        className="block w-full text-sm text-tertiary file:mr-3 file:rounded-lg file:border-0 file:bg-brand-primary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-secondary hover:file:bg-brand-primary_alt"
      />
    </Etiqueta>
  );
}

export function Tarjeta({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-primary p-6 shadow-xs ring-1 ring-secondary ring-inset">
      <header className="mb-5">
        <h2 className="text-lg font-semibold text-primary">{titulo}</h2>
        {descripcion && <p className="mt-1 text-sm text-tertiary">{descripcion}</p>}
      </header>
      {children}
    </section>
  );
}

type ColorInsignia = "gris" | "marca" | "exito" | "advertencia" | "error";
const INSIGNIAS: Record<ColorInsignia, string> = {
  gris: "bg-secondary text-secondary ring-secondary",
  marca: "bg-brand-primary text-brand-secondary ring-brand",
  exito: "bg-success-primary text-success-primary ring-secondary",
  advertencia: "bg-warning-primary text-warning-primary ring-secondary",
  error: "bg-error-primary text-error-primary ring-error",
};

export function Insignia({ color = "gris", children }: { color?: ColorInsignia; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium ring-1 ring-inset", INSIGNIAS[color])}>
      {children}
    </span>
  );
}

export { Formulario, type EstadoFormulario } from "./formulario";
