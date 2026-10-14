"use client";

// Kit del panel. Cada export envuelve un componente OFICIAL de Untitled UI
// (src/components, instalados con `untitledui add`) con la interfaz en castellano que
// usan las pantallas de los módulos. Excepciones (sin equivalente oficial que sirva),
// ver README.md: CampoArchivo, Tarjeta, Aviso, CampoColor y Copiable.
import { ArrowLeft, ArrowRight } from "@untitledui/icons";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";
import { RouterProvider } from "react-aria-components";
import { Pagination } from "@/components/application/pagination/pagination-base";
import { TabList, Tabs } from "@/components/application/tabs/tabs";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Table, TableCard } from "@/components/application/table/table";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { useDeshabilitado } from "./contexto";

type VarianteBoton = "primario" | "secundario" | "peligro" | "enlace" | "enlaceGris";
const COLOR_BOTON = {
  primario: "primary",
  secundario: "secondary",
  peligro: "primary-destructive",
  enlace: "link-color",
  enlaceGris: "link-gray",
} as const;

/**
 * Los enlaces de los componentes oficiales (react-aria) navegan con el router de Next,
 * sin recargar la página.
 */
function ConRouter({ children }: { children: ReactNode }) {
  const router = useRouter();
  return <RouterProvider navigate={(href) => router.push(href)}>{children}</RouterProvider>;
}

