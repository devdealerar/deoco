// La cuenta de cada banda en Deoco: su plan, su prueba, su suscripción y su estado.
//
// Un plan es una lista de módulos más una lista de límites (los edita el staff). Este módulo los
// traduce a lo que el núcleo entiende: módulos prendidos y números (@/nucleo/cuenta). El núcleo
// nunca sabe qué es "Premium".
//
// LA CUOTA ES LA EXCEPCIÓN A LA REGLA DEL DINERO: la banda le paga A DEOCO, en la cuenta de Deoco
// (@/nucleo/pagos/cuota, credenciales del entorno). Nada de acá toca las ventas de la banda.
import { Prisma } from "@/generated/prisma/client";
import type { ContextoStaff } from "@/nucleo/acceso/staff";
import { catalogoDeCuenta, fijarEstado, fijarLimites, fijarModulos } from "@/nucleo/cuenta";
import { LIMITE_ALMACENAMIENTO } from "@/nucleo/archivos";
import { conTenant, type TxTenant } from "@/nucleo/db/con-tenant";
import { prisma } from "@/nucleo/db/cliente";
import { formatearPesos } from "@/nucleo/dinero";
import type { Modulo } from "@/nucleo/modulos/contrato";
import {
  type CobroDeSuscripcion,
  type SuscripcionConsultada,
  cambiarMontoSuscripcion,
  cancelarSuscripcion,
  consultarSuscripcion,
  crearSuscripcion,
} from "@/nucleo/pagos/cuota";
import { titularDeBanda } from "@/nucleo/personas";
import { origenPlataforma } from "@/nucleo/tenant/hosts";
import { avisarMora, avisarSuspension } from "./correos";

export class ErrorComercial extends Error {}

/** El contrato de este módulo (se pide tarde: index.ts importa este archivo). */
const comercial = async (): Promise<Modulo> => (await import("./index")).default;

const DIA = 86_400_000;
const sumarDias = (d: Date, n: number) => new Date(d.getTime() + n * DIA);
/** Un mes calendario más (31/1 → 28/2 o 29/2, nunca 3/3). */
export function sumarMes(d: Date): Date {
  const r = new Date(d);
  const dia = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + 1);
  const ultimo = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(dia, ultimo));
  return r;
}

// ── Planes y plazos (globales, los edita el staff) ─────────────────────────────────────────────

export type Plan = {
  id: string;
  nombre: string;
  descripcion: string;
  precioUsd: string;
  /** Centavos de peso por mes; null: sin precio (no se puede elegir ni cobrar). */
  precio: number | null;
  modulos: string[];
  almacenamiento: bigint | null;
  topes: Record<string, number>;
  aLaVenta: boolean;
  orden: number;
};

/** Pro a medida de una banda (lo arma el staff). Pisa lo que define. */
export type ProAMedida = { precio: number | null; modulos: string[]; almacenamiento: string | null; topes: Record<string, number> };

const topesDe = (j: Prisma.JsonValue | null): Record<string, number> =>
  Object.fromEntries(Object.entries((j && typeof j === "object" && !Array.isArray(j) ? j : {}) as Record<string, unknown>).filter(([, v]) => Number.isInteger(v) && (v as number) >= 0)) as Record<string, number>;

const aPlan = (p: Awaited<ReturnType<typeof prisma.comercialPlan.findMany>>[number]): Plan => ({ ...p, topes: topesDe(p.topes) });

export async function planes(): Promise<Plan[]> {
  return (await prisma.comercialPlan.findMany({ orderBy: [{ orden: "asc" }, { id: "asc" }] })).map(aPlan);
}

export async function plazos() {
  return (await prisma.comercialConfig.findUnique({ where: { id: 1 } })) ?? { id: 1, diasPrueba: 14, planPrueba: "medium", diasGracia: 3, diasMoraASuspender: 10, actualizadoEn: new Date(0) };
}

export type Cuenta = NonNullable<Awaited<ReturnType<typeof cuentaDe>>>;

export const cuentaDe = (tenantId: string) => conTenant(tenantId, (tx) => tx.comercialCuenta.findUnique({ where: { tenantId } }));

