import { after } from "next/server";
import { alConfirmar, conTenant, tenantDeTransaccion, type TxTenant } from "@/nucleo/db/con-tenant";
import { registro as registroGlobal } from "@/nucleo/modulos";
import type { CargaEvento, Evento } from "@/nucleo/modulos/contrato";
import { modulosPrendidos } from "@/nucleo/modulos/encendido";
import type { Registro } from "@/nucleo/modulos/registro";
import { problemaNombreEvento } from "./nombre";

export class ErrorEvento extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorEvento";
  }
}

export type FalloEvento = { intento: number; moduloId: string; error: string; fecha: string };

/**
 * Bus de eventos en el mismo proceso.
 *
 * - emitir() guarda la fila en `evento` (PENDIENTE) y vuelve. La entrega a los
 *   suscriptos se programa con after() de Next: corre DESPUÉS de mandar la
 *   respuesta. Fuera de un pedido (scripts, pruebas) corre en segundo plano.
 * - Con `{ tx }`, la fila se guarda en la transacción de quien emite: el dato y el
 *   evento se confirman o se pierden juntos. La entrega se programa recién cuando
 *   esa transacción se confirma.
 * - Orden: una cola por banda. Cada vuelta toma el PENDIENTE de menor `secuencia`,
 *   así los eventos de una banda se entregan en orden de emisión.
 * - Errores: cada suscripto corre aislado; si falla, el error queda en `fallos`
 *   y el evento termina FALLIDO, sin frenar a los demás ni a quien emitió.
 * - Entrega tomada en la base (`tomadoEn`): aunque dos procesos se solapen un rato
 *   (un deploy), un evento no se entrega dos veces. Lo que quedó sin entregar lo
 *   retoma el barrido (src/nucleo/barrido.ts).
 * - Un solo proceso: el día que haya varias instancias, esto se cambia por una cola
 *   de verdad sin tocar a quien emite ni a quien escucha.
 */
/** Una entrega tomada hace más que esto se da por colgada (el proceso murió a mitad). */
export const EVENTO_COLGADO_MS = 10 * 60_000;

