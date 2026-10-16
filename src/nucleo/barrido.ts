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
import { limpiarHuerfanos } from "@/nucleo/archivos";
import { limpiarCorreos } from "@/nucleo/correo/limpieza";
import { revisarDominios } from "@/nucleo/dominios";
import { revisarCorreosPendientes } from "@/nucleo/dominios/correo";
import { revisarComprasAparte } from "@/nucleo/dominios/compra";
import { revisarSalidas } from "@/nucleo/dominios/salida";
import { revisarTransferencias } from "@/nucleo/dominios/transferencia";
import { revisarVencimientos } from "@/nucleo/dominios/vencimiento";
import { retomarEventos } from "@/nucleo/eventos/bus";
import { registro as registroGlobal } from "@/nucleo/modulos";
import type { Registro } from "@/nucleo/modulos/registro";

export type ResultadoBarrido = {
  bandas: number;
  dominios: { revisados: number; conProblema: number; delegados: number };
  /** Direcciones de correo de bandas que quedaron verificadas en esta vuelta. */
  correos: number;
  /** Zonas delegadas de las que una banda terminó de irse en esta vuelta. */
  salidas: number;
  /** Compras y renovaciones de dominios que terminaron en la revisión anterior (corren aparte). */
  compras: number;
  /** Vencimientos de dominios (una vez por hora, aparte; los de la revisión anterior): avisos, vencidos, perdidos y transferidos. */
  vencimientos: { avisos: number; vencidos: number; perdidos: number; transferidos: number } | null;
  tareas: string[];
};

/** Última vez que corrió cada tarea periódica (`<modulo>.<nombre>`), en este proceso. */
const ultimaVez = new Map<string, number>();

/**
 * Las tareas periódicas de los módulos que ya toca correr. Una que falla no frena a las demás
 * (y se reintenta en la próxima vuelta: no se marca como corrida).
 */
export async function correrTareas(ahora = new Date(), reg: Registro = registroGlobal(), todas = false): Promise<string[]> {
  const corridas: string[] = [];
  for (const { moduloId, definicion } of reg.tareasPeriodicas) {
    const id = `${moduloId}.${definicion.nombre}`;
    const ultima = ultimaVez.get(id);
    if (!todas && ultima !== undefined && ahora.getTime() - ultima < definicion.cadaSegundos * 1000) continue;
    try {
      await definicion.correr(ahora);
      ultimaVez.set(id, ahora.getTime());
      corridas.push(id);
    } catch (e) {
      console.error(`[barrido] tarea ${id}:`, e);
    }
  }
  return corridas;
}