/** El plan que rige para la cuenta: su plan, o el Pro a medida si el staff le armó uno. */
export function planEfectivo(cuenta: Pick<Cuenta, "planId" | "pro">, todos: Plan[]): Plan {
  const base = todos.find((p) => p.id === cuenta.planId);
  if (!base) throw new ErrorComercial(`El plan "${cuenta.planId}" no existe.`);
  const pro = cuenta.pro as ProAMedida | null;
  if (!pro) return base;
  return {
    ...base,
    nombre: `${base.nombre} a medida`,
    precio: pro.precio ?? null,
    modulos: pro.modulos ?? base.modulos,
    almacenamiento: pro.almacenamiento ? BigInt(pro.almacenamiento) : null,
    topes: topesDe(pro.topes as Prisma.JsonValue) ?? {},
    aLaVenta: false,
  };
}

/**
 * Lleva la banda a lo que dice su plan: los módulos (prende y apaga; lo apagado conserva sus
 * datos) y los límites (si un tope baja, el módulo despublica lo último publicado, sin borrar).
 */
export async function aplicarPlan(tenantId: string): Promise<{ prendidos: string[]; apagados: string[]; despublicados: Record<string, number> }> {
  const modulo = await comercial();
  const cuenta = await cuentaDe(tenantId);
  if (!cuenta) throw new ErrorComercial("La banda no tiene cuenta.");
  const plan = planEfectivo(cuenta, await planes());
  const reg = catalogoDeCuenta();
  // Un plan puede nombrar un módulo que no está en este build: no se prende (no rompe).
  const modulos = plan.modulos.filter((id) => reg.modulos.some((m) => m.id === id));
  // Primero los límites (con los módulos todavía prendidos, cada uno ajusta lo suyo).
  const topes = Object.fromEntries(reg.limites.map((l) => [l.id, plan.topes[l.id] ?? null]));
  const despublicados = await fijarLimites(modulo, tenantId, { almacenamiento: plan.almacenamiento, topes });
  const { prendidos, apagados } = await fijarModulos(modulo, tenantId, modulos);
  return { prendidos, apagados, despublicados };
}

/** Banda nueva: arranca la prueba (plan y días de la configuración), sin tarjeta. */
export async function alCrearBanda(tenantId: string, ahora = new Date()) {
  const cfg = await plazos();
  const creada = await conTenant(tenantId, async (tx) => {
    if (await tx.comercialCuenta.findUnique({ where: { tenantId } })) return false;
    await tx.comercialCuenta.create({ data: { tenantId, planId: cfg.planPrueba, pruebaHasta: sumarDias(ahora, cfg.diasPrueba) } });
    return true;
  });
  if (creada) await aplicarPlan(tenantId);
}

/** Para quien llegó a un límite: el plan a la venta más barato que le alcanza. */
export async function comoAmpliar(tenantId: string, limite: string, necesarios: number): Promise<string | null> {
  const cuenta = await cuentaDe(tenantId);
  const todos = await planes();
  const actual = cuenta ? planEfectivo(cuenta, todos) : null;
  const moduloDelLimite = limite.split(".")[0];
  const alcanza = (p: Plan) => {
    if (limite === LIMITE_ALMACENAMIENTO) return p.almacenamiento !== null && p.almacenamiento >= BigInt(necesarios);
    return p.modulos.includes(moduloDelLimite) && (p.topes[limite] === undefined || p.topes[limite] >= necesarios);
  };
  const candidato = todos.filter((p) => p.aLaVenta && p.precio !== null && p.id !== actual?.id && alcanza(p)).sort((a, b) => a.precio! - b.precio!)[0];
  if (candidato) {
    const cuanto = limite === LIMITE_ALMACENAMIENTO ? "más espacio" : candidato.topes[limite] === undefined ? "sin tope" : `hasta ${candidato.topes[limite]}`;
    return `El plan ${candidato.nombre} permite ${cuanto}: cambialo en Plan y pago.`;
  }
  const pro = todos.find((p) => !p.aLaVenta);
  return pro ? `Para más, escribinos por el plan ${pro.nombre}.` : null;
}

// ── Suscripción: elegir, cambiar y cancelar (el titular, en /pago) ──────────────────────────────

const urlVuelta = (slug: string) => `${origenPlataforma()}/b/${slug}/pago?suscripcion=volvio`;

/** El primer cobro: cuando termine lo ya pagado o la prueba (si es más adelante); si no, ya. */
function inicioDelCobro(cuenta: Cuenta, ahora: Date): Date | undefined {
  const hasta = [cuenta.pagoHasta, cuenta.pruebaHasta].filter((d): d is Date => !!d && d > ahora).sort((a, b) => b.getTime() - a.getTime())[0];
  return hasta;
}

export type ResultadoEleccion = { redireccion: string } | { mensaje: string };

