// Próximas fechas del sitio: las cargadas a mano y, si la ticketera está prendida para la banda,
// también las suyas (consulta "ticketera.proximas-fechas", sin importar su código), por fecha.
// Conviven: una cargada a mano puede ser un show que vende otro o uno gratis, y prender la
// ticketera no la borra del sitio. La misma fecha en los dos (mismo día y sala) va una vez: la de
// la ticketera, que vende.
import { consultar } from "@/nucleo/consultas";
import { diaArgentino } from "@/nucleo/fechas";
import type { ContenidoSitio } from "./contenido";

type Fecha = ContenidoSitio["home"]["fechas"][number];


function interpretar(r: unknown): Fecha[] {
  if (!Array.isArray(r)) throw new Error("se esperaba una lista");
  return r.map((x) => {
    const f = x as Record<string, unknown>;
    if (typeof f.fecha !== "string" || typeof f.lugar !== "string" || typeof f.ciudad !== "string" || typeof f.url !== "string") {
      throw new Error("fecha con otra forma");
    }
    if (Number.isNaN(Date.parse(f.fecha)) || !f.url.startsWith("/")) throw new Error("fecha o link inválidos");
    return { fecha: diaArgentino(f.fecha), lugar: f.lugar, ciudad: f.ciudad, link: f.url };
  });
}

/** null: la ticketera no está (apagada, no instalada o sin respuesta) → van las cargadas a mano. */
export function fechasDeTicketera(tenantId: string): Promise<Fecha[] | null> {
  return consultar<Fecha[] | null>(tenantId, "ticketera.proximas-fechas", { limite: 6 }, { vacio: null, interpretar });
}

/** Sala comparable: sin mayúsculas, tildes ni espacios de más. */
const sala = (lugar: string) => lugar.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** El contenido publicado, con las fechas de la ticketera (si está prendida) sumadas a las suyas. */
export async function conFechasVivas(tenantId: string, contenido: ContenidoSitio): Promise<ContenidoSitio> {
  const deTicketera = await fechasDeTicketera(tenantId);
  if (!deTicketera) return contenido;
  const repetida = (f: Fecha) => deTicketera.some((t) => t.fecha === f.fecha && sala(t.lugar) === sala(f.lugar));
  const fechas = [...deTicketera, ...contenido.home.fechas.filter((f) => !repetida(f))].sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { ...contenido, home: { ...contenido.home, fechas } };
}
