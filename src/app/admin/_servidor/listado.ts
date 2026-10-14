// Listados del back office: página, orden y filtros viajan en la URL (el staff comparte el
// link y vuelve a lo mismo). Todo se resuelve en la base: nunca se trae la tabla entera.

export const POR_PAGINA = 50;

export type Direccion = "asc" | "desc";
export type ParametrosUrl = Record<string, string | string[] | undefined>;

/** Un parámetro de texto de la URL: el primero si viene repetido, recortado y acotado. */
export function texto(p: ParametrosUrl, clave: string): string {
  const v = p[clave];
  return (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 100) ?? "";
}

/** Página pedida (desde 1). Cualquier cosa rara es la 1. */
export function pagina(p: ParametrosUrl): number {
  const n = Number(texto(p, "pagina"));
  return Number.isSafeInteger(n) && n >= 1 ? n : 1;
}

/** Orden pedido, solo entre las columnas permitidas; si no, el de por defecto. */
export function orden<C extends string>(
  p: ParametrosUrl,
  columnas: readonly C[],
  porDefecto: { columna: C; direccion: Direccion },
): { columna: C; direccion: Direccion } {
  const columna = texto(p, "orden") as C;
  if (!columnas.includes(columna)) return porDefecto;
  return { columna, direccion: texto(p, "dir") === "asc" ? "asc" : "desc" };
}

/** Página de un resultado: cuántas hay y desde qué fila leer. */
export function paginado(total: number, pedida: number) {
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  return { pagina: Math.min(pedida, paginas), paginas, total };
}

export const desde = (pagina: number) => (pagina - 1) * POR_PAGINA;

/**
 * El texto con %, _ y \ escapados, para buscarlo literal en un LIKE. También para el
 * `contains` de Prisma, que los pasa tal cual (sin esto, buscar "_" trae todo).
 */
export const literal = (t: string) => t.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Patrón para ILIKE "contiene", con el texto literal. */
export const contiene = (t: string) => `%${literal(t)}%`;