/**
 * El titular elige un plan. Con la suscripción activa: el cambio se aplica YA y el monto nuevo
 * se cobra desde el próximo ciclo (sin prorrateo). Sin suscripción: va a la pasarela de Deoco a
 * cargar su forma de pago; el plan se aplica cuando la suscripción queda autorizada.
 */
export async function elegirPlan(tenantId: string, slug: string, planId: string, ahora = new Date()): Promise<ResultadoEleccion> {
  const modulo = await comercial();
  const plan = (await planes()).find((p) => p.id === planId);
  if (!plan || !plan.aLaVenta) throw new ErrorComercial("Ese plan no se puede elegir.");
  if (plan.precio === null) throw new ErrorComercial(`El plan ${plan.nombre} todavía no tiene precio. Probá más tarde.`);
  const cuenta = await cuentaDe(tenantId);
  if (!cuenta) throw new ErrorComercial("La banda no tiene cuenta.");
  if (cuenta.pro) throw new ErrorComercial("Tu cuenta tiene un plan a medida: el cambio lo hace el equipo de Deoco.");

  if (cuenta.suscripcionId && cuenta.suscripcionEstado === "activa") {
    if (cuenta.planId === planId && !cuenta.planElegido) return { mensaje: `Ya tenés el plan ${plan.nombre}.` };
    if (cuenta.montoSuscripcion !== plan.precio) await cambiarMontoSuscripcion(modulo, cuenta.suscripcionId, plan.precio);
    await conTenant(tenantId, (tx) => tx.comercialCuenta.update({ where: { tenantId }, data: { planId, planElegido: null, montoSuscripcion: plan.precio } }));
    await aplicarPlan(tenantId);
    return { mensaje: `Listo: ya tenés el plan ${plan.nombre}. Desde el próximo cobro se cobran ${formatearPesos(plan.precio)} por mes.` };
  }

  const banda = await conTenant(tenantId, async (tx) => ({
    titular: await titularDeBanda(tx),
    nombre: (await tx.tenant.findUnique({ where: { id: tenantId }, select: { nombre: true } }))?.nombre ?? slug,
  }));
  if (!banda.titular) throw new ErrorComercial("La banda no tiene titular.");
  // Una suscripción que quedó sin terminar (volvió de la pasarela sin cargar nada) se descarta.
  if (cuenta.suscripcionId && cuenta.suscripcionEstado === "pendiente") {
    await cancelarSuscripcion(modulo, cuenta.suscripcionId).catch((e) => console.error(`[comercial] no se pudo cancelar ${cuenta.suscripcionId}:`, e));
  }
  const { suscripcionId, redireccion } = await crearSuscripcion(modulo, {
    referencia: tenantId,
    motivo: `Deoco · plan ${plan.nombre} · ${banda.nombre}`,
    monto: plan.precio,
    email: banda.titular.email,
    inicio: inicioDelCobro(cuenta, ahora),
    vuelta: urlVuelta(slug),
  });
  await conTenant(tenantId, (tx) =>
    tx.comercialCuenta.update({
      where: { tenantId },
      data: { suscripcionId, suscripcionEstado: "pendiente", planElegido: planId, montoSuscripcion: plan.precio, medioDePago: null },
    }),
  );
  return { redireccion };
}

/**
 * Trae el estado de la suscripción desde la pasarela (al volver de cargar la tarjeta, o por un
 * aviso). Si quedó autorizada, aplica el plan elegido. Un aviso de una suscripción vieja se ignora.
 */
export async function sincronizar(tenantId: string, consultada?: SuscripcionConsultada): Promise<Cuenta | null> {
  const cuenta = await cuentaDe(tenantId);
  if (!cuenta?.suscripcionId) return cuenta;
  const s = consultada ?? (await consultarSuscripcion(await comercial(), cuenta.suscripcionId));
  if (s.suscripcionId !== cuenta.suscripcionId) return cuenta;
  const aplicar = s.estado === "activa" && cuenta.planElegido;
  const actualizada = await conTenant(tenantId, (tx) =>
    tx.comercialCuenta.update({
      where: { tenantId },
      data: {
        suscripcionEstado: s.estado,
        medioDePago: s.medioDePago,
        proximoCobro: s.proximoCobro,
        montoSuscripcion: s.monto || cuenta.montoSuscripcion,
        ...(aplicar ? { planId: cuenta.planElegido!, planElegido: null } : {}),
        ...(s.estado === "cancelada" ? { planElegido: null } : {}),
      },
    }),
  );
  if (aplicar) await aplicarPlan(tenantId);
  return actualizada;
}

