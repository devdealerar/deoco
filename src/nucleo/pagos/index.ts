// Cobros con la pasarela de la BANDA (hoy, Mercado Pago). El dinero nunca pasa por Deoco:
// el comprador le paga a la cuenta de la banda, con las credenciales que cargó el titular en
// Credenciales → Cobros (una sola vez para todos los módulos que cobran).
//
// Un módulo que cobra declara `cobros: true` y un aviso en "/pago/[pasarela]" (ahí le avisa la
// pasarela). Con su propio contrato:
//   - pasarelaLista(modulo, tenantId): ¿la banda puede cobrar?
//   - crearCobro(modulo, tenantId, cobro): adónde mandar al comprador.
//   - cobroDelAviso(modulo, aviso): del aviso, el cobro CONSULTADO a la API (fuente de verdad).
import { cache } from "react";
import { urlAviso } from "@/nucleo/avisos";
import { conTenant } from "@/nucleo/db/con-tenant";
import { registro as registroGlobal } from "@/nucleo/modulos";
import type { AvisoEntrante, DefinicionSecreto, Modulo, RespuestaAviso } from "@/nucleo/modulos/contrato";
import { modulosPrendidos } from "@/nucleo/modulos/encendido";
import type { Registro } from "@/nucleo/modulos/registro";
import { descifrar } from "@/nucleo/secretos/cifrado";
import { contextoSecreto } from "@/nucleo/secretos";
import { mercadoPago } from "./mercadopago";
import { type Cobro, type CobroConsultado, ErrorPasarela, type Pasarela } from "./tipos";

export { type Cobro, type CobroConsultado, type EstadoDeCobro, ErrorPasarela } from "./tipos";

/** Pasarelas disponibles. La primera es la de todas las bandas hasta que se pueda elegir. */
export const PASARELAS: Pasarela[] = [mercadoPago];
export const pasarelaDe = (id: string) => PASARELAS.find((p) => p.id === id);

/** "Módulo" con el que se guardan las credenciales de cobro en `secreto` (no es un módulo). */
export const ID_COBROS = "pagos";
/** Lo que el titular carga en Credenciales → Cobros. */
export const credencialesDeCobro = (): DefinicionSecreto[] => PASARELAS.flatMap((p) => p.credenciales);

/** ¿Algún módulo prendido de la banda cobra? (si no, Cobros no aparece en Credenciales). */
export async function bandaCobra(tenantId: string, reg: Registro = registroGlobal()): Promise<boolean> {
  const prendidos = await modulosPrendidos(tenantId, reg);
  return reg.modulos.some((m) => m.cobros && prendidos.has(m.id));
}

function exigirCobrador(modulo: Modulo, reg: Registro) {
  if (reg.modulo(modulo.id) !== modulo) throw new ErrorPasarela(`"${modulo.id}" no es un módulo registrado.`);
  if (!modulo.cobros) throw new ErrorPasarela(`"${modulo.id}" no declara cobros.`);
}

/** Credenciales de la banda para esa pasarela (solo las cargadas). Nunca salen del núcleo. */
const credencialesDe = (tenantId: string, pasarela: Pasarela) => credencialesPorId(tenantId, pasarela.id);

/** Una lectura por pedido (la piden la página, el formulario y el cobro). */
const credencialesPorId = cache(async (tenantId: string, pasarelaId: string): Promise<Record<string, string>> => {
  const pasarela = pasarelaDe(pasarelaId)!;
  const filas = await conTenant(tenantId, (tx) =>
    tx.secreto.findMany({ where: { moduloId: ID_COBROS, clave: { in: pasarela.credenciales.map((c) => c.clave) } } }),
  );
  return Object.fromEntries(filas.map((f) => [f.clave, descifrar(f.cifrado, contextoSecreto(tenantId, ID_COBROS, f.clave))]));
});

/**
 * ¿La banda puede cobrar con este módulo? El módulo prendido y su pasarela (hoy, Mercado Pago)
 * con las credenciales obligatorias cargadas por el titular.
 */
