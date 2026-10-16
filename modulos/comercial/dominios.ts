// Dominios que la banda le compra a Deoco: precio, cobro, aviso de pago y devoluciones
// (docs/diseno-dominios.md §9 y §10, D9). Lo usa el núcleo por `gestionaCuenta.dominios`.
//
// ESTO NO ES LA CUOTA. Misma cuenta de Mercado Pago de Deoco, pero:
//   - otras filas (comercial_dominio_cobro / _pago; nunca comercial_cobro),
//   - otro aviso (/dominio/<pasarela>; nunca /cuota), con la referencia "dominio:<banda>:<cobro>",
//   - otros estados; el pago de un dominio nunca toca la cuenta ni el estado de la banda.
//
// Reglas:
//   - Nunca se registra antes de cobrar: la compra (`dominioPagado`) arranca solo con un pago
//     APROBADO, consultado a la API (el cuerpo del aviso no se cree), del monto exacto.
//   - Solo medios inmediatos (Checkout Pro con binary_mode y sin efectivo ni transferencia).
//   - Un cobro, un pago aceptado; por banda, lo mismo (la "clave") se paga una sola vez. Cualquier
//     otro pago aprobado se devuelve solo.
//   - La devolución se reintenta con espera creciente. Si no sale, queda "fallida": arriba de todo
//     el back office (`alertasDeDominios`) hasta que salga o el staff la resuelva a mano. Nunca en
//     silencio.
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { type LeerComoStaff, leerComoStaff } from "@/nucleo/acceso/staff";
import { prisma } from "@/nucleo/db/cliente";
import { conTenant, type TxTenant } from "@/nucleo/db/con-tenant";
import { formatearPesos } from "@/nucleo/dinero";
import { ErrorDominio } from "@/nucleo/dominios";
import { dominioPagado, renovacionPagada } from "@/nucleo/dominios/compra";
import type { AlertaAdmin, CobroDominioVisible, PedidoDeCobroDominio } from "@/nucleo/modulos/contrato";
import type { PagoConsultado } from "@/nucleo/pagos/cuota";
import { buscarPagosDominio, consultarPagoDominio, crearPagoDominio, devolverPagoDominio, urlAvisoDominio } from "@/nucleo/pagos/cuota";
import { mandar } from "./correos";
import type { ComoStaff } from "./cuenta";

const comercial = async () => (await import("./index")).default;

const MIN = 60_000;
const HORA = 60 * MIN;
/** Cuánto vale el link de pago. Después, la pasarela no acepta el pago (precio y disponibilidad viejos). */
const PLAZO_PARA_PAGAR = 2 * HORA;
/** Después de vencido, se siguen buscando sus pagos un día más (un pago hecho justo al vencer). */
const BUSCAR_DESPUES = 24 * HORA;
/** Cada cuánto se buscan los pagos de un cobro esperando (por si el aviso se perdió). */
const CADA_BUSQUEDA = 2 * MIN;
/** Espera entre intentos de devolución (la última se repite). */
const REINTENTOS_DEVOLUCION = [5 * MIN, 30 * MIN, 2 * HORA, 6 * HORA, 12 * HORA];
/** Intentos fallidos para que la devolución quede "fallida" (a la vista del staff). Se sigue reintentando. */
const FALLIDA_DESDE = 3;
/** Una devolución "en proceso" en la pasarela más que esto: también la mira el staff. */
const EN_PROCESO_DEMASIADO = 24 * HORA;
/** Cada cuánto se consulta una devolución en proceso. */
const ESPERA_EN_PROCESO = 30 * MIN;
/** Sin poder arrancar la compra en este tiempo, el pago se devuelve. */
const TOPE_ENTREGA = 24 * HORA;
/** Un pago tomado hace más que esto quedó colgado. */
const COLGADO = 5 * MIN;

const REFERENCIA = /^dominio:([0-9a-f-]{36}):([0-9a-f-]{36})$/i;
const referencia = (tenantId: string, cobroId: string) => `dominio:${tenantId}:${cobroId}`;

type Pago = Awaited<ReturnType<typeof prisma.comercialDominioPago.findFirstOrThrow>>;

// ── Precio ────────────────────────────────────────────────────────────────────────────────────