/** El titular cancela: deja de cobrarse. La cuenta sigue hasta el vencimiento; después, mora. */
export async function cancelar(tenantId: string): Promise<string> {
  const cuenta = await cuentaDe(tenantId);
  if (!cuenta?.suscripcionId || cuenta.suscripcionEstado === "cancelada") throw new ErrorComercial("No tenés una suscripción para cancelar.");
  await cancelarSuscripcion(await comercial(), cuenta.suscripcionId);
  await conTenant(tenantId, (tx) => tx.comercialCuenta.update({ where: { tenantId }, data: { suscripcionEstado: "cancelada", planElegido: null } }));
  const hasta = cuenta.pagoHasta ?? cuenta.pruebaHasta;
  return hasta
    ? `Cancelada: no se cobra más. Tu cuenta sigue hasta el ${hasta.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}.`
    : "Cancelada: no se cobra más.";
}

// ── Cobros y vencimientos ───────────────────────────────────────────────────────────────────

/**
 * Un cobro mensual que informó la pasarela de Deoco. Idempotente (una fila por cobro). Aprobado:
 * paga un mes más, sale de la prueba y de la mora, y la banda vuelve a ACTIVO al instante.
 * Rechazado: MOROSO (y mail al titular), salvo que ya estuviera en mora.
 */
export async function registrarCobro(tenantId: string, cobro: CobroDeSuscripcion, ahora = new Date()): Promise<"aprobado" | "rechazado" | "sin-cambios"> {
  const modulo = await comercial();
  const resultado = await conTenant(tenantId, async (tx) => {
    const [cuenta] = await tx.$queryRaw<{ suscripcionId: string | null }[]>`
      SELECT "suscripcionId" FROM "comercial_cuenta" WHERE "tenantId" = ${tenantId}::uuid FOR UPDATE`;
    if (!cuenta) return "sin-cambios" as const;
    // Un cobro de otra suscripción (una vieja o de otra banda) no se toma.
    if (cobro.suscripcionId && cobro.suscripcionId !== cuenta.suscripcionId) return "sin-cambios" as const;
    const previo = await tx.comercialCobro.findUnique({ where: { cobroId: cobro.cobroId } });
    if (previo && previo.tenantId !== tenantId) return "sin-cambios" as const;
    if (previo?.estado === cobro.estado) return "sin-cambios" as const;
    const datos = { estado: cobro.estado, estadoPasarela: cobro.estadoPasarela, monto: cobro.monto, fecha: cobro.fecha ?? ahora, suscripcionId: cobro.suscripcionId };
    if (previo) await tx.comercialCobro.update({ where: { cobroId: cobro.cobroId }, data: datos });
    else await tx.comercialCobro.create({ data: { tenantId, cobroId: cobro.cobroId, ...datos } });
    if (previo?.estado === "aprobado") return "sin-cambios" as const; // un aprobado no se des-aprueba acá
    if (cobro.estado === "aprobado") {
      const c = (await tx.comercialCuenta.findUnique({ where: { tenantId } }))!;
      const desde = c.pagoHasta && c.pagoHasta > ahora ? c.pagoHasta : ahora;
      await tx.comercialCuenta.update({ where: { tenantId }, data: { pagoHasta: sumarMes(desde), pruebaHasta: null, moraDesde: null } });
      return "aprobado" as const;
    }
    if (cobro.estado === "rechazado") {
      const c = (await tx.comercialCuenta.findUnique({ where: { tenantId } }))!;
      if (!c.moraDesde) await tx.comercialCuenta.update({ where: { tenantId }, data: { moraDesde: ahora } });
      return "rechazado" as const;
    }
    return "sin-cambios" as const;
  });
  if (resultado === "aprobado") await fijarEstado(modulo, tenantId, "ACTIVO", "pago de la cuota aprobado");
  if (resultado === "rechazado" && (await fijarEstado(modulo, tenantId, "MOROSO", "pago de la cuota rechazado"))) {
    await avisarMora(tenantId, "rechazado").catch((e) => console.error(`[comercial] mail de mora a ${tenantId}:`, e));
  }
  return resultado;
}

