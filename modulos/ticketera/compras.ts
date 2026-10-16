// Compra de entradas. El cupo lo garantiza la base: `ticketera_tipo.ocupadas` (vendidas +
// reservadas vigentes) tiene un CHECK ocupadas <= cupo, y cada compra suma a esa fila con la
// fila bloqueada. Dos compras a la vez no pasan el cupo: la segunda espera el bloqueo y ve el
// número nuevo. Una reserva sin pagar vence a los RESERVA_MINUTOS y libera su lugar.
//
// El pago es el del núcleo (@/nucleo/pagos), con la pasarela de la banda: la plata va a la
// banda. La fuente de verdad es la CONSULTA a la API, nunca el aviso.
import { createHash, randomUUID } from "node:crypto";
import { versionDePrivacidad } from "@/nucleo/legal";
import { conTenant, type TxTenant } from "@/nucleo/db/con-tenant";
import { type CobroConsultado, conciliarCobros, crearCobro, ErrorPasarela, pasarelaLista } from "@/nucleo/pagos";
import { prisma } from "@/nucleo/db/cliente";
import { documentoFiscal, fotoFiscal } from "@/nucleo/fiscal";
import { contextoDeToken, nuevoTokenDeAcceso, tokenCoincide } from "@/nucleo/publico/token";
import { type CosaACobrar, registrarCobro, type ResultadoCobro } from "@/nucleo/pagos/registro";
import { mensajeParaElPublico } from "@/nucleo/publico/errores";
import { ErrorTicketera, esUuid } from "./eventos";
import { codigoFirmado, nuevoCodigo } from "./firma";
import ticketera from "./index";
import { esEmail } from "@/nucleo/correo/direccion";

// Frenos contra el acaparamiento (un script que reserva un show entero y lo mantiene "agotado").
// Estos son los de la plataforma; cada show puede tener los suyos (`frenosDe`), acotados por la base.
/** La reserva vence rápido: el lugar vuelve si no se paga. El cobro vence con ella. */
export const RESERVA_MINUTOS = 10;
/** Entradas por compra. */
export const MAXIMO_POR_COMPRA = 6;
/** Por email y show: entradas sumando las pagadas y las reservadas vigentes. */
export const MAXIMO_POR_EMAIL_Y_SHOW = 12;
/** Compras esperando el pago a la vez, por email (en toda la banda). */
export const RESERVAS_ABIERTAS_POR_EMAIL = 2;
/** Compras esperando el pago a la vez, por IP (en toda la banda). */
export const RESERVAS_ABIERTAS_POR_IP = 4;

/** Tope duro del formulario (el del show nunca pasa de acá: CHECK en la base). */
export const MAXIMO_ABSOLUTO_POR_COMPRA = 20;

export type Frenos = { reservaMinutos: number; maxPorCompra: number; maxPorPersona: number; reservasPorEmail: number; reservasPorIp: number };

/** Los frenos que valen para un show: los suyos y, donde no tiene, los de la plataforma. */
export function frenosDe(e: Partial<Record<keyof Frenos, number | null>>): Frenos {
  return {
    reservaMinutos: e.reservaMinutos ?? RESERVA_MINUTOS,
    maxPorCompra: e.maxPorCompra ?? MAXIMO_POR_COMPRA,
    maxPorPersona: e.maxPorPersona ?? MAXIMO_POR_EMAIL_Y_SHOW,
    reservasPorEmail: e.reservasPorEmail ?? RESERVAS_ABIERTAS_POR_EMAIL,
    reservasPorIp: e.reservasPorIp ?? RESERVAS_ABIERTAS_POR_IP,
  };
}

/** Hash de la IP para el freno: se guarda esto, nunca la IP. */
export const hashIp = (tenantId: string, ip: string) => createHash("sha256").update(`${tenantId}:${ip}`).digest("hex");

/**
 * Hasta cuándo se acepta el pago de una compra: al cerrar la venta de ese tipo (la preventa) o al
 * empezar el show, lo que pase primero. Después, un pago que llega no se entrega: va a devolución.
 */
export const cierreDeVenta = (tipo: { ventaHasta: Date | null }, evento: { fecha: Date }) =>
  tipo.ventaHasta && tipo.ventaHasta < evento.fecha ? tipo.ventaHasta : evento.fecha;
