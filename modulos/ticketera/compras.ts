// Compra de entradas. El cupo lo garantiza la base: `ticketera_tipo.ocupadas` (vendidas +
// reservadas vigentes) tiene un CHECK ocupadas <= cupo, y cada compra suma a esa fila con la
// fila bloqueada. Dos compras a la vez no pasan el cupo: la segunda espera el bloqueo y ve el
// número nuevo. Una reserva sin pagar vence a los RESERVA_MINUTOS y libera su lugar.
//
// El pago es el del núcleo (@/nucleo/pagos), con la pasarela de la banda: la plata va a la
// banda. La fuente de verdad es la CONSULTA a la API, nunca el aviso.
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { conTenant, type TxTenant } from "@/nucleo/db/con-tenant";
import { type CobroConsultado, crearCobro, ErrorPasarela, pasarelaLista } from "@/nucleo/pagos";
import { type CosaACobrar, registrarCobro, type ResultadoCobro } from "@/nucleo/pagos/registro";
import { mensajeParaElPublico } from "@/nucleo/publico/errores";
import { ErrorTicketera, esUuid } from "./eventos";
import ticketera from "./index";
import { esEmail } from "@/nucleo/correo/direccion";

export const RESERVA_MINUTOS = 20;
export const MAXIMO_POR_COMPRA = 10;
const DOCUMENTO = /^[0-9A-Za-z.\- ]{5,20}$/;

export type Asistente = { nombre: string; documento: string };
export type DatosCompra = { tipoId: string; cantidad: number; nombre: string; email: string; asistentes: Asistente[] };

function validar(d: DatosCompra): DatosCompra {
  const nombre = d.nombre.trim().replace(/\s+/g, " ");
  const email = d.email.trim().toLowerCase();
  const problemas: string[] = [];
  if (!esUuid(d.tipoId)) problemas.push("Elegí el tipo de entrada.");
  if (!Number.isInteger(d.cantidad) || d.cantidad < 1 || d.cantidad > MAXIMO_POR_COMPRA) problemas.push(`Podés comprar de 1 a ${MAXIMO_POR_COMPRA} entradas.`);
  if (nombre.length < 2 || nombre.length > 100) problemas.push("Completá tu nombre.");
  if (!esEmail(email)) problemas.push("Revisá tu email: ahí te llegan las entradas.");
  const asistentes = d.asistentes.map((a) => ({ nombre: a.nombre.trim().replace(/\s+/g, " "), documento: a.documento.trim().replace(/\s+/g, " ") }));
  if (asistentes.length !== d.cantidad) problemas.push("Cada entrada va a nombre de alguien: completá todas.");
  asistentes.forEach((a, i) => {
    if (a.nombre.length < 2 || a.nombre.length > 100) problemas.push(`Entrada ${i + 1}: falta el nombre.`);
    if (!DOCUMENTO.test(a.documento)) problemas.push(`Entrada ${i + 1}: el documento no parece válido.`);
  });
  if (problemas.length) throw new ErrorTicketera(problemas.join(" "));
  return { ...d, nombre, email, asistentes };
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
export async function comprar(tenantId: string, datos: DatosCompra, origen: string, ahora = new Date()) {
  const d = validar(datos);
  const { lista } = await pasarelaLista(ticketera, tenantId);
  if (!lista) throw new ErrorTicketera("La venta de entradas no está disponible en este momento.");
  const compra = await conTenant(tenantId, async (tx) => {
    const bloqueado = await bloquearTipo(tx, d.tipoId);
    if (!bloqueado) throw new ErrorTicketera("Ese tipo de entrada no existe.");
    const tipo = await tx.ticketeraTipo.findUniqueOrThrow({ where: { id: d.tipoId }, include: { evento: true } });
    if (!tipo.evento.publicado || tipo.evento.fecha < new Date(ahora.getTime() - 6 * 3600_000)) throw new ErrorTicketera("Ese show no está a la venta.");
    if (tipo.ventaDesde && ahora < tipo.ventaDesde) throw new ErrorTicketera(`La venta de "${tipo.nombre}" todavía no empezó.`);
    if (tipo.ventaHasta && ahora > tipo.ventaHasta) throw new ErrorTicketera(`La venta de "${tipo.nombre}" ya terminó.`);
    await liberarVencidas(tx, tipo.id, ahora);
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
        venceEn: new Date(ahora.getTime() + RESERVA_MINUTOS * 60_000),
        token: randomBytes(16).toString("hex"),
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
    });
    await conTenant(tenantId, (tx) =>
      tx.ticketeraCompra.update({ where: { id: compra.id }, data: { pasarela: cobro.pasarela, preferenciaId: cobro.preferenciaId, urlPago: cobro.redireccion } }),
    );
    return { compraId: compra.id, token: compra.token, redireccion: cobro.redireccion };
  } catch (e) {
    // Sin cobro, la reserva no sirve: libera el lugar ya.
    await conTenant(tenantId, async (tx) => {
      await bloquearTipo(tx, compra.tipoId);
      const { count } = await tx.ticketeraCompra.updateMany({ where: { id: compra.id, estado: "RESERVADA" }, data: { estado: "VENCIDA", observacion: "No se pudo crear el cobro." } });
      if (count) await sumarOcupadas(tx, compra.tipoId, -compra.cantidad);
    });
    if (e instanceof ErrorPasarela) throw new ErrorTicketera("No pudimos conectar con la pasarela de pago. Probá de nuevo en un rato.");
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
): Promise<{ ok: true; compraId: string; token: string; redireccion: string } | { ok: false; error: string }> {
  try {
    return { ok: true, ...(await comprar(tenantId, datos, origen, ahora)) };
  } catch (e) {
    if (e instanceof ErrorTicketera) return { ok: false, error: e.message };
    return { ok: false, error: mensajeParaElPublico(e, "ticketera: compra") };
  }
}

// ---------- Pago ----------

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** Código de la entrada (va en el QR y se tipea en la puerta): 10 caracteres sin 0/O/1/I. */
export const nuevoCodigo = () => Array.from({ length: 10 }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");

export type ResultadoPago = "pagada" | "ya-pagada" | Exclude<ResultadoCobro, "pagado" | "ya-pagado">;

/** Una compra de entradas, como la cobra el registro del núcleo (registrarCobro). */
const compraACobrar: CosaACobrar = {
  nombre: "la compra",
  async buscar(tx, id) {
    const previa = await tx.ticketeraCompra.findUnique({ where: { id }, select: { tipoId: true } });
    if (!previa) return null;
    await bloquearTipo(tx, previa.tipoId); // el cupo no se mueve mientras se registra
    const c = await tx.ticketeraCompra.findUniqueOrThrow({ where: { id } }); // releída con el tipo bloqueado
    const estado = c.estado === "PAGADA" ? "pagada" : c.estado === "EN_REVISION" ? "en-revision" : "abierta";
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
    if (t.cupo - t.ocupadas < c.cantidad) return `Pagó (cobro ${cobroId}) cuando la reserva ya había vencido y no queda cupo. Devolvé el pago desde tu pasarela.`;
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
  async alPagarse(tx, id) {
    const c = await tx.ticketeraCompra.findUniqueOrThrow({ where: { id } });
    await tx.ticketeraEntrada.createMany({
      data: (c.asistentes as Asistente[]).map((a) => ({
        tenantId: c.tenantId, compraId: c.id, eventoId: c.eventoId, tipoId: c.tipoId, nombre: a.nombre, documento: a.documento, codigo: nuevoCodigo(),
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
  if (!c) return null;
  const a = Buffer.from(c.token);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b) ? c : null;
}
