// Correo del núcleo: lo usan los módulos (confirmación al fan, orden al proveedor).
// enviarCorreo() guarda la fila (en la transacción de quien lo pide, si la pasa) y el envío
// sale después de responder, como los eventos. Con `unica`, el mismo correo sale una vez.
import { after } from "next/server";
import { alConfirmar, conTenant, tenantDeTransaccion, type TxTenant } from "@/nucleo/db/con-tenant";
import { registro as registroGlobal } from "@/nucleo/modulos";
import type { Modulo } from "@/nucleo/modulos/contrato";
import type { Registro } from "@/nucleo/modulos/registro";
import { remitente, transporte } from "./transporte";

export { bandejaDeSalida, vaciarBandeja } from "./transporte";

export class ErrorCorreo extends Error {}

export type Correo = {
  para: string;
  asunto: string;
  html: string;
  /** Versión en texto plano (la leen algunos clientes y los filtros de spam). */
  texto: string;
  /** A quién le llega la respuesta (p. ej. el contacto de la banda). */
  responderA?: string;
  /** Nombre del remitente; por defecto, el nombre de la banda. La dirección es la de Deoco. */
  nombreRemitente?: string;
};

const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
const sinSaltos = (t: string) => /[\r\n]/.test(t);

function validar(c: Correo) {
  if (!EMAIL.test(c.para) || c.para.length > 254) throw new ErrorCorreo(`"${c.para}" no es una dirección de correo válida.`);
  if (c.responderA !== undefined && (!EMAIL.test(c.responderA) || c.responderA.length > 254)) {
    throw new ErrorCorreo(`"${c.responderA}" no es una dirección válida para responder.`);
  }
  if (!c.asunto.trim() || c.asunto.length > 200 || sinSaltos(c.asunto)) throw new ErrorCorreo("Asunto vacío, muy largo o con saltos de línea.");
  if (c.nombreRemitente !== undefined && (sinSaltos(c.nombreRemitente) || c.nombreRemitente.length > 100)) {
    throw new ErrorCorreo("Nombre de remitente inválido.");
  }
  if (!c.html.trim() || !c.texto.trim()) throw new ErrorCorreo("El correo necesita html y texto.");
}

/** Escapa texto para meterlo en el html de un correo. */
export function escaparHtml(t: string): string {
  return t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const colas = new Map<string, Promise<void>>();

function encolar(tenantId: string): Promise<void> {
  const actual = (colas.get(tenantId) ?? Promise.resolve())
    .then(() => entregarPendientes(tenantId))
    .catch((e) => console.error(`[correo] no se pudo procesar la cola de ${tenantId}: ${e instanceof Error ? e.message : e}`));
  colas.set(tenantId, actual);
  void actual.finally(() => {
    if (colas.get(tenantId) === actual) colas.delete(tenantId);
  });
  return actual;
}

function programar(tenantId: string) {
  try {
    after(() => encolar(tenantId));
  } catch {
    void encolar(tenantId); // fuera de un pedido de Next
  }
}

async function entregarPendientes(tenantId: string) {
  const t = transporte();
  if (!t) return; // sin transporte: quedan PENDIENTES hasta que se configure
  for (;;) {
    const fila = await conTenant(tenantId, async (tx) => {
      const c = await tx.correo.findFirst({ where: { estado: "PENDIENTE" }, orderBy: { creadoEn: "asc" } });
      if (!c) return null;
      // Tomarlo: si otro proceso lo tomó primero, no sale dos veces.
      const { count } = await tx.correo.updateMany({
        where: { id: c.id, estado: "PENDIENTE" },
        data: { estado: "ENVIANDO", intentos: { increment: 1 } },
      });
      return count === 1 ? c : undefined;
    });
    if (fila === null) return;
    if (!fila) continue;
    try {
      await t.enviar({
        id: fila.id,
        de: { nombre: fila.nombreRemitente, direccion: remitente() },
        para: fila.para,
        responderA: fila.responderA ?? undefined,
        asunto: fila.asunto,
        html: fila.html,
        texto: fila.texto,
      });
      await conTenant(tenantId, (tx) =>
        tx.correo.update({ where: { id: fila.id }, data: { estado: "ENVIADO", enviadoEn: new Date(), error: null } }),
      );
    } catch (e) {
      const error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      // Solo el motivo: ni el cuerpo ni el destinatario van al log.
      console.error(`[correo] falló el envío ${fila.id} de la banda ${tenantId}: ${error}`);
      await conTenant(tenantId, (tx) => tx.correo.update({ where: { id: fila.id }, data: { estado: "FALLIDO", error } }));
    }
  }
}

function moduloRegistrado(modulo: Modulo, reg: Registro) {
  if (reg.modulo(modulo.id) !== modulo) throw new ErrorCorreo(`"${modulo.id}" no es un módulo registrado.`);
}

/**
 * Pide un correo de la banda. Vuelve enseguida; sale después de responder.
 * `tx`: una transacción de conTenant de la misma banda (atómico con el dato: si se revierte,
 * el correo no existe). `unica`: si ya se pidió uno con esa clave en la banda, no se pide otro
 * (vuelve `repetido: true`).
 */
export async function enviarCorreo(
  modulo: Modulo,
  tenantId: string,
  correo: Correo,
  opciones: { tx?: TxTenant; unica?: string } = {},
  reg: Registro = registroGlobal(),
): Promise<{ id: string; repetido: boolean }> {
  moduloRegistrado(modulo, reg);
  validar(correo);
  const { tx, unica } = opciones;
  if (unica !== undefined && (!unica || unica.length > 200)) throw new ErrorCorreo("La clave única tiene que tener entre 1 y 200 caracteres.");

  const guardar = async (t: TxTenant) => {
    const nombreRemitente =
      correo.nombreRemitente ??
      (await t.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nombre: true } })).nombre.replace(/[\r\n]/g, " ");
    const data = {
      tenantId,
      moduloId: modulo.id,
      para: correo.para,
      responderA: correo.responderA,
      nombreRemitente,
      asunto: correo.asunto,
      html: correo.html,
      texto: correo.texto,
      claveUnica: unica,
    };
    if (unica === undefined) {
      const { id } = await t.correo.create({ data, select: { id: true } });
      return { id, repetido: false };
    }
    const { count } = await t.correo.createMany({ data: [data], skipDuplicates: true });
    const { id } = await t.correo.findFirstOrThrow({ where: { claveUnica: unica }, select: { id: true } });
    return { id, repetido: count === 0 };
  };

  if (!tx) {
    const r = await conTenant(tenantId, guardar);
    if (!r.repetido) programar(tenantId);
    return r;
  }
  if (tenantDeTransaccion(tx) !== tenantId) throw new ErrorCorreo("enviarCorreo({ tx }): la transacción es de otra banda o no es de conTenant.");
  const r = await guardar(tx);
  if (!r.repetido) alConfirmar(tx, () => programar(tenantId));
  return r;
}

/** Vuelve a intentar un correo FALLIDO. Resuelve cuando terminó el intento. */
export async function reintentarCorreo(tenantId: string, correoId: string) {
  const { count } = await conTenant(tenantId, (tx) =>
    tx.correo.updateMany({ where: { id: correoId, estado: "FALLIDO" }, data: { estado: "PENDIENTE" } }),
  );
  if (count === 0) throw new ErrorCorreo("Ese correo no existe en esta banda o no está fallido.");
  await encolar(tenantId);
}

/** Espera a que se vacíen las colas de envío. Para pruebas y cierres ordenados. */
export async function esperarCorreos() {
  while (colas.size > 0) await Promise.all([...colas.values()]);
}