const DOCUMENTO = /^[0-9A-Za-z.\- ]{5,20}$/;

export type Asistente = { nombre: string; documento: string };
export type DatosCompra = { tipoId: string; cantidad: number; nombre: string; email: string; asistentes: Asistente[]; documento?: string };

function validar(d: DatosCompra): DatosCompra {
  const nombre = d.nombre.trim().replace(/\s+/g, " ");
  const email = d.email.trim().toLowerCase();
  const problemas: string[] = [];
  if (!esUuid(d.tipoId)) problemas.push("Elegí el tipo de entrada.");
  if (!Number.isInteger(d.cantidad) || d.cantidad < 1 || d.cantidad > MAXIMO_ABSOLUTO_POR_COMPRA) problemas.push("Elegí cuántas entradas querés.");
  if (nombre.length < 2 || nombre.length > 100) problemas.push("Completá tu nombre.");
  if (!esEmail(email)) problemas.push("Revisá tu email: ahí te llegan las entradas.");
  const asistentes = d.asistentes.map((a) => ({ nombre: a.nombre.trim().replace(/\s+/g, " "), documento: a.documento.trim().replace(/\s+/g, " ") }));
  if (asistentes.length !== d.cantidad) problemas.push("Cada entrada va a nombre de alguien: completá todas.");
  asistentes.forEach((a, i) => {
    if (a.nombre.length < 2 || a.nombre.length > 100) problemas.push(`Entrada ${i + 1}: falta el nombre.`);
    if (!DOCUMENTO.test(a.documento)) problemas.push(`Entrada ${i + 1}: el documento no parece válido.`);
  });
  const doc = (d.documento ?? "").trim();
  const documento = doc ? documentoFiscal(doc) : null;
  if (doc && !documento) problemas.push("Revisá el DNI o CUIT (o dejalo vacío).");
  if (problemas.length) throw new ErrorTicketera(problemas.join(" "));
  return { ...d, nombre, email, asistentes, documento: documento ?? undefined };
}

/**
 * Los frenos contra el acaparamiento, en la transacción de la compra. El mensaje es para el fan:
 * dice qué hacer, nunca cómo se detecta.
 */
async function exigirFrenos(tx: TxTenant, f: Frenos, q: { email: string; ipHash: string | null; eventoId: string; cantidad: number }, ahora: Date) {
  if (q.cantidad > f.maxPorCompra) throw new ErrorTicketera(`Podés comprar de 1 a ${f.maxPorCompra} entradas.`);
  const vigente = { OR: [{ estado: "PAGADA" as const }, { estado: "RESERVADA" as const, venceEn: { gt: ahora } }] };
  const abiertas = { estado: "RESERVADA" as const, venceEn: { gt: ahora } };
  const [delEmail, delShow, deLaIp] = await Promise.all([
    tx.ticketeraCompra.count({ where: { email: q.email, ...abiertas } }),
    tx.ticketeraCompra.aggregate({ where: { email: q.email, eventoId: q.eventoId, ...vigente }, _sum: { cantidad: true } }),
    q.ipHash ? tx.ticketeraCompra.count({ where: { ipHash: q.ipHash, ...abiertas } }) : Promise.resolve(0),
  ]);
  if (delEmail >= f.reservasPorEmail || deLaIp >= f.reservasPorIp) {
    throw new ErrorTicketera(`Ya tenés compras esperando el pago. Terminalas (o esperá ${f.reservaMinutos} minutos a que venzan) y volvé a intentar.`);
  }
  const yaTiene = delShow._sum.cantidad ?? 0;
  if (yaTiene + q.cantidad > f.maxPorPersona) {
    const quedan = Math.max(0, f.maxPorPersona - yaTiene);
    throw new ErrorTicketera(`Para este show se pueden comprar hasta ${f.maxPorPersona} entradas por persona${quedan ? `: te quedan ${quedan}` : " y ya llegaste"}.`);
  }
}