/** Precio de venta por `anios` (centavos). null: esa terminación no se vende. */
export async function precioDominio(tld: string, anios: number): Promise<number | null> {
  const p = await prisma.comercialDominioPrecio.findUnique({ where: { tld } });
  return p?.aLaVenta ? p.precio * anios : null;
}

export const preciosDominio = () => prisma.comercialDominioPrecio.findMany({ orderBy: { tld: "asc" } });

/** Las terminaciones a la venta: "com" primero, el resto por orden alfabético. */
export async function terminacionesDominio(): Promise<{ tld: string; precio: number }[]> {
  const t = await prisma.comercialDominioPrecio.findMany({ where: { aLaVenta: true }, select: { tld: true, precio: true }, orderBy: { tld: "asc" } });
  return t.sort((x, y) => Number(y.tld === "com") - Number(x.tld === "com"));
}

/** Los cobros de dominios de la banda, para que vea en qué está cada uno (pago, devolución). */
export async function cobrosDeBanda(tenantId: string, dias: number): Promise<CobroDominioVisible[]> {
  const cobros = await conTenant(tenantId, (tx) =>
    tx.comercialDominioCobro.findMany({
      where: { creadoEn: { gte: new Date(Date.now() - dias * 86_400_000) } },
      include: { pagos: { select: { pagoId: true, estado: true, devolucion: true } } },
      orderBy: { creadoEn: "desc" },
    }),
  );
  return cobros.map((c) => {
    const aceptado = c.pagos.find((p) => p.pagoId === c.pagoId);
    const devolucion = aceptado?.devolucion;
    const estado: CobroDominioVisible["estado"] =
      devolucion === "hecha" || devolucion === "a-mano" ? "devuelto" : devolucion ? "devolviendo" : c.estado === "devuelto" ? "devolviendo" : (c.estado as "esperando" | "pagado" | "sin-pagar");
    return {
      id: c.id,
      tipo: c.tipo as "alta" | "renovacion",
      dominio: c.dominio,
      monto: c.monto,
      estado,
      pagoId: c.pagoId,
      rechazado: !c.pagoId && c.pagos.some((p) => p.estado === "rechazado"),
      creadoEn: c.creadoEn,
    };
  });
}

/** Staff: fija el precio de una terminación ("com", "com.ar"). */
export async function guardarPrecioDominio(comoStaff: ComoStaff, d: { tld: string; precio: number; aLaVenta: boolean }) {
  const tld = d.tld.trim().toLowerCase().replace(/^\./, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)?$/.test(tld)) throw new ErrorDominio("Terminación inválida (p. ej. com o com.ar).");
  if (!Number.isSafeInteger(d.precio) || d.precio <= 0) throw new ErrorDominio("El precio tiene que ser mayor que cero.");
  await comoStaff("comercial.precio_dominio", async (tx, ctx) => {
    await tx.comercialDominioPrecio.upsert({ where: { tld }, create: { tld, precio: d.precio, aLaVenta: d.aLaVenta }, update: { precio: d.precio, aLaVenta: d.aLaVenta } });
    ctx.detalle({ tld, precio: d.precio, aLaVenta: d.aLaVenta });
  });
}

// ── Cobro ─────────────────────────────────────────────────────────────────────────────────────

