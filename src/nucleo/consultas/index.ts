// Consultas entre módulos: un módulo pide datos a otro por id (`<modulo>.<nombre>`),
// sin importar su código. El núcleo resuelve quién responde, si está prendido para la banda,
// y protege a quien pregunta: apagado, inexistente, lento o con error → su `vacio`.
import { registro as registroGlobal } from "@/nucleo/modulos";
import { modulosPrendidos } from "@/nucleo/modulos/encendido";
import type { Registro } from "@/nucleo/modulos/registro";

export type OpcionesConsulta<T> = {
  /** Lo que recibe quien pregunta si no hay respuesta (módulo apagado, error, demora). */
  vacio: T;
  /**
   * Convierte la respuesta (un valor JSON, `unknown`) a lo que espera quien pregunta. Si tira,
   * vuelve `vacio`. Quien pregunta no confía en la forma: la valida acá.
   */
  interpretar: (respuesta: unknown) => T;
  /** Se corta a los `esperaMs` (3000 por defecto) y vuelve `vacio`. */
  esperaMs?: number;
};

const ID_CONSULTA = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;

/**
 * Pide la consulta `id` (`<modulo>.<nombre>`) para la banda. Nunca tira: si el módulo que
 * responde no existe, está apagado para la banda, falla o tarda, devuelve `opciones.vacio`.
 */
export async function consultar<T>(
  tenantId: string,
  id: string,
  params: Record<string, unknown>,
  opciones: OpcionesConsulta<T>,
  reg: Registro = registroGlobal(),
): Promise<T> {
  const { vacio, interpretar, esperaMs = 3000 } = opciones;
  if (!ID_CONSULTA.test(id)) return vacio;
  const encontrada = reg.consulta(id);
  if (!encontrada) return vacio; // el módulo no está en este build: es normal, sin ruido
  let reloj: NodeJS.Timeout | undefined;
  try {
    if (!(await modulosPrendidos(tenantId, reg)).has(encontrada.moduloId)) return vacio;
    const respuesta = await Promise.race([
      encontrada.definicion.responder(tenantId, structuredClone(params)),
      new Promise<never>((_, rechazar) => {
        reloj = setTimeout(() => rechazar(new Error(`no respondió en ${esperaMs} ms`)), esperaMs);
      }),
    ]);
    // Copia: quien pregunta no comparte objetos con quien responde. Y tiene que ser JSON.
    return interpretar(JSON.parse(JSON.stringify(respuesta ?? null)));
  } catch (e) {
    console.error(`[consultas] ${id} para la banda ${tenantId}: ${e instanceof Error ? e.message : String(e)}`);
    return vacio;
  } finally {
    clearTimeout(reloj);
  }
}