export function crearBus(obtenerRegistro: () => Registro = registroGlobal) {
  const colas = new Map<string, Promise<void>>();

  /** Encadena el procesamiento de la banda detrás de lo que ya esté corriendo. */
  function encolar(tenantId: string): Promise<void> {
    const previa = colas.get(tenantId) ?? Promise.resolve();
    const actual = previa
      .then(() => procesarPendientes(tenantId))
      .catch((e) => console.error(`[eventos] no se pudo procesar la cola de ${tenantId}`, e));
    colas.set(tenantId, actual);
    void actual.finally(() => {
      if (colas.get(tenantId) === actual) colas.delete(tenantId);
    });
    return actual;
  }

  /** Después de la respuesta si hay un pedido en curso; si no, en segundo plano. */
  function programar(tenantId: string) {
    try {
      after(() => encolar(tenantId));
    } catch {
      void encolar(tenantId); // fuera de un pedido de Next: no se espera
    }
  }

  async function procesarPendientes(tenantId: string) {
    for (;;) {
      const evento = await conTenant(tenantId, async (tx) => {
        const e = await tx.evento.findFirst({ where: { estado: "PENDIENTE" }, orderBy: { secuencia: "asc" } });
        if (!e) return null;
        // Lo está entregando otro proceso (un deploy que se solapa): ese sigue la cola. Si
        // quedó colgado (el proceso murió a mitad), se retoma pasado EVENTO_COLGADO_MS.
        if (e.tomadoEn && Date.now() - e.tomadoEn.getTime() < EVENTO_COLGADO_MS) return null;
        // Tomarlo: si otro lo tomó entre la lectura y acá, no se entrega dos veces.
        const { count } = await tx.evento.updateMany({
          where: { id: e.id, estado: "PENDIENTE", tomadoEn: e.tomadoEn },
          data: { tomadoEn: new Date() },
        });
        return count === 1 ? e : undefined;
      });
      if (evento === null) return;
      if (evento) await entregar(evento);
    }
  }

  async function entregar(fila: {
    id: string;
    nombre: string;
    tenantId: string;
    usuarioId: string | null;
    fecha: Date;
    payload: unknown;
    intentos: number;
    fallos: unknown;
    soloPara: string[];
  }) {
    const reg = obtenerRegistro();
    // Un módulo apagado para la banda no recibe sus eventos.
    const prendidos = await modulosPrendidos(fila.tenantId, reg);
    const destinatarios = reg
      .suscriptos(fila.nombre)
      .filter((s) => prendidos.has(s.moduloId))
      .filter((s) => fila.soloPara.length === 0 || fila.soloPara.includes(s.moduloId));

    const intento = fila.intentos + 1;
    const resultados = await Promise.allSettled(
      destinatarios.map((s) =>
        // Promise.resolve().then: un throw sincrónico también queda aislado.
        Promise.resolve().then(() =>
          s.manejador({
            id: fila.id,
            nombre: fila.nombre,
            tenantId: fila.tenantId,
            usuarioId: fila.usuarioId,
            fecha: fila.fecha,
            payload: structuredClone(fila.payload), // ninguno le cambia el payload a otro
          } satisfies Evento),
        ),
      ),
    );
    const fallos: FalloEvento[] = resultados.flatMap((r, i) =>
      r.status === "rejected"
        ? [
            {
              intento,
              moduloId: destinatarios[i].moduloId,
              error: r.reason instanceof Error ? r.reason.message : String(r.reason),
              fecha: new Date().toISOString(),
            },
          ]
        : [],
    );
    for (const f of fallos) console.error(`[eventos] ${fila.nombre} (${fila.id}) falló en "${f.moduloId}": ${f.error}`);

    await conTenant(fila.tenantId, (tx) =>
      tx.evento.update({
        where: { id: fila.id },
        data: {
          estado: fallos.length > 0 ? "FALLIDO" : "PROCESADO",
          intentos: intento,
          fallos: [...((fila.fallos as FalloEvento[]) ?? []), ...fallos],
          soloPara: [],
          procesadoEn: new Date(),
          tomadoEn: null,
        },
      }),
    );
  }

  return {
    /**
     * Guarda el evento y programa su entrega. No espera a los suscriptos.
     * `nombre` tiene que estar declarado en `eventosEmite` de algún módulo.
     *
     * `opciones.tx`: una transacción de conTenant de la MISMA banda. El evento se
     * guarda ahí, atómico con el resto de la operación; si la transacción se
     * revierte, el evento no existe y no se entrega.
     *
     * `opciones.unica`: clave de idempotencia (p. ej. `mp:pago:123`). Si ya hay un evento
     * con el mismo nombre y clave en la banda, no se guarda otro: vuelve el existente con
     * `repetido: true` (un aviso de pasarela repetido no duplica el efecto).
     */
    async emitir(
      nombre: string,
      tenantId: string,
      payload: CargaEvento,
      usuarioId?: string,
      opciones: { tx?: TxTenant; unica?: string } = {},
    ): Promise<{ id: string; repetido: boolean }> {
      const problema = problemaNombreEvento(nombre);
      if (problema) throw new ErrorEvento(`Nombre de evento inválido: ${problema}.`);
      if (obtenerRegistro().emisores(nombre).length === 0) {
        throw new ErrorEvento(`Ningún módulo declara emitir "${nombre}" (falta en eventosEmite).`);
      }
      const { unica } = opciones;
      if (unica !== undefined && (!unica || unica.length > 200)) {
        throw new ErrorEvento("emitir({ unica }): la clave tiene que tener entre 1 y 200 caracteres.");
      }
      const guardar = async (tx: TxTenant) => {
        if (unica === undefined) {
          const { id } = await tx.evento.create({ data: { nombre, tenantId, payload, usuarioId }, select: { id: true } });
          return { id, repetido: false };
        }
        // ON CONFLICT DO NOTHING: no aborta la transacción del que emite si ya existía.
        const { count } = await tx.evento.createMany({
          data: [{ nombre, tenantId, payload, usuarioId, claveUnica: unica }],
          skipDuplicates: true,
        });
        const { id } = await tx.evento.findFirstOrThrow({ where: { nombre, claveUnica: unica }, select: { id: true } });
        return { id, repetido: count === 0 };
      };

      const { tx } = opciones;
      if (!tx) {
        const fila = await conTenant(tenantId, guardar);
        programar(tenantId);
        return fila;
      }
      const deLaTx = tenantDeTransaccion(tx);
      if (!deLaTx) throw new ErrorEvento("emitir({ tx }) necesita una transacción abierta por conTenant.");
      if (deLaTx !== tenantId) {
        throw new ErrorEvento("emitir({ tx }): la transacción es de otra banda que el evento.");
      }
      const fila = await guardar(tx);
      alConfirmar(tx, () => programar(tenantId));
      return fila;
    },

    /**
     * Vuelve a entregar un evento FALLIDO, solo a los suscriptos que fallaron en el
     * último intento. Para el back office (sin pantalla todavía). Resuelve cuando
     * terminó de procesarse.
     */
    async reprocesar(tenantId: string, eventoId: string, opciones: { registrar?: (tx: TxTenant) => Promise<void> } = {}) {
      const evento = await conTenant(tenantId, (tx) => tx.evento.findUnique({ where: { id: eventoId } }));
      if (!evento) throw new ErrorEvento(`No existe el evento ${eventoId} en esta banda.`);
      if (evento.estado !== "FALLIDO") {
        throw new ErrorEvento(`El evento ${eventoId} no está fallido (está ${evento.estado}).`);
      }
      const fallaron = [
        ...new Set(
          (evento.fallos as FalloEvento[]).filter((f) => f.intento === evento.intentos).map((f) => f.moduloId),
        ),
      ];
      await conTenant(tenantId, async (tx) => {
        await tx.evento.update({ where: { id: eventoId }, data: { estado: "PENDIENTE", soloPara: fallaron, tomadoEn: null } });
        await opciones.registrar?.(tx); // p. ej. la auditoría del back office, en la misma transacción
      });
      await encolar(tenantId);
    },

    /**
     * Retoma los PENDIENTES de la banda (los que quedaron sin entregar: el proceso se
     * reinició, o la entrega se cortó). Lo usa el barrido; va por la misma cola, así que
     * no se cruza con una entrega en curso. Resuelve cuando la cola se vació.
     */
    retomar(tenantId: string) {
      return encolar(tenantId);
    },

    /** Espera a que se vacíen todas las colas. Para pruebas y cierres ordenados. */
    async esperar() {
      while (colas.size > 0) await Promise.all([...colas.values()]);
    },
  };
}

const bus = crearBus();

/** emitir(nombre, tenantId, payload, usuarioId?) — ver crearBus. */
export const emitir = bus.emitir;
export const reprocesarEvento = bus.reprocesar;
export const esperarEventos = bus.esperar;
export const retomarEventos = bus.retomar;