/** Crea el cobro en la cuenta de Deoco y devuelve adónde mandar al titular. El precio lo pone el gestor. */
export async function cobrarDominio(tenantId: string, p: PedidoDeCobroDominio): Promise<{ redireccion: string; monto: number }> {
  const modulo = await comercial();
  const tld = p.dominio.split(".").slice(1).join(".");
  const monto = await precioDominio(tld, p.anios);
  if (monto === null) throw new ErrorDominio(`Los dominios .${tld} no se venden en Deoco.`);
  const ya = await conTenant(tenantId, (tx) => tx.comercialDominioCobro.findFirst({ where: { clave: p.clave, estado: "pagado" }, select: { id: true } }));
  if (ya) throw new ErrorDominio(p.tipo === "alta" ? `${p.dominio} ya está pago: lo estamos registrando.` : `La renovación de ${p.dominio} ya está paga.`);
  const id = randomUUID();
  const vence = new Date(Date.now() + PLAZO_PARA_PAGAR);
  await conTenant(tenantId, (tx) =>
    tx.comercialDominioCobro.create({
      data: { id, tenantId, tipo: p.tipo, dominio: p.dominio, anios: p.anios, monto, clave: p.clave, datos: p.datos as Prisma.InputJsonValue, usuarioId: p.usuarioId, vence },
    }),
  );
  const anios = p.anios === 1 ? "1 año" : `${p.anios} años`;
  try {
    const r = await crearPagoDominio(modulo, {
      referencia: referencia(tenantId, id),
      titulo: p.tipo === "alta" ? `Dominio ${p.dominio} · ${anios}` : `Renovación de ${p.dominio} · ${anios}`,
      monto,
      email: p.email,
      vence,
      urls: { exito: `${p.vuelta}?pago=hecho`, fallo: `${p.vuelta}?pago=no`, pendiente: `${p.vuelta}?pago=no`, aviso: urlAvisoDominio(modulo) },
    });
    await conTenant(tenantId, (tx) => tx.comercialDominioCobro.update({ where: { id }, data: { preferenciaId: r.preferenciaId } }));
    return { redireccion: r.redireccion, monto };
  } catch (e) {
    // Sin link de pago no hay cobro: no queda nada esperando.
    await conTenant(tenantId, (tx) => tx.comercialDominioCobro.delete({ where: { id } }));
    throw e;
  }
}

// ── Pagos (aviso o búsqueda) ──────────────────────────────────────────────────────────────────

/**
 * Un pago consultado a la API. Lo anota y decide: el primero aprobado del monto exacto arranca la
 * compra; cualquier otro aprobado se devuelve. Idempotente (el mismo pago otra vez no cambia nada).
 */
export async function procesarPago(p: PagoConsultado): Promise<void> {
  const ref = REFERENCIA.exec(p.referencia ?? "");
  if (!ref) return; // no es de un dominio (la cuota tiene su propio aviso)
  const [, tenantId, cobroId] = ref;
  const fila = await conTenant(tenantId, async (tx) => {
    // Un aviso a la vez por cobro, y por banda y clave (dos cobros de lo mismo).
    const [cobro] = await tx.$queryRaw<{ id: string; clave: string }[]>`
      SELECT id, clave FROM "comercial_dominio_cobro" WHERE id = ${cobroId}::uuid FOR UPDATE`;
    if (!cobro) return null;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:${cobro.clave}`}))`;
    const c = await tx.comercialDominioCobro.findUniqueOrThrow({ where: { id: cobroId } });
    const datos = { estado: p.estado, estadoPasarela: p.estadoPasarela, medio: p.medio, monto: p.monto, moneda: p.moneda };
    const previa = await tx.comercialDominioPago.findUnique({ where: { pagoId: p.pagoId } });
    let pago = previa
      ? await tx.comercialDominioPago.update({ where: { id: previa.id }, data: datos })
      : await tx.comercialDominioPago.create({ data: { tenantId, cobroId, pagoId: p.pagoId, ...datos } });

    // Devuelto en la pasarela (por nosotros o a mano desde Mercado Pago): queda anotado.
    if (p.estado === "devuelto" || (p.devuelto > 0 && p.devuelto >= p.monto)) {
      if (pago.devolucion !== "hecha" && pago.devolucion !== "a-mano") {
        pago = await tx.comercialDominioPago.update({ where: { id: pago.id }, data: { devolucion: "hecha", devueltoEn: new Date(), devolucionError: null } });
        if (c.pagoId === p.pagoId) await tx.comercialDominioCobro.update({ where: { id: c.id }, data: { estado: "devuelto" } });
      }
      return { pago, cobro: c };
    }
    if (p.estado !== "aprobado" || pago.entrega || pago.devolucion) return { pago, cobro: c };

    // Aprobado y sin decidir: ¿es el pago del cobro o uno de más?
    let motivo: string | null = null;
    if (p.moneda !== "ARS" || p.monto !== c.monto) motivo = `El monto no coincide (${formatearPesos(p.monto)} ${p.moneda}, se esperaba ${formatearPesos(c.monto)})`;
    else if (c.pagoId) motivo = "Pago repetido del mismo cobro";
    else if (await tx.comercialDominioCobro.findFirst({ where: { clave: c.clave, estado: "pagado", id: { not: c.id } }, select: { id: true } })) {
      motivo = c.tipo === "alta" ? `${c.dominio} ya estaba pago (otro cobro)` : `La renovación de ${c.dominio} ya estaba paga (otro cobro)`;
    }
    if (motivo) {
      pago = await tx.comercialDominioPago.update({ where: { id: pago.id }, data: pedidoDeDevolucion(motivo) });
      await auditar(tx, tenantId, "comercial.dominio_pago_a_devolver", { dominio: c.dominio, pagoId: p.pagoId, motivo });
    } else {
      await tx.comercialDominioCobro.update({ where: { id: c.id }, data: { estado: "pagado", pagoId: p.pagoId, pagadoEn: new Date() } });
      pago = await tx.comercialDominioPago.update({ where: { id: pago.id }, data: { entrega: "pendiente" } });
      await auditar(tx, tenantId, "comercial.dominio_pagado", { dominio: c.dominio, tipo: c.tipo, pagoId: p.pagoId, monto: c.monto });
    }
    return { pago, cobro: c };
  });
  if (!fila) {
    console.error(`[comercial] pago de dominio ${p.pagoId} con un cobro que no existe (${p.referencia})`);
    return;
  }
  if (fila.pago.entrega === "pendiente") await entregar(tenantId, fila.pago.id);
  if (fila.pago.devolucion === "pendiente") programar(tenantId);
}