export async function pasarelaLista(
  modulo: Modulo,
  tenantId: string,
  reg: Registro = registroGlobal(),
): Promise<{ lista: boolean; pasarela: Pasarela; faltan: string[] }> {
  exigirCobrador(modulo, reg);
  const pasarela = PASARELAS[0];
  if (!(await modulosPrendidos(tenantId, reg)).has(modulo.id)) return { lista: false, pasarela, faltan: [] };
  const cred = await credencialesDe(tenantId, pasarela);
  const faltan = pasarela.obligatorias.filter((c) => !cred[c]).map((c) => pasarela.credenciales.find((d) => d.clave === c)?.etiqueta ?? c);
  return { lista: faltan.length === 0, pasarela, faltan };
}

/**
 * Crea el cobro en la cuenta de la banda y devuelve adónde mandar al comprador. El aviso de la
 * pasarela llega al módulo en app.<raiz>/avisos/<tenantId>/<modulo>/pago/<pasarela>.
 */
export async function crearCobro(
  modulo: Modulo,
  tenantId: string,
  cobro: Omit<Cobro, "urls"> & { urls: Omit<Cobro["urls"], "aviso"> },
  reg: Registro = registroGlobal(),
): Promise<{ pasarela: string; redireccion: string; preferenciaId: string }> {
  const { lista, pasarela } = await pasarelaLista(modulo, tenantId, reg);
  if (!lista) throw new ErrorPasarela("La banda no tiene la pasarela de cobro conectada.");
  // Toda venta de la banda (tienda, entradas) empieza acá: con la banda SUSPENDIDA o ARCHIVADA
  // por la cuota no se abre ninguna nueva. Lo ya cobrado sigue (los avisos se registran igual).
  const { estado } = await conTenant(tenantId, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { estado: true } }));
  if (estado === "SUSPENDIDO" || estado === "ARCHIVADO") throw new ErrorPasarela("La banda no está vendiendo en este momento.");
  const r = await pasarela.crearCobro(await credencialesDe(tenantId, pasarela), {
    ...cobro,
    urls: { ...cobro.urls, aviso: urlAviso(tenantId, modulo, `/pago/${pasarela.id}`) },
  });
  return { pasarela: pasarela.id, ...r };
}

/**
 * Aviso de la pasarela (lo atiende el módulo en "/pago/[pasarela]"). Del aviso solo se toma el
 * id del cobro (y se verifica la firma si la banda cargó la clave); el cobro se CONSULTA a la
 * API con las credenciales de la banda. Devuelve el cobro consultado, o la respuesta a dar si
 * no hay nada que registrar. Si la API no responde, tira (500: la pasarela reintenta).
 */
export async function cobroDelAviso(
  modulo: Modulo,
  aviso: AvisoEntrante,
  reg: Registro = registroGlobal(),
): Promise<{ pasarela: string; cobro: CobroConsultado } | { respuesta: RespuestaAviso }> {
  exigirCobrador(modulo, reg);
  const pasarela = pasarelaDe(aviso.params.pasarela ?? "");
  if (!pasarela) return { respuesta: { estado: 404, cuerpo: "Pasarela desconocida" } };
  const cred = await credencialesDe(aviso.tenantId, pasarela);
  if (!pasarela.obligatorias.every((c) => cred[c])) return { respuesta: { estado: 409, cuerpo: "La banda no tiene la pasarela conectada" } };
  let cobroId: string | null;
  try {
    cobroId = pasarela.leerAviso(aviso, cred);
  } catch (e) {
    if (e instanceof ErrorPasarela) return { respuesta: { estado: 401, cuerpo: e.message } };
    throw e;
  }
  if (!cobroId) return { respuesta: { cuerpo: "ignorado" } }; // no es un aviso de pago (200: que no reintente)
  return { pasarela: pasarela.id, cobro: await pasarela.consultarCobro(cred, cobroId) };
}

/**
 * Conciliación (los avisos se pierden): busca en la pasarela de la banda los cobros hechos con
 * esa referencia y los pasa a `registrar` (el registro del módulo, idempotente: lo ya registrado
 * no cambia). Para lo que sigue abierto un rato después de mandar al comprador a pagar. Sin
 * credenciales cargadas, no hace nada. Devuelve cuántos cobros encontró.
 */
