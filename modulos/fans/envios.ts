// El newsletter: la banda escribe un envío y lo manda a los suscriptos confirmados. Sale desde la
// dirección de la banda si tiene su dominio de correo verificado; si no, desde Deoco (con el
// nombre de la banda). Cuánto sale por día lo pone la reputación del remitente, no el plan (un
// remitente nuevo que manda de golpe a miles termina en spam y arrastra a todas las bandas que
// salen desde Deoco): lo que no entra hoy sigue mañana solo (3.2: "el envío queda programado para
// el siguiente período").
import { prisma } from "@/nucleo/db/cliente";
import { conTenant, type TxTenant } from "@/nucleo/db/con-tenant";
import { enviarCorreo, escaparHtml as h } from "@/nucleo/correo";
import { direccionDeEnvio } from "@/nucleo/correo/remitente-banda";
import { estaSuprimido } from "@/nucleo/legal/derechos";
import { urlAviso } from "@/nucleo/avisos";
import { origenDeBanda } from "@/nucleo/publico/origen";
import { diaArgentino } from "@/nucleo/fechas";
import fans from "./index";
import { ErrorFans, tokenDeBaja } from "./contactos";

/** Cupo diario de un remitente que recién empieza: desde Deoco o desde su propio dominio. */
export const CUPO_INICIAL = { deoco: 200, propio: 500 };
/** Hasta dónde crece el cupo diario. */
export const CUPO_MAXIMO = { deoco: 2000, propio: 20000 };
/** Una semana es buena si se dio de baja menos de esta proporción de lo enviado. */
export const BAJAS_ACEPTABLES = 0.02;
/** Cuántos mails salen por vuelta del barrido, como mucho. */
const POR_TANDA = 100;

const SEMANA = 7 * 86_400_000;

/** Inicio del día argentino de `d`. */
const inicioDelDia = (d: Date) => new Date(`${diaArgentino(d)}T00:00:00.000-03:00`);

/**
 * El cupo de hoy: arranca en CUPO_INICIAL y se duplica por cada semana buena seguida (la más
 * reciente primero; una semana sin envíos no suma ni corta; una con muchas bajas vuelve al
 * inicial), hasta CUPO_MAXIMO.
 */
export async function cupoDiario(tenantId: string, ahora = new Date()): Promise<{ cupo: number; usado: number; propio: boolean; semanasBuenas: number }> {
  const propio = !!(await direccionDeEnvio(tenantId));
  const tipo = propio ? "propio" : "deoco";
  const hoy = inicioDelDia(ahora);
  return conTenant(tenantId, async (tx) => {
    let semanasBuenas = 0;
    for (let i = 0; i < 8; i++) {
      const hasta = new Date(hoy.getTime() - i * SEMANA);
      const desde = new Date(hasta.getTime() - SEMANA);
      const enviadas = await tx.fansEntrega.count({ where: { estado: "ENVIADA", enviadaEn: { gte: desde, lt: hasta } } });
      if (!enviadas) continue;
      const bajas = await tx.fansEntrega.count({ where: { estado: "ENVIADA", enviadaEn: { gte: desde, lt: hasta }, bajaEn: { not: null } } });
      if (bajas / enviadas >= BAJAS_ACEPTABLES) break;
      semanasBuenas++;
    }
    const cupo = Math.min(CUPO_MAXIMO[tipo], CUPO_INICIAL[tipo] * 2 ** semanasBuenas);
    const usado = await tx.fansEntrega.count({ where: { estado: "ENVIADA", enviadaEn: { gte: hoy } } });
    return { cupo, usado, propio, semanasBuenas };
  });
}

const limpiarTexto = (t: string, max: number) => t.replace(/\r\n/g, "\n").trim().slice(0, max);

export async function guardarBorrador(tenantId: string, usuarioId: string, d: { id?: string; asunto: string; cuerpo: string }): Promise<string> {
  const asunto = limpiarTexto(d.asunto, 150).replace(/\n/g, " ");
  const cuerpo = limpiarTexto(d.cuerpo, 20000);
  if (!asunto) throw new ErrorFans("Falta el asunto.");
  if (!cuerpo) throw new ErrorFans("Falta el texto.");
  return conTenant(tenantId, async (tx) => {
    if (d.id) {
      const { count } = await tx.fansEnvio.updateMany({ where: { id: d.id, estado: "BORRADOR" }, data: { asunto, cuerpo } });
      if (!count) throw new ErrorFans("Ese envío ya salió: no se puede cambiar.");
      return d.id;
    }
    return (await tx.fansEnvio.create({ data: { tenantId, asunto, cuerpo, creadoPor: usuarioId } })).id;
  });
}

/**
 * Manda el envío: una entrega por suscripto confirmado en este momento (quien se suscriba
 * después no lo recibe; quien se dé de baja antes de que le salga, tampoco). Sale por tandas,
 * con el cupo del día.
 */