const pedidoDeDevolucion = (motivo: string, ahora = new Date()) => ({
  devolucion: "pendiente",
  devolucionMotivo: motivo,
  devolucionProxima: ahora,
  devolucionDesde: ahora,
});

async function auditar(tx: TxTenant, tenantId: string, accion: string, detalle: Record<string, Prisma.InputJsonValue | null>) {
  await tx.auditoria.create({ data: { usuarioId: null, tenantId, accion, detalle: { ...detalle, por: "comercial" } } });
}

/** Con el pago aceptado, arranca la compra en el núcleo (idempotente: el mismo pago, la misma compra). */
async function entregar(tenantId: string, id: string, ahora = new Date()): Promise<void> {
  const pago = await conTenant(tenantId, (tx) => tx.comercialDominioPago.findUnique({ where: { id }, include: { cobro: true } }));
  if (!pago || pago.entrega !== "pendiente") return;
  const c = pago.cobro;
  const d = c.datos as { contacto?: unknown; aceptacion?: { fecha: string; ip: string; claves: string[] }; hacerPrincipal?: boolean };
  try {
    if (c.tipo === "alta") {
      await dominioPagado(await comercial(), tenantId, {
        dominio: c.dominio,
        anios: c.anios,
        contacto: d.contacto as Parameters<typeof dominioPagado>[2]["contacto"],
        aceptacion: { ...d.aceptacion!, fecha: new Date(d.aceptacion!.fecha) },
        hacerPrincipal: Boolean(d.hacerPrincipal),
        cobro: { id: pago.pagoId, monto: pago.monto },
        usuarioId: c.usuarioId,
      });
    } else {
      await renovacionPagada(await comercial(), tenantId, { dominio: c.dominio, anios: c.anios, cobro: { id: pago.pagoId, monto: pago.monto }, usuarioId: c.usuarioId });
    }
    await conTenant(tenantId, (tx) => tx.comercialDominioPago.update({ where: { id }, data: { entrega: "hecha", entregaError: null } }));
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    console.error(`[comercial] no se pudo arrancar la compra de ${c.dominio} (pago ${pago.pagoId}):`, e);
    // Sin poder arrancarla en un día, no se registró nada: se devuelve.
    const rendirse = ahora.getTime() - pago.creadoEn.getTime() > TOPE_ENTREGA;
    await conTenant(tenantId, async (tx) => {
      await tx.comercialDominioPago.update({
        where: { id },
        data: { entregaIntentos: { increment: 1 }, entregaError: error, ...(rendirse ? { entrega: null, ...pedidoDeDevolucion(`No se pudo arrancar la compra: ${error}`, ahora) } : {}) },
      });
      if (rendirse) await tx.comercialDominioCobro.update({ where: { id: c.id }, data: { estado: "devuelto" } });
    });
  }
}