/** Bloquea la fila del tipo (las compras de ese tipo pasan de a una). */
async function bloquearTipo(tx: TxTenant, tipoId: string) {
  const [t] = await tx.$queryRaw<{ id: string; cupo: number; ocupadas: number }[]>`
    SELECT id, cupo, ocupadas FROM ticketera_tipo WHERE id = ${tipoId}::uuid FOR UPDATE`;
  return t ?? null;
}

const sumarOcupadas = (tx: TxTenant, tipoId: string, n: number) =>
  tx.$executeRaw`UPDATE ticketera_tipo SET ocupadas = ocupadas + ${n} WHERE id = ${tipoId}::uuid`;

/** Reservas vencidas de un tipo → VENCIDA, y devuelven su lugar. Con el tipo bloqueado. */
async function liberarVencidas(tx: TxTenant, tipoId: string, ahora: Date) {
  const vencidas = await tx.ticketeraCompra.findMany({ where: { tipoId, estado: "RESERVADA", venceEn: { lt: ahora } } });
  for (const c of vencidas) {
    const { count } = await tx.ticketeraCompra.updateMany({ where: { id: c.id, estado: "RESERVADA" }, data: { estado: "VENCIDA" } });
    if (count) await sumarOcupadas(tx, tipoId, -c.cantidad);
  }
}

/**
 * Reserva las entradas (ocupa cupo) y crea el cobro en la pasarela de la banda. Devuelve la
 * compra y adónde mandar al fan. Sin cupo, fuera de la ventana de venta o sin pasarela: no.
 */
export async function comprar(tenantId: string, datos: DatosCompra, origen: string, ahora = new Date(), ip: string | null = null) {
  const d = validar(datos);
  const ipHash = ip ? hashIp(tenantId, ip) : null;
  const { lista } = await pasarelaLista(ticketera, tenantId);
  if (!lista) throw new ErrorTicketera("La venta de entradas no está disponible en este momento.");
  // El token de acceso del fan: en la base solo su hash y su cifrado (nunca en claro).
  const compraId = randomUUID();
  const acceso = nuevoTokenDeAcceso(contextoDeToken(tenantId, ticketera.id, compraId), 16);
  const privacidadVersion = await versionDePrivacidad(tenantId);
  const compra = await conTenant(tenantId, async (tx) => {
    const bloqueado = await bloquearTipo(tx, d.tipoId);
    if (!bloqueado) throw new ErrorTicketera("Ese tipo de entrada no existe.");
    const tipo = await tx.ticketeraTipo.findUniqueOrThrow({ where: { id: d.tipoId }, include: { evento: true } });
    if (!tipo.evento.publicado || tipo.evento.fecha < new Date(ahora.getTime() - 6 * 3600_000)) throw new ErrorTicketera("Ese show no está a la venta.");
    if (tipo.ventaDesde && ahora < tipo.ventaDesde) throw new ErrorTicketera(`La venta de "${tipo.nombre}" todavía no empezó.`);
    if (tipo.ventaHasta && ahora > tipo.ventaHasta) throw new ErrorTicketera(`La venta de "${tipo.nombre}" ya terminó.`);
    await liberarVencidas(tx, tipo.id, ahora);
    const frenos = frenosDe(tipo.evento);
    await exigirFrenos(tx, frenos, { email: d.email, ipHash, eventoId: tipo.eventoId, cantidad: d.cantidad }, ahora);
    const ocupadas = (await bloquearTipo(tx, d.tipoId))!.ocupadas;
    const quedan = tipo.cupo - ocupadas;
    if (quedan < d.cantidad) {
      throw new ErrorTicketera(quedan === 0 ? `"${tipo.nombre}" está agotada.` : `De "${tipo.nombre}" quedan ${quedan}.`);
    }
    // Si dos llegan juntas, la base corta igual (CHECK ocupadas <= cupo): para el fan, agotada.
    await sumarOcupadas(tx, tipo.id, d.cantidad).catch((e) => {
      if (String(e?.message).includes("ticketera_tipo_cupo")) throw new ErrorTicketera(`"${tipo.nombre}" está agotada.`);
      throw e;
    });
    return tx.ticketeraCompra.create({
      data: {
        tenantId,
        eventoId: tipo.eventoId,
        tipoId: tipo.id,
        cantidad: d.cantidad,
        precioUnitario: tipo.precio,
        total: tipo.precio * d.cantidad,
        nombre: d.nombre,
        email: d.email,
        asistentes: d.asistentes,
        venceEn: new Date(ahora.getTime() + frenos.reservaMinutos * 60_000),
        id: compraId,
        tokenHash: acceso.hash,
        tokenCifrado: acceso.cifrado,
        ipHash,
        documento: d.documento ?? null,
        privacidadVersion,
      },
      include: { evento: true, tipo: true },
    });
  });

  // Sin el token: la pasarela guarda estas direcciones. Al volver, la página lo lee de la cookie.
  const volver = (r: string) => `${origen}/fechas/compra/${compra.id}?resultado=${r}`;
  try {
    const cobro = await crearCobro(ticketera, tenantId, {
      referencia: compra.id,
      items: [{ titulo: `${compra.evento.nombre} · ${compra.tipo.nombre}`, cantidad: compra.cantidad, precioUnitario: compra.precioUnitario }],
      extras: [],
      total: compra.total,
      comprador: { nombre: compra.nombre, email: compra.email },
      urls: { exito: volver("exito"), fallo: volver("fallo"), pendiente: volver("pendiente") },
      // El cobro vence con la reserva y solo con medios inmediatos: nadie paga en efectivo tres
      // días después un lugar que ya se liberó.
      vence: compra.venceEn,
      soloInmediatos: true,
    });
    await conTenant(tenantId, (tx) =>
      tx.ticketeraCompra.update({ where: { id: compra.id }, data: { pasarela: cobro.pasarela, preferenciaId: cobro.preferenciaId, urlPago: cobro.redireccion } }),
    );
    return { compraId: compra.id, token: acceso.token, redireccion: cobro.redireccion };
  } catch (e) {
    // Sin cobro, la reserva no sirve: libera el lugar ya.
    await conTenant(tenantId, async (tx) => {
      await bloquearTipo(tx, compra.tipoId);
      const { count } = await tx.ticketeraCompra.updateMany({ where: { id: compra.id, estado: "RESERVADA" }, data: { estado: "VENCIDA", observacion: "No se pudo crear el cobro." } });
      if (count) await sumarOcupadas(tx, compra.tipoId, -compra.cantidad);
    });
    if (e instanceof ErrorPasarela) throw new ErrorTicketera("No pudimos abrir el pago. Probá de nuevo en un rato: no se te cobró nada.");
    throw e;
  }
}

