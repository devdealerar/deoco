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
 * - Un solo proceso: el día que haya varias instancias, esto se cambia por una cola
 *   de verdad sin tocar a quien emite ni a quien escucha.
 */
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
      const evento = await conTenant(tenantId, (tx) =>
        tx.evento.findFirst({ where: { estado: "PENDIENTE" }, orderBy: { secuencia: "asc" } }),
      );
      if (!evento) return;
      await entregar(evento);
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
     */
    async emitir(
      nombre: string,
      tenantId: string,
      payload: CargaEvento,
      usuarioId?: string,
      opciones: { tx?: TxTenant } = {},
    ) {
      const problema = problemaNombreEvento(nombre);
      if (problema) throw new ErrorEvento(`Nombre de evento inválido: ${problema}.`);
      if (obtenerRegistro().emisores(nombre).length === 0) {
        throw new ErrorEvento(`Ningún módulo declara emitir "${nombre}" (falta en eventosEmite).`);
      }
      const guardar = (tx: TxTenant) =>
        tx.evento.create({ data: { nombre, tenantId, payload, usuarioId }, select: { id: true } });

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
        await tx.evento.update({ where: { id: eventoId }, data: { estado: "PENDIENTE", soloPara: fallaron } });
        await opciones.registrar?.(tx); // p. ej. la auditoría del back office, en la misma transacción
      });
      await encolar(tenantId);
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