/** Qué le toca a una cuenta hoy (sin efectos: se prueba sola). */
export function decidir(
  c: Pick<Cuenta, "pruebaHasta" | "pagoHasta" | "moraDesde" | "suscripcionEstado">,
  cfg: { diasGracia: number; diasMoraASuspender: number },
  ahora: Date,
): { accion: "nada" } | { accion: "mora"; desde: Date } | { accion: "suspender"; motivo: string } {
  if (c.pruebaHasta && !c.pagoHasta && c.pruebaHasta <= ahora && c.suscripcionEstado !== "activa") {
    return { accion: "suspender", motivo: "terminó la prueba sin forma de pago" };
  }
  if (c.moraDesde) {
    return ahora.getTime() >= c.moraDesde.getTime() + cfg.diasMoraASuspender * DIA
      ? { accion: "suspender", motivo: `${cfg.diasMoraASuspender} días de mora` }
      : { accion: "nada" };
  }
  const vence = c.pagoHasta ?? c.pruebaHasta;
  if (vence && ahora.getTime() > vence.getTime() + cfg.diasGracia * DIA) return { accion: "mora", desde: vence };
  return { accion: "nada" };
}

/** Una cuenta: pasa a mora o a suspendida si le toca (y avisa al titular). */
export async function revisarCuenta(tenantId: string, ahora: Date, cfg: { diasGracia: number; diasMoraASuspender: number }): Promise<"nada" | "mora" | "suspender"> {
  const modulo = await comercial();
  const cuenta = await cuentaDe(tenantId);
  if (!cuenta) return "nada";
  const d = decidir(cuenta, cfg, ahora);
  if (d.accion === "mora") {
    await conTenant(tenantId, (tx: TxTenant) => tx.comercialCuenta.update({ where: { tenantId }, data: { moraDesde: d.desde } }));
    if (await fijarEstado(modulo, tenantId, "MOROSO", "venció la cuota sin pago")) {
      await avisarMora(tenantId, "vencida").catch((e) => console.error(`[comercial] mail de mora a ${tenantId}:`, e));
    }
    // Ya vencida hace rato (p. ej. el barrido estuvo parado): puede tocar suspender en la misma vuelta.
    return decidir({ ...cuenta, moraDesde: d.desde }, cfg, ahora).accion === "suspender" ? revisarCuenta(tenantId, ahora, cfg) : "mora";
  }
  if (d.accion === "suspender") {
    if (await fijarEstado(modulo, tenantId, "SUSPENDIDO", d.motivo)) {
      await avisarSuspension(tenantId, d.motivo).catch((e) => console.error(`[comercial] mail de suspensión a ${tenantId}:`, e));
    }
    return "suspender";
  }
  return "nada";
}

/** Tarea periódica: las cuentas vencidas, en mora o con la prueba terminada, de todas las bandas. */
export async function revisarVencimientos(ahora = new Date()) {
  const cfg = await plazos();
  const ids = await prisma.$queryRaw<{ id: string }[]>`SELECT c AS id FROM comercial_cuentas_a_revisar(${ahora}::timestamp) AS c`;
  for (const { id } of ids) {
    await revisarCuenta(id, ahora, cfg).catch((e) => console.error(`[comercial] revisar ${id}:`, e));
  }
  return ids.length;
}

// ── Lo que hace el staff (back office) ───────────────────────────────────────────────────────

/** conStaff (o, en pruebas, conStaffComo con un usuario): verifica staff y audita. */
export type ComoStaff = <T>(accion: string, fn: (tx: TxTenant, ctx: ContextoStaff) => Promise<T>) => Promise<T>;

export type DatosPlan = Pick<Plan, "nombre" | "descripcion" | "precioUsd" | "precio" | "modulos" | "almacenamiento" | "topes" | "aLaVenta">;

function validarPlan(d: DatosPlan): DatosPlan {
  if (!d.nombre.trim()) throw new ErrorComercial("El plan necesita un nombre.");
  if (d.precio !== null && (!Number.isSafeInteger(d.precio) || d.precio <= 0)) throw new ErrorComercial("El precio tiene que ser mayor que cero.");
  if (d.almacenamiento !== null && d.almacenamiento <= BigInt(0)) throw new ErrorComercial("El espacio tiene que ser mayor que cero.");
  const reg = catalogoDeCuenta();
  const desconocido = d.modulos.find((id) => !reg.modulos.some((m) => m.id === id));
  if (desconocido) throw new ErrorComercial(`No existe el módulo "${desconocido}".`);
  const ids = new Set(reg.limites.map((l) => l.id));
  for (const [k, v] of Object.entries(d.topes)) {
    if (!ids.has(k)) throw new ErrorComercial(`No existe el límite "${k}".`);
    if (!Number.isSafeInteger(v) || v < 0) throw new ErrorComercial("Los topes son números enteros, 0 o más.");
  }
  return d;
}