/** Botón. Con `href` es un enlace con forma de botón (p. ej. "Nueva banda"). */
export function Boton({
  variante = "primario",
  tamano = "sm",
  type = "button",
  href,
  disabled,
  children,
}: {
  variante?: VarianteBoton;
  tamano?: "sm" | "md";
  type?: "button" | "submit";
  href?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  if (href) {
    return (
      <ConRouter>
        <Button href={href} color={COLOR_BOTON[variante]} size={tamano}>
          {children}
        </Button>
      </ConRouter>
    );
  }
  return (
    <Button type={type} color={COLOR_BOTON[variante]} size={tamano} isDisabled={disabled}>
      {children}
    </Button>
  );
}

/**
 * Pestañas que son enlaces (oficial: `application/tabs`). Cada una es una página; la
 * actual la marca la pantalla.
 */
export function Pestanas({ etiqueta, pestanas }: { etiqueta: string; pestanas: { href: string; texto: string; actual?: boolean }[] }) {
  return (
    <nav aria-label={etiqueta} className="overflow-x-auto">
      <ConRouter>
        <Tabs selectedKey={pestanas.find((p) => p.actual)?.href ?? ""}>
          <TabList aria-label={etiqueta} type="underline" items={pestanas.map((p) => ({ id: p.href, href: p.href, label: p.texto }))} />
        </Tabs>
      </ConRouter>
    </nav>
  );
}

type PropsCampo = {
  etiqueta: string;
  name: string;
  ayuda?: string;
  type?: "text" | "search" | "email" | "url" | "date" | "datetime-local" | "number" | "tel" | "password";
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  /** "off" / "new-password": que el navegador no guarde ni sugiera (credenciales). */
  autoComplete?: string;
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

/** Casilla que se envía como "on" en el formulario cuando está marcada. `marcada`: estado inicial. */
export function Casilla({ etiqueta, name, marcada }: { etiqueta: string; name: string; marcada?: boolean }) {
  return <Checkbox label={etiqueta} name={name} value="on" defaultSelected={marcada} isDisabled={useDeshabilitado()} />;
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

/**
 * Color: PROPIO. Untitled UI no trae un selector de color; este es el nativo del
 * navegador, con la etiqueta del kit. Se envía como "#rrggbb".
 */
export function CampoColor({ etiqueta, name, defaultValue }: { etiqueta: string; name: string; defaultValue?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-secondary">{etiqueta}</span>
      <input
        type="color"
        name={name}
        defaultValue={defaultValue}
        disabled={useDeshabilitado()}
        className="h-11 w-24 cursor-pointer rounded-lg ring-1 ring-primary disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  );
}

type Datos = Record<`data-${string}`, string | boolean | undefined>;

/**
 * Tarjeta: PROPIA. Untitled UI no trae un componente de tarjeta (ni en PRO).
 * `imagen` va a la izquierda del título, `junto` al lado del título (insignias) y
 * `acciones` a la derecha (un botón, un total).
 */
export function Tarjeta({
  titulo,
  descripcion,
  imagen,
  junto,
  acciones,
  children,
  ...datos
}: {
  titulo: string;
  descripcion?: string;
  imagen?: ReactNode;
  junto?: ReactNode;
  acciones?: ReactNode;
  children?: ReactNode;
} & Datos) {
  return (
    <section className="flex flex-col gap-5 rounded-xl bg-primary p-6 shadow-xs ring-1 ring-secondary ring-inset" {...datos}>
      <header className="flex flex-wrap items-start gap-4">
        {imagen && <div className="shrink-0">{imagen}</div>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold wrap-anywhere text-primary">{titulo}</h2>
            {junto}
          </div>
          {descripcion && <p className="mt-1 text-sm text-tertiary">{descripcion}</p>}
        </div>
        {acciones && <div className="shrink-0">{acciones}</div>}
      </header>
      {children !== undefined && <div className="flex flex-col gap-4">{children}</div>}
    </section>
  );
}

/**
 * Aviso: PROPIO. Las alertas PRO de Untitled UI son notificaciones descartables que cortan
 * el texto en una línea (docs/untitled-ui-pro.md). Una franja con título y texto; `error`
 * para lo que hay que corregir ya, `info` para lo que solo hay que saber. Sin título, el texto solo.
 */
export function Aviso({
  tono = "advertencia",
  titulo,
  children,
  ...datos
}: { tono?: "info" | "advertencia" | "error"; titulo?: string; children?: ReactNode } & Datos) {
  const color = {
    info: "bg-secondary text-secondary ring-secondary",
    advertencia: "bg-warning-primary text-warning-primary ring-utility-yellow-200",
    error: "bg-error-primary text-error-primary ring-error_subtle",
  }[tono];
  return (
    <div role={tono === "info" ? "note" : "alert"} className={`rounded-xl p-4 text-md ring-1 ring-inset ${color}`} {...datos}>
      {titulo && <p className="font-semibold">{titulo}</p>}
      {children && <div className={titulo ? "mt-1" : undefined}>{children}</div>}
    </div>
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

/** La URL actual con estos parámetros cambiados (`null` lo quita). */
function useUrlCon() {
  const ruta = usePathname();
  const consulta = useSearchParams();
  return (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(consulta);
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    const q = p.toString();
    return q ? `${ruta}?${q}` : ruta;
  };
}

type OrdenTabla = { columna: string; direccion: "asc" | "desc" };
type PaginaTabla = { pagina: number; paginas: number; total: number };

/**
 * Tabla de datos (oficial: Table + TableCard). Cada fila: un id y una celda por columna.
 *
 * Listados largos: con `orden`, las columnas `ordenable` se ordenan con un clic y con
 * `paginacion` se muestra el control de páginas. Las dos cosas cambian la URL (`orden`,
 * `dir`, `pagina`) y la pantalla consulta la base con eso: la tabla nunca ordena ni
 * recorta filas por su cuenta.
 */
export function Tabla({
  titulo,
  descripcion,
  acciones,
  columnas,
  filas,
  orden,
  paginacion,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
  columnas: { id: string; etiqueta: string; ordenable?: boolean }[];
  filas: { id: string; celdas: ReactNode[] }[];
  orden?: OrdenTabla;
  paginacion?: PaginaTabla;
}) {
  const router = useRouter();
  const urlCon = useUrlCon();
  return (
    <TableCard.Root>
      <TableCard.Header
        title={titulo}
        description={descripcion}
        contentTrailing={acciones}
        badge={<Badge size="sm" color="gray">{paginacion?.total ?? filas.length}</Badge>}
      />
      <Table
        aria-label={titulo}
        sortDescriptor={orden && { column: orden.columna, direction: orden.direccion === "asc" ? "ascending" : "descending" }}
        onSortChange={(d) =>
          router.push(urlCon({ orden: String(d.column), dir: d.direction === "ascending" ? "asc" : "desc", pagina: null }))
        }
      >
        <Table.Header>
          {columnas.map((c, i) => (
            <Table.Head key={c.id} id={c.id} label={c.etiqueta} isRowHeader={i === 0} allowsSorting={!!orden && c.ordenable} />
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
      {filas.length === 0 && <p className="border-t border-secondary px-6 py-8 text-center text-sm text-tertiary">No hay resultados.</p>}
      {paginacion && paginacion.paginas > 1 && <Paginacion {...paginacion} />}
    </TableCard.Root>
  );
}

/**
 * Páginas de un listado (oficial: `application/pagination`, la base). Cada página es un
 * enlace a la misma URL con `pagina=N`: se puede abrir en otra pestaña y compartir.
 */
function Paginacion({ pagina, paginas }: PaginaTabla) {
  const urlCon = useUrlCon();
  const href = (n: number) => urlCon({ pagina: n === 1 ? null : String(n) });
  return (
    <Pagination.Root page={pagina} total={paginas} className="flex items-center justify-between gap-3 border-t border-secondary px-4 py-3 md:px-6">
      <Pagination.PrevTrigger>
        {({ isDisabled }) =>
          isDisabled ? (
            <Button color="secondary" size="sm" iconLeading={ArrowLeft} isDisabled>
              Anterior
            </Button>
          ) : (
            <ConRouter>
              <Button color="secondary" size="sm" iconLeading={ArrowLeft} href={href(pagina - 1)} rel="prev">
                Anterior
              </Button>
            </ConRouter>
          )
        }
      </Pagination.PrevTrigger>
      <Pagination.Context>
        {({ pages }) => (
          <>
            <ul className="hidden gap-0.5 md:flex" aria-label="Páginas">
              {pages.map((p) =>
                p.type === "page" ? (
                  <li key={p.value}>
                    <Pagination.Item value={p.value} isCurrent={p.isCurrent} ariaLabel={`Página ${p.value}`}>
                      {(item) => (
                        <Link
                          href={href(item.value)}
                          aria-current={item["aria-current"]}
                          aria-label={item["aria-label"]}
                          className={`flex size-9 items-center justify-center rounded-lg text-sm font-medium hover:bg-primary_hover hover:text-secondary ${
                            item.isSelected ? "bg-primary_hover text-secondary" : "text-quaternary"
                          }`}
                        >
                          {item.value}
                        </Link>
                      )}
                    </Pagination.Item>
                  </li>
                ) : (
                  <li key={`e${p.key}`} aria-hidden className="flex size-9 items-center justify-center text-tertiary">
                    …
                  </li>
                ),
              )}
            </ul>
            <span className="text-sm text-secondary md:hidden">
              Página <span className="font-medium">{pagina}</span> de <span className="font-medium">{paginas}</span>
            </span>
          </>
        )}
      </Pagination.Context>
      <Pagination.NextTrigger>
        {({ isDisabled }) =>
          isDisabled ? (
            <Button color="secondary" size="sm" iconTrailing={ArrowRight} isDisabled>
              Siguiente
            </Button>
          ) : (
            <ConRouter>
              <Button color="secondary" size="sm" iconTrailing={ArrowRight} href={href(pagina + 1)} rel="next">
                Siguiente
              </Button>
            </ConRouter>
          )
        }
      </Pagination.NextTrigger>
    </Pagination.Root>
  );
}

/**
 * Filtros de un listado: un formulario GET, así el filtro queda en la URL. Al filtrar se
 * vuelve a la página 1; el orden elegido se conserva. Adentro van los campos del kit.
 */
export function Filtros({ children }: { children: ReactNode }) {
  const router = useRouter();
  const consulta = useSearchParams();
  const ruta = usePathname();
  const orden = ["orden", "dir"].filter((k) => consulta.get(k));
  // Ya hidratado, navega sin los campos vacíos (?q=&estado= no aporta nada al link).
  function filtrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const p = new URLSearchParams();
    for (const [k, v] of new FormData(e.currentTarget)) if (typeof v === "string" && v.trim()) p.set(k, v.trim());
    const q = p.toString();
    router.push(q ? `${ruta}?${q}` : ruta);
  }
  return (
    // key: al cambiar la URL (Limpiar, atrás) los campos vuelven a lo que dice la URL.
    <form key={consulta.toString()} method="get" role="search" onSubmit={filtrar} className="flex flex-wrap items-end gap-4" data-filtros>
      {/* Cada campo, de 14 a 18 rem; en el celular, uno debajo del otro. */}
      <div className="grid w-full items-end gap-4 sm:w-auto sm:grid-flow-col sm:auto-cols-[minmax(14rem,18rem)]">{children}</div>
      {orden.map((k) => (
        <input key={k} type="hidden" name={k} value={consulta.get(k)!} />
      ))}
      <div className="flex items-center gap-3 sm:pb-0.5">
        <Boton type="submit" variante="secundario">
          Filtrar
        </Boton>
        <Boton href={ruta} variante="enlace">
          Limpiar
        </Boton>
      </div>
    </form>
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