/** Una vuelta del barrido. Resuelve cuando terminó (las colas retomadas, vacías). */
export async function barrer(opciones: { ahora?: Date } = {}): Promise<ResultadoBarrido> {
  const ahora = opciones.ahora ?? new Date();
  const colgadoDesde = new Date(ahora.getTime() - CORREO_COLGADO_MS);
  const bandas = await prisma.$queryRaw<{ id: string }[]>`
    SELECT b AS id FROM bandas_con_pendientes(${ahora}::timestamp, ${colgadoDesde}::timestamp) AS b`;
  for (const { id } of bandas) {
    // Una banda que falla no frena a las demás.
    await retomarEventos(id).catch((e) => console.error(`[barrido] eventos de ${id}:`, e));
    await retomarCorreos(id, ahora).catch((e) => console.error(`[barrido] correos de ${id}:`, e));
  }
  const dominios = await revisarDominios(ahora).catch((e) => {
    console.error("[barrido] revisión de dominios:", e);
    return { revisados: 0, conProblema: 0, delegados: 0 };
  });
  const correos = await revisarCorreosPendientes(ahora).catch((e) => {
    console.error("[barrido] revisión de direcciones de correo:", e);
    return 0;
  });
  const { terminadas: salidas } = await revisarSalidas(ahora).catch((e) => {
    console.error("[barrido] salidas de dominios:", e);
    return { terminadas: 0 };
  });
  // Aparte: lo que habla con el registrador (cola de 59 por minuto) nunca frena el barrido.
  const compras = revisarComprasAparte(ahora);
  // Una vez por hora (en este proceso): el calendario de vencimientos y las transferencias afuera.
  // También aparte (consulta al registrador): el resultado es el de la revisión anterior.
  const vencimientos = ultimosVencimientosHechos;
  if (!vencimientosCorriendo && ahora.getTime() - ultimosVencimientos >= 3_600_000) {
    ultimosVencimientos = ahora.getTime();
    vencimientosCorriendo = (async () => {
      const v = await revisarVencimientos(ahora).catch((e) => {
        console.error("[barrido] vencimientos de dominios:", e);
        return { avisos: 0, vencidos: 0, perdidos: 0 };
      });
      const transferidos = await revisarTransferencias().catch((e) => {
        console.error("[barrido] transferencias de dominios:", e);
        return 0;
      });
      ultimosVencimientosHechos = { ...v, transferidos };
    })().finally(() => (vencimientosCorriendo = null));
  }
  const tareas = await correrTareas(ahora);
  // Una vez por día (en este proceso): la limpieza de correos enviados.
  if (ahora.getTime() - ultimaLimpieza >= 86_400_000) {
    ultimaLimpieza = ahora.getTime();
    const l = await limpiarCorreos(ahora).catch((e) => {
      console.error("[barrido] limpieza de correos:", e);
      return null;
    });
    if (l && (l.adjuntos || l.cuerpos || l.borrados)) {
      console.log(`[barrido] correos: ${l.adjuntos} sin adjuntos, ${l.cuerpos} sin cuerpo, ${l.borrados} borrados`);
    }
    // Aparte (recorre el disco) y con la hora real: la antigüedad es la del archivo en disco.
    // Solo en producción: en pruebas el almacén es compartido y la prueba la llama directo.
    if (process.env.NODE_ENV === "production" && !huerfanosCorriendo) {
      huerfanosCorriendo = limpiarHuerfanos()
        .then((n) => void (n && console.log(`[barrido] archivos: ${n} huérfanos borrados del almacén`)))
        .catch((e) => console.error("[barrido] archivos huérfanos:", e))
        .finally(() => (huerfanosCorriendo = null));
    }
  }
  return { bandas: bandas.length, dominios, correos, salidas, compras, vencimientos, tareas };
}

let ultimaLimpieza = 0;
let huerfanosCorriendo: Promise<void> | null = null;
let ultimosVencimientos = 0;
let vencimientosCorriendo: Promise<void> | null = null;
let ultimosVencimientosHechos: ResultadoBarrido["vencimientos"] = null;

/** Para pruebas: espera la revisión de vencimientos que haya quedado corriendo aparte. */
export const esperarVencimientos = async () => void (await vencimientosCorriendo);

/**
 * Latido del barrido para el monitoreo externo (un "dead man's switch", p. ej. Healthchecks.io):
 * si DEOCO_LATIDO_URL está, cada tanto se le avisa que el barrido sigue vivo. Si deja de llegar,
 * el servicio avisa (el barrido se colgó o el proceso se cayó). Nunca frena ni tira.
 */
let ultimoLatido = 0;
function latir(ahora = Date.now()) {
  const url = process.env.DEOCO_LATIDO_URL?.trim();
  if (!url || ahora - ultimoLatido < 5 * 60_000) return;
  ultimoLatido = ahora;
  void fetch(url, { signal: AbortSignal.timeout(10_000) }).catch((e) => console.warn("[barrido] latido:", e instanceof Error ? e.message : e));
}

let corriendo = false;
let reloj: NodeJS.Timeout | undefined;

/** Una vuelta, salvo que la anterior siga corriendo. Nunca tira. */
export async function vuelta(): Promise<ResultadoBarrido | null> {
  if (corriendo) return null;
  corriendo = true;
  try {
    const r = await barrer();
    latir();
    // Solo cuando hizo algo: así los logs muestran que el barrido corre sin llenarse de líneas.
    if (r.bandas || r.dominios.revisados || r.dominios.delegados) {
      console.log(`[barrido] pendientes de ${r.bandas} banda(s) · dominios revisados: ${r.dominios.revisados}, con problema: ${r.dominios.conProblema}, delegados activados: ${r.dominios.delegados}`);
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