/**
 * El staff edita un plan. Las bandas con ese plan (sin Pro a medida) pasan a tenerlo al
 * instante: si un tope bajó, se despublica lo último publicado (nunca se borra). El precio
 * nuevo NO cambia suscripciones ya autorizadas (rige para las que se elijan desde ahora).
 */
export async function guardarPlan(comoStaff: ComoStaff, planId: string, datos: DatosPlan) {
  const d = validarPlan(datos);
  const bandas = await comoStaff("comercial.plan_editado", async (tx, ctx) => {
    const previo = await tx.comercialPlan.findUnique({ where: { id: planId } });
    if (!previo) throw new ErrorComercial("Ese plan no existe.");
    await tx.comercialPlan.update({
      where: { id: planId },
      data: { ...d, topes: d.topes as Prisma.InputJsonValue },
    });
    const ids = (await tx.comercialCuenta.findMany({ where: { planId, pro: { equals: Prisma.DbNull } }, select: { tenantId: true } })).map((c) => c.tenantId);
    ctx.detalle({ plan: planId, precio: d.precio, modulos: d.modulos, topes: d.topes, almacenamiento: d.almacenamiento?.toString() ?? null, bandas: ids.length });
    return ids;
  });
  for (const id of bandas) await aplicarPlan(id).catch((e) => console.error(`[comercial] aplicar plan a ${id}:`, e));
  return bandas.length;
}

export type DatosPlazos = { diasPrueba: number; planPrueba: string; diasGracia: number; diasMoraASuspender: number };

export async function guardarPlazos(comoStaff: ComoStaff, d: DatosPlazos) {
  for (const [k, v, max] of [["diasPrueba", d.diasPrueba, 90], ["diasGracia", d.diasGracia, 30], ["diasMoraASuspender", d.diasMoraASuspender, 90]] as const) {
    if (!Number.isSafeInteger(v) || v < 0 || v > max) throw new ErrorComercial(`${k}: entre 0 y ${max} días.`);
  }
  await comoStaff("comercial.plazos_editados", async (tx, ctx) => {
    if (!(await tx.comercialPlan.findUnique({ where: { id: d.planPrueba } }))) throw new ErrorComercial("El plan de la prueba no existe.");
    await tx.comercialConfig.upsert({ where: { id: 1 }, update: d, create: { id: 1, ...d } });
    ctx.detalle(d);
  });
}

/**
 * El staff le pone un plan a una banda (cualquiera, también el Pro) y, si quiere, un Pro a
 * medida (null lo quita). Se aplica al instante. Con la suscripción activa y un precio, el
 * monto nuevo se cobra desde el próximo ciclo.
 */
export async function asignarPlan(comoStaff: ComoStaff, tenantId: string, planId: string, pro: ProAMedida | null) {
  const modulo = await comercial();
  const todos = await planes();
  if (!todos.some((p) => p.id === planId)) throw new ErrorComercial("Ese plan no existe.");
  if (pro) {
    validarPlan({ nombre: "pro", descripcion: "", precioUsd: "", precio: pro.precio, modulos: pro.modulos, almacenamiento: pro.almacenamiento ? BigInt(pro.almacenamiento) : null, topes: pro.topes, aLaVenta: false });
  }
  const cuenta = await comoStaff("comercial.plan_asignado", async (_tx, ctx) => {
    const c = await conTenant(tenantId, async (tx) => {
      const previa = await tx.comercialCuenta.findUnique({ where: { tenantId } });
      const data = { planId, planElegido: null, pro: pro ? (pro as unknown as Prisma.InputJsonValue) : Prisma.DbNull };
      return previa
        ? tx.comercialCuenta.update({ where: { tenantId }, data })
        : tx.comercialCuenta.create({ data: { tenantId, ...data } });
    });
    ctx.detalle({ tenantId, plan: planId, pro: pro ? { ...pro } : null });
    return c;
  });
  await aplicarPlan(tenantId);
  const precio = planEfectivo(cuenta, todos).precio;
  if (cuenta.suscripcionId && cuenta.suscripcionEstado === "activa" && precio !== null && precio !== cuenta.montoSuscripcion) {
    await cambiarMontoSuscripcion(modulo, cuenta.suscripcionId, precio);
    await conTenant(tenantId, (tx) => tx.comercialCuenta.update({ where: { tenantId }, data: { montoSuscripcion: precio } }));
  }
}
