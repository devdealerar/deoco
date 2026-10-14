// Registro de un cobro consultado a la pasarela: la misma regla para todo módulo que cobra.
// El núcleo no sabe qué se cobró (qué cosa es): eso lo resuelve el módulo
// con las funciones de `CosaACobrar`. Acá vive lo que antes estaba copiado en cada módulo:
//
//   1. La referencia tiene que ser un id, y de una cosa de ESTA banda (búsqueda bajo RLS).
//   2. Ya cobrada (pagada o en revisión): otro cobro aprobado es un pago duplicado. La cosa no
//      cambia; queda en `cobro_duplicado` para que la banda lo devuelva desde su pasarela.
//   3. No aprobado: se anota el estado de la pasarela y nada más.
//   4. Monto o moneda distintos: EN_REVISION con la observación. Nunca pagado.
//   5. Pagado UNA vez (cambio condicional): si dos avisos llegan a la vez, uno solo lo marca.
//      En esa misma transacción, lo que el módulo hace al cobrarse y el evento (con clave única).
import type { Prisma } from "@/generated/prisma/client";
import { conTenant, type TxTenant } from "@/nucleo/db/con-tenant";
import { emitir } from "@/nucleo/eventos/bus";
import { registro as registroGlobal } from "@/nucleo/modulos";
import type { Modulo } from "@/nucleo/modulos/contrato";
import type { Registro } from "@/nucleo/modulos/registro";
import { type CobroConsultado, ErrorPasarela } from "./tipos";

/** Solo pesos. */
export const MONEDA = "ARS";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResultadoCobro =
  | "pagado" // se marcó pagado ahora
  | "ya-pagado" // ya estaba pagado (aviso repetido, o un cobro no aprobado de algo pagado): nada
  | "duplicado" // otro cobro aprobado de algo ya cobrado: registrado para que la banda lo devuelva
  | "no-aprobado" // la pasarela todavía no lo aprueba (o lo rechazó)
  | "en-revision" // aprobado pero no coincide (o el módulo no puede entregarlo): no se marca pagado
  | "ajeno"; // la referencia no es de esta banda

/** Lo que el módulo cobró, como lo ve el registro. */
export type EstadoCobrable = {
  /** abierta: espera el pago. pagada / en-revision: ya cobrada (un cobro más es duplicado). */
  estado: "abierta" | "pagada" | "en-revision";
  /** Centavos. */
  total: number;
  /** El cobro con el que se pagó o se mandó a revisión (null si todavía no hubo). */
  cobroId: string | null;
};

type DatosCobro = { cobroId: string; estadoPasarela: string; pasarela: string };

/** Cómo el módulo lee y cambia lo que cobró. Todo corre en la transacción del registro. */
export type CosaACobrar = {
  /** "el pedido", "la compra": para la observación de revisión. */
  nombre: string;
  /** La cosa con esa referencia (null si no es de la banda). Puede bloquear lo que necesite. */
  buscar(tx: TxTenant, referencia: string): Promise<EstadoCobrable | null>;
  /** Cobro no aprobado de algo abierto: anotar el estado de la pasarela. */
  anotarEstado(tx: TxTenant, referencia: string, estadoPasarela: string): Promise<void>;
  /**
   * Aprobado y con el monto justo, antes de marcarlo pagado: un motivo para mandarlo a revisión
   * (p. ej. pagó tarde y ya no hay lugar), o null si se puede entregar.
   */
  antesDePagar?(tx: TxTenant, referencia: string, cobroId: string): Promise<string | null>;
  /** Pasarla a revisión con esta observación (solo si sigue abierta). */
  aRevision(tx: TxTenant, referencia: string, cobro: DatosCobro & { observacion: string }): Promise<void>;
  /** Marcarla pagada SOLO si sigue abierta (cambio condicional). true si la marcó esta llamada. */
  marcarPagada(tx: TxTenant, referencia: string, cobro: DatosCobro): Promise<boolean>;
  /** Lo que se hace al cobrarse, en la misma transacción (lo que el módulo entrega). */
  alPagarse(tx: TxTenant, referencia: string): Promise<void>;
  /** El evento que se emite al cobrarse (uno por cobro). */
  evento(referencia: string): { nombre: string; payload: Prisma.InputJsonObject };
};

