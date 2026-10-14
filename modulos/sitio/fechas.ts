// Próximas fechas del sitio: si la ticketera está prendida para la banda, las suyas (consulta
// "ticketera.proximas-fechas", sin importar su código); si no, las cargadas a mano.
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

/** El contenido publicado, con las fechas de la ticketera si está prendida. */
export async function conFechasVivas(tenantId: string, contenido: ContenidoSitio): Promise<ContenidoSitio> {
  const fechas = await fechasDeTicketera(tenantId);
  return fechas ? { ...contenido, home: { ...contenido.home, fechas } } : contenido;
}