export async function mandarEnvio(tenantId: string, envioId: string, usuarioId: string, ahora = new Date()): Promise<{ destinatarios: number }> {
  const r = await conTenant(tenantId, async (tx) => {
    const envio = await tx.fansEnvio.findUnique({ where: { tenantId_id: { tenantId, id: envioId } } });
    if (!envio) throw new ErrorFans("Ese envío no existe.");
    if (envio.estado !== "BORRADOR") throw new ErrorFans("Ese envío ya se mandó.");
    const contactos = await tx.fansContacto.findMany({ where: { newsletter: "confirmado" }, select: { id: true } });
    if (!contactos.length) throw new ErrorFans("Todavía no hay suscriptos confirmados.");
    await tx.fansEntrega.createMany({ data: contactos.map((c) => ({ tenantId, envioId, contactoId: c.id })) });
    await tx.fansEnvio.update({ where: { id: envioId }, data: { estado: "ENVIANDO", enviadoEn: ahora } });
    await tx.auditoria.create({ data: { usuarioId, tenantId, accion: "fans.envio_mandado", detalle: { envioId, asunto: envio.asunto, destinatarios: contactos.length } } });
    return { destinatarios: contactos.length };
  });
  void enviarTanda(tenantId).catch((e) => console.error(`[fans] tanda de ${tenantId}:`, e instanceof Error ? e.message : e));
  return r;
}

/** Cancela lo que falta de un envío en curso (lo que ya salió, salió). */
export async function cancelarEnvio(tenantId: string, envioId: string, usuarioId: string): Promise<void> {
  await conTenant(tenantId, async (tx) => {
    const { count } = await tx.fansEnvio.updateMany({ where: { id: envioId, estado: { in: ["BORRADOR", "ENVIANDO"] } }, data: { estado: "CANCELADO", terminadoEn: new Date() } });
    if (!count) throw new ErrorFans("Ese envío ya terminó.");
    await tx.fansEntrega.updateMany({ where: { envioId, estado: "PENDIENTE" }, data: { estado: "SALTEADA" } });
    await tx.auditoria.create({ data: { usuarioId, tenantId, accion: "fans.envio_cancelado", detalle: { envioId } } });
  });
}

