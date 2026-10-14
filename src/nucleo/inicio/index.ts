// Inicio del panel: un bloque por módulo prendido que ofrezca la consulta "inicio"
// (`consultas: [{ nombre: "inicio", responder }]`). El núcleo no sabe qué hay en cada bloque:
// pide la consulta (apagado, error o demora → no hay bloque), valida la forma y la pinta.
// Cada bloque lo ve quien puede ver ese módulo en el menú; el del gestor de cuenta, el titular.
import { consultar } from "@/nucleo/consultas";
import { registro as registroGlobal } from "@/nucleo/modulos";
import { modulosPrendidos } from "@/nucleo/modulos/encendido";
import type { Registro } from "@/nucleo/modulos/registro";

export const CONSULTA_INICIO = "inicio";

/** Lo que responde un módulo a "<id>.inicio". Textos ya formateados; `href` relativo al panel. */
export type BloqueInicio = {
  titulo: string;
  datos: { etiqueta: string; valor: string }[];
  /** Lo que falta hacer ("Tu sitio no está publicado"). */
  pendientes: { texto: string; href?: string }[];
};

const texto = (v: unknown, max: number) => {
  if (typeof v !== "string" || !v.trim()) throw new Error("texto vacío");
  return v.slice(0, max);
};
const hrefValido = (v: unknown) => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") && v.length <= 200 ? v : undefined);

/** Valida la respuesta de un módulo (no se confía en la forma). null: no hay bloque. */
export function interpretarBloque(r: unknown): BloqueInicio | null {
  if (r === null) return null;
  if (typeof r !== "object" || Array.isArray(r)) throw new Error("no es un bloque");
  const o = r as Record<string, unknown>;
  const lista = (v: unknown) => (Array.isArray(v) ? v.slice(0, 8) : []);
  return {
    titulo: texto(o.titulo, 60),
    datos: lista(o.datos).map((d) => ({ etiqueta: texto((d as Record<string, unknown>).etiqueta, 60), valor: texto((d as Record<string, unknown>).valor, 120) })),
    pendientes: lista(o.pendientes).map((p) => ({ texto: texto((p as Record<string, unknown>).texto, 200), href: hrefValido((p as Record<string, unknown>).href) })),
  };
}

/**
 * Los bloques de la banda, en el orden del menú (el del gestor de cuenta primero). `puedeVer`
 * decide si quien mira ve el de un módulo; los pendientes repetidos (mismo texto) van una vez.
 */
export async function bloquesDeInicio(
  tenantId: string,
  puedeVer: (moduloId: string, esGestor: boolean) => Promise<boolean>,
  reg: Registro = registroGlobal(),
): Promise<(BloqueInicio & { moduloId: string })[]> {
  const prendidos = await modulosPrendidos(tenantId, reg);
  const orden = (id: string) =>
    reg.gestor?.moduloId === id ? -Infinity : Math.min(...reg.navegacion.filter((n) => n.moduloId === id && !n.publica && !n.admin && !n.externa).map((n) => n.orden), Infinity);
  const candidatos = reg.modulos
    .filter((m) => prendidos.has(m.id) && reg.consulta(`${m.id}.${CONSULTA_INICIO}`))
    .sort((a, b) => orden(a.id) - orden(b.id) || a.id.localeCompare(b.id));
  const visibles = (await Promise.all(candidatos.map(async (m) => ((await puedeVer(m.id, reg.gestor?.moduloId === m.id)) ? m : null)))).filter((m) => m !== null);
  const bloques = await Promise.all(
    visibles.map(async (m) => {
      const b = await consultar(tenantId, `${m.id}.${CONSULTA_INICIO}`, {}, { vacio: null, interpretar: interpretarBloque }, reg);
      return b ? { ...b, moduloId: m.id } : null;
    }),
  );
  const vistos = new Set<string>();
  return bloques
    .filter((b) => b !== null)
    .map((b) => ({ ...b, pendientes: b.pendientes.filter((p) => !vistos.has(p.texto) && vistos.add(p.texto)) }));
}

/** Los permisos del menú del panel de un módulo (ver uno alcanza para ver su bloque). */
export function permisosDelMenu(moduloId: string, reg: Registro = registroGlobal()): string[] {
  return reg.navegacion.filter((n) => n.moduloId === moduloId && !n.publica && !n.admin && !n.externa && n.permiso).map((n) => n.permiso!);
}