/**
 * Lo que corre la compra desde el sitio: nunca tira. Al fan le llega "agotada", "quedan N", un
 * dato a corregir o "hay mucha gente comprando, probá de nuevo"; jamás un error técnico.
 */
export async function intentarComprar(
  tenantId: string,
  datos: DatosCompra,
  origen: string,
  ahora = new Date(),
  ip: string | null = null,
): Promise<{ ok: true; compraId: string; token: string; redireccion: string } | { ok: false; error: string }> {
  try {
    return { ok: true, ...(await comprar(tenantId, datos, origen, ahora, ip)) };
  } catch (e) {
    if (e instanceof ErrorTicketera) return { ok: false, error: e.message };
    return { ok: false, error: mensajeParaElPublico(e, "ticketera: compra") };
  }
}

// ---------- Pago ----------


export type ResultadoPago = "pagada" | "ya-pagada" | Exclude<ResultadoCobro, "pagado" | "ya-pagado">;

/** Una compra de entradas, como la cobra el registro del núcleo (registrarCobro). */
const compraACobrar: CosaACobrar = {
  nombre: "la compra",
  async buscar(tx, id) {
    const previa = await tx.ticketeraCompra.findUnique({ where: { id }, select: { tipoId: true } });
    if (!previa) return null;
    await bloquearTipo(tx, previa.tipoId); // el cupo no se mueve mientras se registra
    const c = await tx.ticketeraCompra.findUniqueOrThrow({ where: { id }, include: { tipo: true, evento: true } }); // releída con el tipo bloqueado
    // Pasado el cierre de la venta (o empezado el show), lo que no se pagó ya no se puede pagar.
    const cerrada = c.estado === "DEVUELTA" || ((c.estado === "RESERVADA" || c.estado === "VENCIDA") && new Date() >= cierreDeVenta(c.tipo, c.evento));
    const estado = cerrada ? "cerrada" : c.estado === "PAGADA" ? "pagada" : c.estado === "EN_REVISION" ? "en-revision" : "abierta";
    return { estado, total: c.total, cobroId: c.cobroId };
  },
  async anotarEstado(tx, id, estadoCobro) {
    await tx.ticketeraCompra.update({ where: { id }, data: { estadoCobro } });
  },
  // Pagó después de que venció la reserva: entra si todavía hay lugar (y lo vuelve a ocupar).
  async antesDePagar(tx, id, cobroId) {
    const c = await tx.ticketeraCompra.findUniqueOrThrow({ where: { id } });
    if (c.estado !== "VENCIDA") return null;
    const t = (await bloquearTipo(tx, c.tipoId))!;
    if (t.cupo - t.ocupadas < c.cantidad) return `Pagó (cobro ${cobroId}) cuando la reserva ya había vencido y no queda cupo. Está en Pagos para devolver.`;
    await sumarOcupadas(tx, c.tipoId, c.cantidad);
    return null;
  },
  async aRevision(tx, id, cobro) {
    const c = await tx.ticketeraCompra.findUniqueOrThrow({ where: { id } });
    if (c.estado === "RESERVADA") await sumarOcupadas(tx, c.tipoId, -c.cantidad); // no se queda con el lugar
    await tx.ticketeraCompra.update({
      where: { id },
      data: { estado: "EN_REVISION", cobroId: cobro.cobroId, estadoCobro: cobro.estadoPasarela, pasarela: cobro.pasarela, observacion: cobro.observacion },
    });
  },
  async marcarPagada(tx, id, cobro) {
    const { count } = await tx.ticketeraCompra.updateMany({
      where: { id, estado: { in: ["RESERVADA", "VENCIDA"] } },
      data: { estado: "PAGADA", pagadaEn: new Date(), cobroId: cobro.cobroId, estadoCobro: cobro.estadoPasarela, pasarela: cobro.pasarela },
    });
    return count === 1;
  },
  // Devuelto o contracargo del pago: las entradas dejan de valer en la puerta y el lugar vuelve.
  async alDevolverse(tx, id, cobro) {
    const c = await tx.ticketeraCompra.findUniqueOrThrow({ where: { id } });
    if (c.estado === "DEVUELTA") return;
    await bloquearTipo(tx, c.tipoId);
    const { count } = await tx.ticketeraCompra.updateMany({
      where: { id, estado: { in: ["PAGADA", "EN_REVISION"] } },
      data: {
        estado: "DEVUELTA", devueltaEn: new Date(), contracargo: cobro.contracargo, estadoCobro: cobro.estadoPasarela,
        observacion: cobro.contracargo ? "El comprador desconoció el pago (contracargo): las entradas quedaron anuladas." : "El pago se devolvió: las entradas quedaron anuladas.",
      },
    });
    if (!count) return;
    await tx.ticketeraEntrada.updateMany({ where: { compraId: id, anuladaEn: null }, data: { anuladaEn: new Date() } });
    if (c.estado === "PAGADA") await sumarOcupadas(tx, c.tipoId, -c.cantidad);
  },
  async alPagarse(tx, id) {
    const c = await tx.ticketeraCompra.findUniqueOrThrow({ where: { id }, include: { evento: true, tipo: true } });
    // La foto fiscal de la venta (3.2, fiscal d1): se guarda desde la primera, aunque no se facture.
    const fiscal = await fotoFiscal(tx, c.tenantId, {
      comprador: { nombre: c.nombre, email: c.email, documento: c.documento },
      renglones: [{ descripcion: `${c.evento.nombre} · ${c.tipo.nombre}`, cantidad: c.cantidad, precioUnitario: c.precioUnitario }],
      total: c.total,
    });
    await tx.ticketeraCompra.update({ where: { id }, data: { fiscal } });
    await tx.ticketeraEntrada.createMany({
      data: (c.asistentes as Asistente[]).map((a) => ({
        tenantId: c.tenantId, compraId: c.id, eventoId: c.eventoId, tipoId: c.tipoId, nombre: a.nombre, documento: a.documento, codigo: codigoFirmado(c.tenantId, nuevoCodigo()),
      })),
    });
  },
  evento: (compraId) => ({ nombre: "compra.pagada", payload: { compraId } }),
};