export async function conciliarCobros(
  modulo: Modulo,
  tenantId: string,
  referencia: string,
  registrar: (pasarela: string, cobro: CobroConsultado) => Promise<unknown>,
  reg: Registro = registroGlobal(),
): Promise<number> {
  exigirCobrador(modulo, reg);
  let n = 0;
  for (const pasarela of PASARELAS) {
    const cred = await credencialesDe(tenantId, pasarela);
    if (!pasarela.obligatorias.every((c) => cred[c])) continue;
    for (const cobro of await pasarela.buscarCobros(cred, referencia)) {
      if (cobro.referencia !== referencia) continue;
      await registrar(pasarela.id, cobro);
      n++;
    }
  }
  return n;
}

/** A nombre de quién cobra la banda (para que el titular confirme que es su cuenta). */
export async function probarConexion(modulo: Modulo, tenantId: string, reg: Registro = registroGlobal()) {
  const { lista, pasarela } = await pasarelaLista(modulo, tenantId, reg);
  if (!lista) throw new ErrorPasarela("Faltan las credenciales de cobro.");
  return { pasarela: pasarela.nombre, ...(await pasarela.probarConexion(await credencialesDe(tenantId, pasarela))) };
}

/**
 * La banda devuelve un pago de su lista (duplicado, tardío o que no coincide) DESDE SU CUENTA:
 * Deoco le pide la devolución a la pasarela con las credenciales de la banda (la plata vuelve de
 * la banda al comprador; nunca pasa por Deoco). Idempotente (clave = el pago). Lo deja en la
 * auditoría con quien lo hizo.
 */
export async function devolverPagoDeLaBanda(tenantId: string, id: string, usuarioId: string): Promise<{ hecha: boolean }> {
  const fila = await conTenant(tenantId, (tx) => tx.cobroDuplicado.findUnique({ where: { id } }));
  if (!fila) throw new ErrorPasarela("Ese pago no está en la lista.");
  if (fila.devueltoEn) return { hecha: true };
  const pasarela = pasarelaDe(fila.pasarela);
  if (!pasarela) throw new ErrorPasarela("Pasarela desconocida.");
  const cred = await credencialesDe(tenantId, pasarela);
  if (!pasarela.obligatorias.every((c) => cred[c])) throw new ErrorPasarela("Faltan las credenciales de cobro: cargalas en Credenciales → Cobros.");
  const r = await pasarela.devolver(cred, fila.cobroId, `devolucion:${fila.id}`);
  await conTenant(tenantId, async (tx) => {
    await tx.cobroDuplicado.update({
      where: { id },
      data: { devolucionId: r.devolucionId, ...(r.hecha ? { devueltoEn: new Date(), devueltoPor: usuarioId, nota: `Devuelto desde Deoco (${pasarela.nombre}).` } : {}) },
    });
    await tx.auditoria.createMany({
      data: [{ usuarioId, tenantId, accion: "pagos.devolucion_pedida", detalle: { id, moduloId: fila.moduloId, referencia: fila.referencia, cobroId: fila.cobroId, monto: fila.monto, hecha: r.hecha } }],
    });
  });
  return { hecha: r.hecha };
}

/** La banda lo devolvió por su lado (o lo resolvió con el comprador): queda resuelto, con la nota. */
export async function marcarPagoDevuelto(tenantId: string, id: string, usuarioId: string, nota: string) {
  const texto = nota.trim().slice(0, 300);
  if (!texto) throw new ErrorPasarela("Contá cómo lo resolviste (p. ej. \"devuelto desde Mercado Pago el 3/11\").");
  await conTenant(tenantId, async (tx) => {
    const { count } = await tx.cobroDuplicado.updateMany({ where: { id, devueltoEn: null }, data: { devueltoEn: new Date(), devueltoPor: usuarioId, nota: texto } });
    if (count) await tx.auditoria.createMany({ data: [{ usuarioId, tenantId, accion: "pagos.devolucion_marcada", detalle: { id, nota: texto } }] });
  });
}
