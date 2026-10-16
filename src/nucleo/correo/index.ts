// Correo del núcleo: lo usan los módulos (confirmación al fan, orden al proveedor) y el propio
// núcleo para avisarle algo a una banda de parte de Deoco (enviarCorreoDelNucleo).
// enviarCorreo() guarda la fila (en la transacción de quien lo pide, si la pasa) y el envío
// sale después de responder, como los eventos. Con `unica`, el mismo correo sale una vez.
import { after } from "next/server";
import { alConfirmar, conTenant, tenantDeTransaccion, type TxTenant } from "@/nucleo/db/con-tenant";
import { registro as registroGlobal } from "@/nucleo/modulos";
import type { Modulo } from "@/nucleo/modulos/contrato";
import type { Registro } from "@/nucleo/modulos/registro";
import { titularDeBanda } from "@/nucleo/personas";
import { esEmail } from "./direccion";
import { direccionDeEnvio } from "./remitente-banda";
import { remitente, transporte } from "./transporte";

export { esEmail } from "./direccion";
export { bandejaDeSalida, vaciarBandeja } from "./transporte";

export class ErrorCorreo extends Error {}

export type Correo = {
  para: string;
  asunto: string;
  html: string;
  /** Versión en texto plano (la leen algunos clientes y los filtros de spam). */
  texto: string;
  /**
   * A quién le llega la respuesta (p. ej. el contacto que cargó la banda). Si no se dice, al
   * titular de la banda: quien responde un mail de una banda nunca le escribe a Deoco.
   */
  responderA?: string;
  /** Nombre del remitente; por defecto, el nombre de la banda. La dirección es la de Deoco. */
  nombreRemitente?: string;
  /** Imágenes (con `cid`, se usan en el html como src="cid:<cid>") o archivos. Hasta 30, 1 MB en total. */
  adjuntos?: { nombre: string; tipo: string; cid?: string; contenido: Buffer }[];
};

const TIPOS_ADJUNTO = ["image/png", "image/jpeg", "application/pdf", "text/calendar", "application/json"]; // json: los datos de un fan que pidió acceso (D2)
type AdjuntoGuardado = { nombre: string; tipo: string; cid?: string; base64: string };

const sinSaltos = (t: string) => /[\r\n]/.test(t);

function validar(c: Correo) {
  if (!esEmail(c.para)) throw new ErrorCorreo(`"${c.para}" no es una dirección de correo válida.`);
  if (c.responderA !== undefined && !esEmail(c.responderA)) {
    throw new ErrorCorreo(`"${c.responderA}" no es una dirección válida para responder.`);
  }
  if (!c.asunto.trim() || c.asunto.length > 200 || sinSaltos(c.asunto)) throw new ErrorCorreo("Asunto vacío, muy largo o con saltos de línea.");
  if (c.nombreRemitente !== undefined && (sinSaltos(c.nombreRemitente) || c.nombreRemitente.length > 100)) {
    throw new ErrorCorreo("Nombre de remitente inválido.");
  }
  if (!c.html.trim() || !c.texto.trim()) throw new ErrorCorreo("El correo necesita html y texto.");
  const adjuntos = c.adjuntos ?? [];
  if (adjuntos.length > 30 || adjuntos.reduce((s, a) => s + a.contenido.length, 0) > 1024 * 1024) {
    throw new ErrorCorreo("Demasiados adjuntos (hasta 30, 1 MB en total).");
  }
  for (const a of adjuntos) {
    if (!TIPOS_ADJUNTO.includes(a.tipo)) throw new ErrorCorreo(`Tipo de adjunto no permitido: ${a.tipo}.`);
    if (!/^[\w .-]{1,100}$/.test(a.nombre) || (a.cid !== undefined && !/^[\w.-]{1,100}$/.test(a.cid))) {
      throw new ErrorCorreo(`Nombre o cid de adjunto inválido: ${a.nombre}.`);
    }
  }
}