/**
 * Lo que dijo la API de la pasarela sobre un cobro de esta banda (la regla es la del núcleo).
 * RESERVADA (o VENCIDA con cupo todavía libre) → PAGADA una sola vez, con sus entradas
 * nominadas, y emite `compra.pagada` (mail con los QR). Monto o moneda distintos, o pago tardío
 * sin cupo → EN_REVISION (la banda lo devuelve desde su pasarela; Deoco no toca la plata).
 */
export async function registrarPago(tenantId: string, pasarelaId: string, cobro: CobroConsultado): Promise<ResultadoPago> {
  const r = await registrarCobro(ticketera, tenantId, pasarelaId, cobro, compraACobrar);
  return r === "pagado" ? "pagada" : r === "ya-pagado" ? "ya-pagada" : r;
}

/** Lo mínimo de una compra sin su token (al volver de la pasarela en otro navegador): el estado. */
export async function estadoDeCompra(tenantId: string, id: string) {
  if (!esUuid(id)) return null;
  return conTenant(tenantId, (tx) =>
    tx.ticketeraCompra.findUnique({
      where: { id },
      select: { estado: true, estadoCobro: true, evento: { select: { nombre: true, fecha: true, lugar: true, ciudad: true } } },
    }),
  );
}

/** La compra para la página del fan, solo con su token (de la cookie o del link del mail). */
export async function compraConToken(tenantId: string, id: string, token: string | null) {
  if (!esUuid(id) || !token) return null;
  const c = await conTenant(tenantId, (tx) =>
    tx.ticketeraCompra.findUnique({ where: { id }, include: { evento: true, tipo: true, entradas: { orderBy: { nombre: "asc" } } } }),
  );
  return c && tokenCoincide(token, c.tokenHash) ? c : null;
}