/** Párrafos del texto plano → html escapado (sin html de la banda: nada que rompa el mail). */
const parrafos = (t: string) =>
  t
    .split(/\n{2,}/)
    .map((p) => `<p>${h(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");

async function correoDeEntrega(tx: TxTenant, tenantId: string, envio: { asunto: string; cuerpo: string }, entrega: { id: string; contactoId: string }, banda: string, sitio: string | null) {
  const token = await tokenDeBaja(tx, tenantId, entrega.contactoId);
  // El id de la entrega (no es secreto) cuenta la baja en este envío; el token va después de "#".
  const baja = sitio ? `${sitio}/novedades/baja?e=${entrega.id}#${token}` : null;
  // Baja en un clic desde el cliente de correo (RFC 8058): un POST a esta URL, sin abrir nada.
  const bajaDirecta = `${urlAviso(tenantId, fans, `/baja/${entrega.id}`)}?t=${token}`;
  const pixel = urlAviso(tenantId, fans, `/abierto/${entrega.id}`);
  const pie = `Recibís este mail porque te suscribiste a las novedades de ${banda}. Podés darte de baja cuando quieras, con un clic${baja ? `: ${baja}` : " desde el link de baja de tu cliente de correo"}. También podés pedir el acceso, la corrección o el borrado de tus datos${sitio ? ` en ${sitio}/datos-personales` : ""}.`;
  return {
    asunto: envio.asunto,
    html: `${parrafos(envio.cuerpo)}
<hr>
<p style="font-size:12px;color:#666">Recibís este mail porque te suscribiste a las novedades de ${h(banda)}. ${baja ? `<a href="${h(baja)}">Darme de baja</a> (un clic).` : ""} También podés pedir el acceso, la corrección o el borrado de tus datos${sitio ? ` en <a href="${h(`${sitio}/datos-personales`)}">${h(`${sitio}/datos-personales`)}</a>` : ""}.</p>
<img src="${h(pixel)}" width="1" height="1" alt="">`,
    texto: `${envio.cuerpo}\n\n--\n${pie}`,
    cabeceras: { "List-Unsubscribe": `<${bajaDirecta}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" as const },
  };
}

/**
 * Una tanda de una banda: lo pendiente de sus envíos en curso, hasta el cupo de hoy (y POR_TANDA).
 * Cada entrega se toma en la base antes de pedir su mail (nunca dos veces) y el mail se pide con
 * clave única por entrega.
 */
export async function enviarTanda(tenantId: string, ahora = new Date()): Promise<number> {
  const { cupo } = await cupoDiario(tenantId, ahora);
  const hoy = inicioDelDia(ahora);
  let quedan = POR_TANDA;
  let salieron = 0;
  const sitio = await origenDeBanda(tenantId);
  const banda = (await conTenant(tenantId, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nombre: true } }))).nombre;
  while (quedan > 0) {
    const entrega = await conTenant(tenantId, async (tx) => {
      // Dos tandas a la vez (la del botón y la del barrido) no se pasan del cupo: una por banda.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:fans:cupo`}))`;
      if ((await tx.fansEntrega.count({ where: { estado: "ENVIADA", enviadaEn: { gte: hoy } } })) >= cupo) return null;
      const e = await tx.fansEntrega.findFirst({
        where: { estado: "PENDIENTE", envio: { estado: "ENVIANDO" } },
        orderBy: [{ envio: { enviadoEn: "asc" } }, { id: "asc" }],
        include: { contacto: { select: { email: true, newsletter: true } }, envio: { select: { asunto: true, cuerpo: true } } },
      });
      if (!e) return null;
      // Se dio de baja (o pidió borrar sus datos) después de que se armó el envío: no sale.
      const sigue = e.contacto.newsletter === "confirmado" && !(await estaSuprimido(tenantId, e.contacto.email));
      const { count } = await tx.fansEntrega.updateMany({ where: { id: e.id, estado: "PENDIENTE" }, data: sigue ? { estado: "ENVIADA", enviadaEn: ahora } : { estado: "SALTEADA" } });
      if (!count || !sigue) return { saltear: true as const };
      const correo = await correoDeEntrega(tx, tenantId, e.envio, e, banda, sitio);
      await enviarCorreo(fans, tenantId, { para: e.contacto.email, ...correo }, { tx, unica: `fans:${e.id}` });
      return { saltear: false as const };
    });
    if (!entrega) break;
    if (entrega.saltear) continue;
    salieron++;
    quedan--;
  }
  // Los envíos sin nada pendiente terminaron.
  await conTenant(tenantId, async (tx) => {
    const enCurso = await tx.fansEnvio.findMany({ where: { estado: "ENVIANDO" }, select: { id: true } });
    for (const { id } of enCurso) {
      if (!(await tx.fansEntrega.count({ where: { envioId: id, estado: "PENDIENTE" } }))) {
        await tx.fansEnvio.update({ where: { id }, data: { estado: "ENVIADO", terminadoEn: ahora } });
      }
    }
  });
  return salieron;
}

/** Tarea del barrido: las bandas con envíos en curso (solo ids; cada una con su cupo). */
export async function enviarTandas(ahora = new Date()): Promise<void> {
  const bandas = await prisma.$queryRaw<{ id: string }[]>`SELECT b AS id FROM fans_bandas_con_envios() AS b`;
  for (const { id } of bandas) {
    await enviarTanda(id, ahora).catch((e) => console.error(`[fans] tanda de ${id}:`, e instanceof Error ? e.message : e));
  }
}

/** El mail se abrió (la imagen de 1 píxel): solo la primera vez y cuándo. */
export async function marcarAbierta(tenantId: string, entregaId: string, ahora = new Date()): Promise<void> {
  if (!/^[0-9a-f-]{36}$/.test(entregaId)) return;
  await conTenant(tenantId, (tx) => tx.fansEntrega.updateMany({ where: { id: entregaId, estado: "ENVIADA", abiertaEn: null }, data: { abiertaEn: ahora } }));
}

export async function listarEnvios(tenantId: string) {
  return conTenant(tenantId, async (tx) => {
    const envios = await tx.fansEnvio.findMany({ orderBy: { creadoEn: "desc" }, take: 100 });
    return Promise.all(envios.map(async (e) => ({ ...e, ...(await estadisticas(tx, e.id)) })));
  });
}

async function estadisticas(tx: TxTenant, envioId: string) {
  const [destinatarios, enviadas, abiertas, bajas, pendientes] = await Promise.all([
    tx.fansEntrega.count({ where: { envioId } }),
    tx.fansEntrega.count({ where: { envioId, estado: "ENVIADA" } }),
    tx.fansEntrega.count({ where: { envioId, abiertaEn: { not: null } } }),
    tx.fansEntrega.count({ where: { envioId, bajaEn: { not: null } } }),
    tx.fansEntrega.count({ where: { envioId, estado: "PENDIENTE" } }),
  ]);
  return { destinatarios, enviadas, abiertas, bajas, pendientes };
}

export async function envioDeBanda(tenantId: string, envioId: string) {
  return conTenant(tenantId, async (tx) => {
    const e = await tx.fansEnvio.findUnique({ where: { tenantId_id: { tenantId, id: envioId } } });
    return e ? { ...e, ...(await estadisticas(tx, e.id)) } : null;
  });
}
