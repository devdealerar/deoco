"use client";

// Kit del panel. Cada export envuelve un componente OFICIAL de Untitled UI
// (src/components, instalados con `untitledui add`) con la interfaz en castellano que
// usan las pantallas de los módulos. Excepciones (sin equivalente oficial que sirva),
// ver README.md: CampoArchivo, Tarjeta y Copiable.
import { type ReactNode, useState } from "react";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Table, TableCard } from "@/components/application/table/table";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { useDeshabilitado } from "./contexto";

type VarianteBoton = "primario" | "secundario" | "peligro" | "enlace";
const COLOR_BOTON = {
  primario: "primary",
  secundario: "secondary",
  peligro: "primary-destructive",
  enlace: "link-color",
} as const;

export function Boton({
  variante = "primario",
  tamano = "sm",
  type = "button",
  disabled,
  children,
}: {
  variante?: VarianteBoton;
  tamano?: "sm" | "md";
  type?: "button" | "submit";
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Button type={type} color={COLOR_BOTON[variante]} size={tamano} isDisabled={disabled}>
      {children}
    </Button>
  );
}

type PropsCampo = {
  etiqueta: string;
  name: string;
  ayuda?: string;
  type?: "text" | "email" | "url" | "date" | "tel" | "password";
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
};

export function Campo({ etiqueta, ayuda, required, ...props }: PropsCampo) {
  return <Input label={etiqueta} hint={ayuda} isRequired={required} isDisabled={useDeshabilitado()} {...props} />;
}

export function AreaTexto({
  etiqueta,
  ayuda,
  rows = 4,
  ...props
}: {
  etiqueta: string;
  name: string;
  ayuda?: string;
  defaultValue?: string;
  maxLength?: number;
  rows?: number;
}) {
  return <TextArea label={etiqueta} hint={ayuda} rows={rows} isDisabled={useDeshabilitado()} {...props} />;
}

export function Selector({
  etiqueta,
  opciones,
  ...props
}: {
  etiqueta: string;
  name: string;
  defaultValue?: string;
  opciones: { valor: string; texto: string }[];
}) {
  return (
    <NativeSelect
      label={etiqueta}
      options={opciones.map((o) => ({ value: o.valor, label: o.texto }))}
      disabled={useDeshabilitado()}
      {...props}
    />
  );
}

/** Casilla que se envía como "on" en el formulario cuando está marcada. */
export function Casilla({ etiqueta, name }: { etiqueta: string; name: string }) {
  return <Checkbox label={etiqueta} name={name} value="on" isDisabled={useDeshabilitado()} />;
}

/**
 * Archivo: PROPIO, no oficial. Los componentes oficiales (FileTrigger, InputFile) no
 * ponen `name` en su <input type="file">, así que el archivo no viaja en el FormData
 * de la server action. Este es un input nativo con el estilo del tema.
 */
export function CampoArchivo({
  etiqueta,
  ayuda,
  ...props
}: {
  etiqueta: string;
  name: string;
  ayuda?: string;
  accept?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-secondary">{etiqueta}</span>
      <input
        type="file"
        {...props}
        disabled={useDeshabilitado()}
        className="block w-full text-sm text-tertiary file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-secondary file:shadow-xs-skeuomorphic file:ring-1 file:ring-primary file:ring-inset hover:file:bg-primary_hover disabled:cursor-not-allowed disabled:opacity-50"
      />
      {ayuda && <span className="text-sm text-tertiary">{ayuda}</span>}
    </label>
  );
}

/** Tarjeta: PROPIA. La versión gratuita de Untitled UI no trae un componente de tarjeta. */
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
const COLOR_INSIGNIA = { gris: "gray", marca: "brand", exito: "success", advertencia: "warning", error: "error" } as const;

export function Insignia({ color = "gris", children }: { color?: ColorInsignia; children: ReactNode }) {
  return (
    <Badge type="pill-color" size="md" color={COLOR_INSIGNIA[color]}>
      {children}
    </Badge>
  );
}

/** Tabla de datos (oficial: Table + TableCard). Cada fila: un id y una celda por columna. */
export function Tabla({
  titulo,
  descripcion,
  acciones,
  columnas,
  filas,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
  columnas: { id: string; etiqueta: string }[];
  filas: { id: string; celdas: ReactNode[] }[];
}) {
  return (
    <TableCard.Root>
      <TableCard.Header title={titulo} description={descripcion} contentTrailing={acciones} badge={<Badge size="sm" color="gray">{filas.length}</Badge>} />
      <Table aria-label={titulo}>
        <Table.Header>
          {columnas.map((c, i) => (
            <Table.Head key={c.id} id={c.id} label={c.etiqueta} isRowHeader={i === 0} />
          ))}
        </Table.Header>
        <Table.Body items={filas}>
          {(fila) => (
            <Table.Row id={fila.id}>
              {fila.celdas.map((celda, i) => (
                <Table.Cell key={columnas[i].id}>{celda}</Table.Cell>
              ))}
            </Table.Row>
          )}
        </Table.Body>
      </Table>
    </TableCard.Root>
  );
}

/** Portapapeles; sin contexto seguro (http en desarrollo) no hay API: copia por selección. */
async function copiar(valor: string): Promise<boolean> {
  if (navigator.clipboard) return navigator.clipboard.writeText(valor).then(() => true, () => false);
  const area = document.createElement("textarea");
  area.value = valor;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  return ok;
}

/**
 * Valor listo para copiar (registros DNS, claves): PROPIO, la versión gratuita no trae
 * uno. El botón es el oficial.
 */
export function Copiable({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <code className="min-w-0 rounded-md bg-secondary px-2 py-1 font-mono text-sm break-all text-primary" data-copiable>
        {valor}
      </code>
      <Button
        color="secondary"
        size="sm"
        aria-label={`Copiar ${etiqueta}`}
        onPress={() => {
          void copiar(valor).then((ok) => {
            if (!ok) return;
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          });
        }}
      >
        {copiado ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}

export { Formulario, type EstadoFormulario } from "./formulario";