// ── Devoluciones ──────────────────────────────────────────────────────────────────────────────

/** El núcleo pide devolver un pago (la compra falló sin registrar). Solo lo anota; corre aparte. */
export async function pedirDevolucion(tenantId: string, pagoId: string, motivo: string): Promise<void> {
  const n = await conTenant(tenantId, async (tx) => {
    const pago = await tx.comercialDominioPago.findUnique({ where: { pagoId } });
    if (!pago) return 0;
    if (pago.devolucion) return 1; // ya pedida (o hecha): idempotente
    await tx.comercialDominioPago.update({ where: { id: pago.id }, data: pedidoDeDevolucion(motivo) });
    await tx.comercialDominioCobro.update({ where: { id: pago.cobroId }, data: { estado: "devuelto" } });
    await auditar(tx, tenantId, "comercial.dominio_pago_a_devolver", { pagoId, motivo });
    return 1;
  });
  // Sin la fila del pago no hay qué devolver acá: que el núcleo lo deje pendiente (y a la vista).
  if (n === 0) throw new ErrorDominio(`El pago ${pagoId} no es un pago de dominio de esta banda.`);
  programar(tenantId);
}

const enMarcha = new Set<Promise<unknown>>();

/** Corre lo pendiente de la banda después de responder (o ya, fuera de un pedido). */
function programar(tenantId: string) {
  const correr = () => {
    const p = devolverPendientes(tenantId).catch((e) => console.error(`[comercial] devoluciones ${tenantId}:`, e));
    enMarcha.add(p);
    void p.finally(() => enMarcha.delete(p));
    return p;
  };
  try {
    after(correr);
  } catch {
    void correr();
  }
}

/** Para pruebas: espera lo que quedó corriendo. */
export async function esperarDominios() {
  while (enMarcha.size > 0) await Promise.all([...enMarcha]);
}

/** Corre las devoluciones que tocan en la banda. Cada una se toma en la base: nunca dos a la vez. */
export async function devolverPendientes(tenantId: string, ahora = new Date()): Promise<number> {
  const pagos = await conTenant(tenantId, (tx) =>
    tx.comercialDominioPago.findMany({ where: { devolucion: { in: ["pendiente", "en-proceso", "fallida"] }, devolucionProxima: { lte: ahora } }, orderBy: { creadoEn: "asc" } }),
  );
  let hechas = 0;
  for (const p of pagos) {
    const { count } = await conTenant(tenantId, (tx) =>
      tx.comercialDominioPago.updateMany({
        where: { id: p.id, devolucion: p.devolucion, OR: [{ tomadoEn: null }, { tomadoEn: { lt: new Date(ahora.getTime() - COLGADO) } }] },
        data: { tomadoEn: ahora },
      }),
    );
    if (count === 0) continue;
    try {
      if (await devolverUno(tenantId, p, ahora)) hechas++;
    } finally {
      await conTenant(tenantId, (tx) => tx.comercialDominioPago.update({ where: { id: p.id }, data: { tomadoEn: null } }));
    }
  }
  return hechas;
}