/** Escapa texto para meterlo en el html de un correo. */
export function escaparHtml(t: string): string {
  return t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Espera antes de reintentar solo tras el 1.er y el 2.º fallo. Después del 3.º, a mano. */
export const ESPERA_REINTENTO_MS = [2 * 60_000, 15 * 60_000];
/** Un correo en ENVIANDO hace más que esto quedó colgado (el proceso murió mientras salía). */
export const CORREO_COLGADO_MS = 15 * 60_000;

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
  // Con su dominio verificado, los correos de la banda salen desde su dirección; los de Deoco
  // (núcleo y gestor de cuenta: la cuota, los dominios), no.
  const propia = await direccionDeEnvio(tenantId);
  const deDeoco = new Set([ORIGEN_NUCLEO, registroGlobal().gestor?.moduloId]);
  for (;;) {
    const fila = await conTenant(tenantId, async (tx) => {
      const c = await tx.correo.findFirst({ where: { estado: "PENDIENTE" }, orderBy: { creadoEn: "asc" } });
      if (!c) return null;
      // Tomarlo: si otro proceso lo tomó primero, no sale dos veces.
      const { count } = await tx.correo.updateMany({
        where: { id: c.id, estado: "PENDIENTE" },
        data: { estado: "ENVIANDO", intentos: { increment: 1 }, tomadoEn: new Date(), reintentarEn: null },
      });
      return count === 1 ? c : undefined;
    });
    if (fila === null) return;
    if (!fila) continue;
    try {
      await t.enviar({
        id: fila.id,
        de: { nombre: fila.nombreRemitente, direccion: (!deDeoco.has(fila.moduloId) && propia) || remitente() },
        para: fila.para,
        responderA: fila.responderA ?? undefined,
        asunto: fila.asunto,
        html: fila.html,
        texto: fila.texto,
        adjuntos: (fila.adjuntos as AdjuntoGuardado[]).map((a) => ({ nombre: a.nombre, tipo: a.tipo, cid: a.cid, contenido: Buffer.from(a.base64, "base64") })),
      });
      await conTenant(tenantId, (tx) =>
        tx.correo.update({ where: { id: fila.id }, data: { estado: "ENVIADO", enviadoEn: new Date(), error: null, tomadoEn: null } }),
      );
    } catch (e) {
      const error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      // Solo el motivo: ni el cuerpo ni el destinatario van al log.
      console.error(`[correo] falló el envío ${fila.id} de la banda ${tenantId}: ${error}`);
      // Los primeros fallos se reintentan solos (un SMTP caído un rato); después, a mano.
      const intentos = fila.intentos + 1;
      const espera = ESPERA_REINTENTO_MS[intentos - 1];
      const reintentarEn = espera === undefined ? null : new Date(Date.now() + espera);
      await conTenant(tenantId, (tx) =>
        tx.correo.update({ where: { id: fila.id }, data: { estado: "FALLIDO", error, tomadoEn: null, reintentarEn } }),
      );
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
  return pedirCorreo(modulo.id, tenantId, correo, opciones);
}

/** Origen de los correos que pide el núcleo (un id que ningún módulo puede tener). */
export const ORIGEN_NUCLEO = "nucleo";

/**
 * Un correo de Deoco a una banda, sin módulo de por medio (p. ej. los avisos de dominios). Mismo
 * camino que los de los módulos: queda en `correo`, sale después de responder, el barrido lo
 * retoma y `unica` evita mandarlo dos veces. Solo para el núcleo.
 */
export async function enviarCorreoDelNucleo(
  tenantId: string,
  correo: Correo,
  opciones: { tx?: TxTenant; unica?: string } = {},
): Promise<{ id: string; repetido: boolean }> {
  return pedirCorreo(ORIGEN_NUCLEO, tenantId, correo, opciones);
}

async function pedirCorreo(
  origen: string,
  tenantId: string,
  correo: Correo,
  opciones: { tx?: TxTenant; unica?: string },
): Promise<{ id: string; repetido: boolean }> {
  validar(correo);
  const { tx, unica } = opciones;
  if (unica !== undefined && (!unica || unica.length > 200)) throw new ErrorCorreo("La clave única tiene que tener entre 1 y 200 caracteres.");

  const guardar = async (t: TxTenant) => {
    const nombreRemitente =
      correo.nombreRemitente ??
      (await t.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nombre: true } })).nombre.replace(/[\r\n]/g, " ");
    const data = {
      tenantId,
      moduloId: origen,
      para: correo.para,
      // De una banda, sin "responder a": al titular. De Deoco: a nadie (no al propio titular).
      responderA: correo.responderA ?? (origen === ORIGEN_NUCLEO ? null : (await titularDeBanda(t))?.email),
      nombreRemitente,
      asunto: correo.asunto,
      html: correo.html,
      texto: correo.texto,
      adjuntos: (correo.adjuntos ?? []).map(
        (a): AdjuntoGuardado => ({ nombre: a.nombre, tipo: a.tipo, ...(a.cid ? { cid: a.cid } : {}), base64: a.contenido.toString("base64") }),
      ),
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
    tx.correo.updateMany({ where: { id: correoId, estado: "FALLIDO" }, data: { estado: "PENDIENTE", reintentarEn: null } }),
  );
  if (count === 0) throw new ErrorCorreo("Ese correo no existe en esta banda o no está fallido.");
  await encolar(tenantId);
}

/**
 * Lo usa el barrido: retoma los correos de la banda que quedaron sin salir.
 * - PENDIENTE: sale (el proceso se reinició antes de mandarlo, o no había transporte).
 * - FALLIDO con `reintentarEn` vencido: se reintenta.
 * - ENVIANDO hace más de CORREO_COLGADO_MS: el proceso murió mientras salía y no se sabe
 *   si llegó. Queda FALLIDO sin reintento automático (mejor uno que no llega que uno
 *   doble); se reintenta a mano.
 */
export async function retomarCorreos(tenantId: string, ahora = new Date()) {
  await conTenant(tenantId, async (tx) => {
    await tx.correo.updateMany({
      where: { estado: "ENVIANDO", tomadoEn: { lt: new Date(ahora.getTime() - CORREO_COLGADO_MS) } },
      data: {
        estado: "FALLIDO",
        tomadoEn: null,
        reintentarEn: null,
        error: "Se cortó mientras salía: no se sabe si llegó. No se reintenta solo para no mandarlo dos veces.",
      },
    });
    await tx.correo.updateMany({
      where: { estado: "FALLIDO", reintentarEn: { lte: ahora } },
      data: { estado: "PENDIENTE", reintentarEn: null },
    });
  });
  await encolar(tenantId);
}

/** Espera a que se vacíen las colas de envío. Para pruebas y cierres ordenados. */
export async function esperarCorreos() {
  while (colas.size > 0) await Promise.all([...colas.values()]);
}
