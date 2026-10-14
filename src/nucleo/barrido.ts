// Barrido periódico: retoma lo que quedó sin hacer y revisa los dominios propios.
// Hoy un evento o un correo PENDIENTE sale cuando la banda hace algo; si el proceso se
// reinició antes (un deploy), o el correo falló, quedaría esperando a que la banda emita
// otro. El barrido corre al arrancar y cada DEOCO_BARRIDO_SEGUNDOS (60 por defecto).
//
// Una sola instancia: las vueltas no se superponen (si una tarda, la siguiente se salta) y
// todo va por las mismas colas por banda que usa el pedido, así que nada corre dos veces en
// paralelo. Entre procesos (un deploy que se solapa) lo cuida la base: evento y correo se
// "toman" con un update condicional antes de procesarse.
import { prisma } from "@/nucleo/db/cliente";
import { CORREO_COLGADO_MS, retomarCorreos } from "@/nucleo/correo";
import { revisarDominios, type ConsultaDns } from "@/nucleo/dominios";
import { retomarEventos } from "@/nucleo/eventos/bus";

export type ResultadoBarrido = { bandas: number; dominios: { revisados: number; noApuntan: number } };

/** Una vuelta del barrido. Resuelve cuando terminó (las colas retomadas, vacías). */
export async function barrer(opciones: { ahora?: Date; dns?: ConsultaDns } = {}): Promise<ResultadoBarrido> {
  const ahora = opciones.ahora ?? new Date();
  const colgadoDesde = new Date(ahora.getTime() - CORREO_COLGADO_MS);
  const bandas = await prisma.$queryRaw<{ id: string }[]>`
    SELECT b AS id FROM bandas_con_pendientes(${ahora}::timestamp, ${colgadoDesde}::timestamp) AS b`;
  for (const { id } of bandas) {
    // Una banda que falla no frena a las demás.
    await retomarEventos(id).catch((e) => console.error(`[barrido] eventos de ${id}:`, e));
    await retomarCorreos(id, ahora).catch((e) => console.error(`[barrido] correos de ${id}:`, e));
  }
  const dominios = await revisarDominios(opciones.dns, ahora).catch((e) => {
    console.error("[barrido] revisión de dominios:", e);
    return { revisados: 0, noApuntan: 0 };
  });
  return { bandas: bandas.length, dominios };
}

let corriendo = false;
let reloj: NodeJS.Timeout | undefined;

/** Una vuelta, salvo que la anterior siga corriendo. Nunca tira. */
export async function vuelta(): Promise<ResultadoBarrido | null> {
  if (corriendo) return null;
  corriendo = true;
  try {
    const r = await barrer();
    // Solo cuando hizo algo: así los logs muestran que el barrido corre sin llenarse de líneas.
    if (r.bandas || r.dominios.revisados) {
      console.log(`[barrido] pendientes de ${r.bandas} banda(s) · dominios revisados: ${r.dominios.revisados}, sin apuntar: ${r.dominios.noApuntan}`);
    }
    return r;
  } catch (e) {
    console.error("[barrido] la vuelta falló:", e);
    return null;
  } finally {
    corriendo = false;
  }
}

export function segundosDeBarrido(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.DEOCO_BARRIDO_SEGUNDOS ?? 60);
  return Number.isFinite(n) && n >= 5 ? n : 60;
}

/** Arranca el barrido: una vuelta ya y después cada `segundos`. No retiene el proceso. */
export function iniciarBarrido(segundos = segundosDeBarrido()) {
  if (reloj) return;
  console.log(`[deoco] barrido de pendientes: al arrancar y cada ${segundos} s`);
  void vuelta();
  reloj = setInterval(() => void vuelta(), segundos * 1000);
  reloj.unref();
}

export function detenerBarrido() {
  if (reloj) clearInterval(reloj);
  reloj = undefined;
}