/** Un intento. true si quedó devuelta. Nunca tira: un error queda en la fila. */
async function devolverUno(tenantId: string, p: Pago, ahora: Date): Promise<boolean> {
  const modulo = await comercial();
  const guardar = (data: Prisma.ComercialDominioPagoUpdateInput) => conTenant(tenantId, (tx) => tx.comercialDominioPago.update({ where: { id: p.id }, data }));
  try {
    // Primero, lo que dice la pasarela: quizás ya se devolvió (un intento anterior que respondió tarde).
    const actual = await consultarPagoDominio(modulo, p.pagoId);
    if (actual.estado === "devuelto" || (actual.devuelto > 0 && actual.devuelto >= actual.monto)) {
      await terminada(tenantId, p, ahora);
      return true;
    }
    if (p.devolucion === "en-proceso") {
      const larga = p.devolucionDesde && ahora.getTime() - p.devolucionDesde.getTime() > EN_PROCESO_DEMASIADO;
      await guardar({ devolucionProxima: new Date(ahora.getTime() + ESPERA_EN_PROCESO), ...(larga ? { devolucionError: "La pasarela tiene la devolución en proceso hace más de un día." } : {}) });
      return false;
    }
    if (actual.estado !== "aprobado") throw new Error(`El pago está ${actual.estadoPasarela} en la pasarela: no se puede devolver.`);
    // La clave es la de la fila: reintentarla nunca devuelve dos veces.
    const r = await devolverPagoDominio(modulo, p.pagoId, `deoco-devolucion-${p.id}`);
    if (r.hecha) {
      await guardar({ devolucionId: r.devolucionId });
      await terminada(tenantId, { ...p, devolucionId: r.devolucionId }, ahora);
      return true;
    }
    await guardar({ devolucion: "en-proceso", devolucionId: r.devolucionId, devolucionError: null, devolucionProxima: new Date(ahora.getTime() + ESPERA_EN_PROCESO) });
    return false;
  } catch (e) {
    const intentos = p.devolucionIntentos + 1;
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    console.error(`[comercial] devolución del pago ${p.pagoId} (${tenantId}), intento ${intentos}:`, error);
    const espera = REINTENTOS_DEVOLUCION[Math.min(intentos - 1, REINTENTOS_DEVOLUCION.length - 1)];
    await guardar({
      // Desde el tercer intento queda a la vista del staff; se sigue reintentando igual.
      devolucion: p.devolucion === "en-proceso" ? "en-proceso" : intentos >= FALLIDA_DESDE ? "fallida" : "pendiente",
      devolucionIntentos: intentos,
      devolucionError: error,
      devolucionProxima: new Date(ahora.getTime() + espera),
    });
    return false;
  }
}

async function terminada(tenantId: string, p: Pago, ahora: Date) {
  const cobro = await conTenant(tenantId, async (tx) => {
    await tx.comercialDominioPago.update({ where: { id: p.id }, data: { devolucion: "hecha", devueltoEn: ahora, devolucionError: null, devolucionProxima: null } });
    await auditar(tx, tenantId, "comercial.dominio_pago_devuelto", { pagoId: p.pagoId, monto: p.monto, devolucionId: p.devolucionId });
    return tx.comercialDominioCobro.findUniqueOrThrow({ where: { id: p.cobroId } });
  });
  await mandar(
    tenantId,
    `dominio-devuelto:${p.pagoId}`,
    () => `Te devolvimos ${formatearPesos(p.monto)} por ${cobro.dominio}`,
    () => [
      `Devolvimos el pago completo de ${formatearPesos(p.monto)} por ${cobro.dominio}${p.devolucionMotivo ? ` (${p.devolucionMotivo.charAt(0).toLowerCase()}${p.devolucionMotivo.slice(1)})` : ""}.`,
      "Según tu medio de pago, puede tardar unos días en verse en tu cuenta o en el resumen de la tarjeta.",
    ],
    "Ir a Dominios",
    "/dominios",
  ).catch((e) => console.error(`[comercial] aviso de devolución ${p.pagoId}:`, e));
}

/** Staff: reintentar ya una devolución. */
export async function reintentarDevolucion(comoStaff: ComoStaff, tenantId: string, id: string) {
  await comoStaff("comercial.devolucion_reintentada", async (_tx, ctx) => {
    const { count } = await conTenant(tenantId, (tx) =>
      tx.comercialDominioPago.updateMany({ where: { id, devolucion: { in: ["pendiente", "en-proceso", "fallida"] } }, data: { devolucionProxima: new Date() } }),
    );
    if (count === 0) throw new ErrorDominio("Ese pago no tiene una devolución pendiente.");
    ctx.detalle({ tenantId, pago: id });
  });
  await devolverPendientes(tenantId);
}