const pesos = (centavos: number) => (centavos / 100).toFixed(2);

/**
 * Registra lo que dijo la API de la pasarela (`cobroDelAviso`) sobre un cobro de `modulo` en la
 * banda. Idempotente: un aviso repetido no cambia nada.
 */
export async function registrarCobro(
  modulo: Modulo,
  tenantId: string,
  pasarela: string,
  cobro: CobroConsultado,
  cosa: CosaACobrar,
  reg: Registro = registroGlobal(),
): Promise<ResultadoCobro> {
  if (reg.modulo(modulo.id) !== modulo || !modulo.cobros) throw new ErrorPasarela(`"${modulo.id}" no es un módulo que cobra.`);
  const referencia = cobro.referencia;
  if (!referencia || !UUID.test(referencia)) return "ajeno";
  return conTenant(tenantId, async (tx) => {
    const c = await cosa.buscar(tx, referencia);
    if (!c) return "ajeno";
    const aprobado = cobro.estado === "aprobado";
    const datos = { cobroId: cobro.cobroId, estadoPasarela: cobro.estadoPasarela, pasarela };

    if (c.estado !== "abierta") {
      const yaCobrada = c.estado === "pagada" ? "ya-pagado" : "en-revision";
      if (!aprobado || cobro.cobroId === c.cobroId) return yaCobrada;
      // El fan pagó otra vez algo ya cobrado: la cosa no cambia ni se entrega dos veces, pero el
      // pago queda registrado y la banda lo ve para devolverlo. Repetido, una sola fila.
      await tx.cobroDuplicado.createMany({
        data: [{ tenantId, moduloId: modulo.id, referencia, pasarela, cobroId: cobro.cobroId, monto: cobro.monto, moneda: cobro.moneda }],
        skipDuplicates: true,
      });
      return "duplicado";
    }

    if (!aprobado) {
      await cosa.anotarEstado(tx, referencia, cobro.estadoPasarela);
      return "no-aprobado";
    }
    if (cobro.monto !== c.total || cobro.moneda !== MONEDA) {
      const observacion = `La pasarela aprobó ${cobro.moneda} ${pesos(cobro.monto)} (cobro ${cobro.cobroId}) y ${cosa.nombre} es de ${MONEDA} ${pesos(c.total)}.`;
      await cosa.aRevision(tx, referencia, { ...datos, observacion });
      return "en-revision";
    }
    const motivo = await cosa.antesDePagar?.(tx, referencia, cobro.cobroId);
    if (motivo) {
      await cosa.aRevision(tx, referencia, { ...datos, observacion: motivo });
      return "en-revision";
    }
    if (!(await cosa.marcarPagada(tx, referencia, datos))) return "ya-pagado";
    await cosa.alPagarse(tx, referencia);
    const { nombre, payload } = cosa.evento(referencia);
    await emitir(nombre, tenantId, payload, undefined, { tx, unica: `${pasarela}:${cobro.cobroId}` });
    return "pagado";
  });
}

export type CobroDuplicadoVista = { referencia: string; pasarela: string; cobroId: string; monto: number; moneda: string; creadoEn: Date };

/** Los pagos duplicados de `modulo` en la banda (de esas referencias, o todos), para su panel. */
export async function cobrosDuplicados(
  modulo: Modulo,
  tenantId: string,
  referencias?: string[],
  reg: Registro = registroGlobal(),
): Promise<CobroDuplicadoVista[]> {
  if (reg.modulo(modulo.id) !== modulo) throw new ErrorPasarela(`"${modulo.id}" no es un módulo registrado.`);
  return conTenant(tenantId, (tx) =>
    tx.cobroDuplicado.findMany({
      where: { moduloId: modulo.id, ...(referencias ? { referencia: { in: referencias } } : {}) },
      select: { referencia: true, pasarela: true, cobroId: true, monto: true, moneda: true, creadoEn: true },
      orderBy: { creadoEn: "asc" },
    }),
  );
}