// ---------- Conciliación (los avisos se pierden) ----------

/** Cada cuánto se le vuelve a preguntar a la pasarela por una compra sin pago, según su edad. */
export function intervaloDeConciliacion(edadMs: number): number {
  if (edadMs < 3600_000) return 2 * 60_000;
  if (edadMs < 86_400_000) return 30 * 60_000;
  return 6 * 3600_000;
}

/**
 * El barrido: las compras mandadas a pagar que siguen sin pago (hasta 3 días): se le pregunta a
 * la pasarela de la banda si hay un cobro con esa referencia y, si lo hay, se registra como si
 * hubiera llegado el aviso (la misma regla: pagado una vez, tardío para devolver…).
 */
export async function conciliarCompras(ahora = new Date()) {
  const desde = new Date(ahora.getTime() - 3 * 86_400_000);
  const hasta = new Date(ahora.getTime() - 2 * 60_000);
  const bandas = await prisma.$queryRaw<{ id: string }[]>`SELECT b AS id FROM ticketera_bandas_a_conciliar(${desde}::timestamp, ${hasta}::timestamp) AS b`;
  for (const { id: tenantId } of bandas) {
    const compras = await conTenant(tenantId, (tx) =>
      tx.ticketeraCompra.findMany({
        where: { estado: { in: ["RESERVADA", "VENCIDA"] }, preferenciaId: { not: null }, creadoEn: { gte: desde, lte: hasta } },
        select: { id: true, creadoEn: true, conciliadaEn: true },
        orderBy: { creadoEn: "desc" },
        take: 200,
      }),
    );
    for (const c of compras) {
      const edad = ahora.getTime() - c.creadoEn.getTime();
      if (c.conciliadaEn && ahora.getTime() - c.conciliadaEn.getTime() < intervaloDeConciliacion(edad)) continue;
      try {
        await conciliarCobros(ticketera, tenantId, c.id, (pasarela, cobro) => registrarPago(tenantId, pasarela, cobro));
        await conTenant(tenantId, (tx) => tx.ticketeraCompra.update({ where: { id: c.id }, data: { conciliadaEn: ahora } }));
      } catch (e) {
        console.error(`[ticketera] conciliar ${c.id}:`, e instanceof Error ? e.message : e);
      }
    }
  }
}