/** Staff: la devolvió por otro lado (desde Mercado Pago, por transferencia). Con nota obligatoria. */
export async function marcarDevueltaAMano(comoStaff: ComoStaff, tenantId: string, id: string, nota: string) {
  if (nota.trim().length < 5) throw new ErrorDominio("Contá cómo se devolvió (p. ej. \"transferencia del 12/10\").");
  await comoStaff("comercial.devolucion_a_mano", async (_tx, ctx) => {
    const { count } = await conTenant(tenantId, (tx) =>
      tx.comercialDominioPago.updateMany({
        where: { id, devolucion: { in: ["pendiente", "en-proceso", "fallida"] } },
        data: { devolucion: "a-mano", devolucionNota: nota.trim().slice(0, 500), devueltoEn: new Date(), devolucionProxima: null },
      }),
    );
    if (count === 0) throw new ErrorDominio("Ese pago no tiene una devolución pendiente.");
    ctx.detalle({ tenantId, pago: id, nota: nota.trim().slice(0, 500) });
  });
}

// ── Barrido ───────────────────────────────────────────────────────────────────────────────────

/**
 * Tarea periódica: busca los pagos de los cobros esperando (por si un aviso se perdió), arranca
 * las compras pendientes y corre las devoluciones que tocan, en todas las bandas.
 */
export async function revisarDominios(ahora = new Date()): Promise<void> {
  const modulo = await comercial();
  const bandas = await prisma.$queryRaw<{ id: string }[]>`SELECT b AS id FROM comercial_dominios_a_revisar(${ahora}::timestamp) AS b`;
  for (const { id: tenantId } of bandas) {
    try {
      const { esperando, entregas } = await conTenant(tenantId, async (tx) => ({
        esperando: await tx.comercialDominioCobro.findMany({
          where: { estado: "esperando", preferenciaId: { not: null }, OR: [{ revisadoEn: null }, { revisadoEn: { lte: new Date(ahora.getTime() - CADA_BUSQUEDA) } }] },
        }),
        entregas: await tx.comercialDominioPago.findMany({ where: { entrega: "pendiente" }, select: { id: true } }),
      }));
      for (const c of esperando) {
        for (const p of await buscarPagosDominio(modulo, referencia(tenantId, c.id))) await procesarPago(p);
        const fin = ahora.getTime() > c.vence.getTime() + BUSCAR_DESPUES;
        await conTenant(tenantId, (tx) =>
          tx.comercialDominioCobro.updateMany({ where: { id: c.id, estado: "esperando" }, data: { revisadoEn: ahora, ...(fin ? { estado: "sin-pagar" } : {}) } }),
        );
      }
      for (const { id } of entregas) await entregar(tenantId, id, ahora);
      await devolverPendientes(tenantId, ahora);
    } catch (e) {
      console.error(`[comercial] dominios de ${tenantId}:`, e);
    }
  }
}

// ── Back office ───────────────────────────────────────────────────────────────────────────────

/** Lo que el staff tiene que mirar ya: arriba de todo el back office. */
export async function alertasDeDominios(leer: LeerComoStaff = leerComoStaff): Promise<AlertaAdmin[]> {
  const ahora = Date.now();
  const [r] = await leer(
    (tx) => tx.$queryRaw<{ fallidas: number; demoradas: number; trabadas: number }[]>`
      SELECT
        count(*) FILTER (WHERE "devolucion" = 'fallida')::int AS fallidas,
        count(*) FILTER (WHERE "devolucion" IN ('pendiente', 'en-proceso') AND "devolucionDesde" < ${new Date(ahora - HORA)})::int AS demoradas,
        count(*) FILTER (WHERE "entrega" = 'pendiente' AND "creadoEn" < ${new Date(ahora - 30 * MIN)})::int AS trabadas
      FROM "comercial_dominio_pago"`,
  );
  const href = "/admin/m/comercial/dominios";
  const a: AlertaAdmin[] = [];
  if (r.fallidas) a.push({ texto: `${r.fallidas === 1 ? "Una devolución de un dominio no sale" : `${r.fallidas} devoluciones de dominios no salen`}: hay que devolver la plata.`, href });
  if (r.demoradas) a.push({ texto: `${r.demoradas === 1 ? "Una devolución de un dominio lleva" : `${r.demoradas} devoluciones de dominios llevan`} más de una hora sin terminar.`, href });
  if (r.trabadas) a.push({ texto: `${r.trabadas === 1 ? "Un dominio pagado no arranca" : `${r.trabadas} dominios pagados no arrancan`} su compra.`, href });
  return a;
}
