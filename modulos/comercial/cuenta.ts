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
import { bandasConExcedente, catalogoDeCuenta, fijarEstado, fijarLimites, fijarModulos, type ModuloRetenido } from "@/nucleo/cuenta";
import { formatearBytes, LIMITE_ALMACENAMIENTO } from "@/nucleo/archivos";
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
  cuotaConfigurada,
  pasarelaDeLaCuota,
} from "@/nucleo/pagos/cuota";
import { titularDeBanda } from "@/nucleo/personas";
import { origenPlataforma } from "@/nucleo/tenant/hosts";
import { avisarArchivo, avisarMora, avisarSoloLectura, avisarSuspension } from "./correos";

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
  return (
    (await prisma.comercialConfig.findUnique({ where: { id: 1 } })) ?? {
      id: 1, diasPrueba: 14, planPrueba: "medium", diasGracia: 3, diasAvisoFuerte: 15, diasSoloLectura: 30, diasMoraASuspender: 60, diasArchivo: 90, actualizadoEn: new Date(0),
    }
  );
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
export type PlanAplicado = {
  prendidos: string[];
  apagados: string[];
  despublicados: Record<string, number>;
  /** Módulos que el plan ya no incluye pero siguen prendidos porque tienen algo abierto. */
  retenidos: ModuloRetenido[];
  /** Mientras haya retenidos, el plan que se cobra (el más barato que los incluye). */
  excedente: Plan | null;
};

/**
 * Lleva la banda a lo que dice su plan: los límites (si un tope baja, el módulo despublica lo
 * último publicado, sin borrar), los módulos (prende y apaga; lo apagado conserva sus datos) y
 * el monto de la suscripción.
 *
 * Nunca corta una operación en curso (3.2, núcleo d5): un módulo con algo abierto queda
 * prendido como EXCEDENTE y, mientras tanto, se cobra el plan más barato que lo incluye (o el
 * que tenía). El barrido vuelve a aplicar el plan; cuando se cierra lo abierto, se apaga y
 * vuelve el precio del plan elegido. Con la suscripción activa, el monto nuevo rige desde el
 * próximo cobro (lo ya pagado del período no cambia).
 */
export async function aplicarPlan(tenantId: string, ahora = new Date()): Promise<PlanAplicado> {
  const modulo = await comercial();
  const cuenta = await cuentaDe(tenantId);
  if (!cuenta) throw new ErrorComercial("Tu banda todavía no tiene un plan asignado. Escribinos y lo resolvemos.");
  const todos = await planes();
  const plan = planEfectivo(cuenta, todos);
  const reg = catalogoDeCuenta();
  // Un plan puede nombrar un módulo que no está en este build: no se prende (no rompe).
  const modulos = plan.modulos.filter((id) => reg.modulos.some((m) => m.id === id));
  // Primero los límites (con los módulos todavía prendidos, cada uno ajusta lo suyo).
  const topes = Object.fromEntries(reg.limites.map((l) => [l.id, plan.topes[l.id] ?? null]));
  const despublicados = await fijarLimites(modulo, tenantId, { almacenamiento: plan.almacenamiento, topes });
  const { prendidos, apagados, retenidos } = await fijarModulos(modulo, tenantId, modulos, undefined, ahora);
  const excedente = retenidos.length ? planQueCubre(cuenta, plan, [...modulos, ...retenidos.map((r) => r.moduloId)], todos) : null;
  await conTenant(tenantId, (tx) =>
    tx.comercialCuenta.update({
      where: { tenantId },
      data: excedente
        ? { excedentePlanId: excedente.id, ...(cuenta.excedenteDesde ? {} : { excedenteDesde: ahora }) }
        : { excedentePlanId: null, excedenteDesde: null },
    }),
  );
  await ajustarMonto(tenantId, (excedente ?? plan).precio);
  return { prendidos, apagados, despublicados, retenidos, excedente };
}

/**
 * El plan que se cobra mientras haya excedente: el más barato (con precio) que incluye todo lo
 * que queda prendido. Si ninguno lo incluye, el que la banda tenía antes (el precio que ya
 * venía pagando), y si tampoco, el elegido. Un Pro a medida no tiene excedente: lo maneja el staff.
 */
function planQueCubre(cuenta: Cuenta, elegido: Plan, prendidos: string[], todos: Plan[]): Plan | null {
  if (cuenta.pro) return null;
  const cubren = todos
    .filter((p) => p.precio !== null && prendidos.every((m) => p.modulos.includes(m)))
    .sort((a, b) => a.precio! - b.precio!);
  const cubre = cubren[0];
  if (cubre && (elegido.precio === null || cubre.precio! >= elegido.precio)) return cubre;
  const anterior = cuenta.excedentePlanId ? todos.find((p) => p.id === cuenta.excedentePlanId) : undefined;
  return anterior ?? elegido;
}

/** Con la suscripción activa, deja el monto en `precio` (rige desde el próximo cobro). */
async function ajustarMonto(tenantId: string, precio: number | null) {
  const cuenta = await cuentaDe(tenantId);
  if (!cuenta?.suscripcionId || cuenta.suscripcionEstado !== "activa" || precio === null || precio === cuenta.montoSuscripcion) return;
  await cambiarMontoSuscripcion(await comercial(), cuenta.suscripcionId, precio);
  await conTenant(tenantId, (tx) => tx.comercialCuenta.update({ where: { tenantId }, data: { montoSuscripcion: precio } }));
}

/** El barrido: las bandas con excedente vuelven a aplicar su plan (se apaga lo que ya cerró). */
export async function revisarExcedentes(ahora = new Date()) {
  for (const id of await bandasConExcedente()) {
    await aplicarPlan(id, ahora).catch((e) => console.error(`[comercial] excedente de ${id}:`, e));
  }
}

export const OPCION_PRUEBA = "prueba";

/**
 * Banda nueva: arranca la prueba (plan y días de la configuración), sin tarjeta. Si al darse de
 * alta sola eligió un plan, además va a la pasarela de Deoco a cargar la forma de pago (el plan
 * se aplica cuando se autoriza; mientras, la prueba). Si eso falla, queda en prueba.
 */
export async function alCrearBanda(tenantId: string, opcion?: string, ahora = new Date()): Promise<{ redireccion?: string }> {
  const cfg = await plazos();
  const creada = await conTenant(tenantId, async (tx) => {
    if (await tx.comercialCuenta.findUnique({ where: { tenantId } })) return false;
    await tx.comercialCuenta.create({ data: { tenantId, planId: cfg.planPrueba, pruebaHasta: sumarDias(ahora, cfg.diasPrueba) } });
    return true;
  });
  if (creada) await aplicarPlan(tenantId);
  if (!creada || !opcion || opcion === OPCION_PRUEBA) return {};
  const slug = (await conTenant(tenantId, (tx) => tx.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } })))?.slug;
  if (!slug) return {};
  try {
    const r = await elegirPlan(tenantId, slug, opcion, ahora);
    return "redireccion" in r ? { redireccion: r.redireccion } : {};
  } catch (e) {
    console.error(`[comercial] alta de ${slug} con el plan ${opcion}:`, e);
    return {};
  }
}

/** Al crear la banda sola: probar gratis (sin tarjeta) o un plan a la venta con precio. */
export async function opcionesDeAlta() {
  const [cfg, todos] = await Promise.all([plazos(), planes()]);
  const prueba = todos.find((p) => p.id === cfg.planPrueba);
  const opciones = [{ valor: OPCION_PRUEBA, texto: `Probar ${cfg.diasPrueba} días gratis${prueba ? ` (plan ${prueba.nombre})` : ""}`, detalle: "sin tarjeta. Al terminar, elegís un plan para seguir." }];
  if (!cuotaConfigurada()) return opciones;
  return [
    ...opciones,
    ...todos
      .filter((p) => p.aLaVenta && p.precio !== null)
      .map((p) => ({ valor: p.id, texto: `Plan ${p.nombre} · ${formatearPesos(p.precio!)}/mes`, detalle: `${p.descripcion ? `${p.descripcion.charAt(0).toLowerCase()}${p.descripcion.slice(1)}. ` : ""}Ahora cargás la forma de pago en ${pasarelaDeLaCuota().nombre}; igual empezás con ${cfg.diasPrueba} días gratis y el primer cobro es al terminar la prueba.` })),
  ];
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
  const espacio = limite === LIMITE_ALMACENAMIENTO;
  if (candidato) {
    const cuanto = espacio
      ? formatearBytes(candidato.almacenamiento!)
      : candidato.topes[limite] === undefined
        ? "sin tope"
        : `hasta ${candidato.topes[limite]}`;
    return `Para ${espacio ? "tener más espacio" : "sumar más"}, pasate al plan ${candidato.nombre} (${cuanto}): quien es titular lo cambia en Plan y pago.`;
  }
  const pro = todos.find((p) => !p.aLaVenta);
  return pro ? `Si necesitás más, escribinos y lo vemos con el plan ${pro.nombre}.` : null;
}

// ── Suscripción: elegir, cambiar y cancelar (el titular, en /pago) ──────────────────────────────

const urlVuelta = (slug: string) => `${origenPlataforma()}/b/${slug}/pago?suscripcion=volvio`;

/** El primer cobro: cuando termine lo ya pagado o la prueba (si es más adelante); si no, ya. */
function inicioDelCobro(cuenta: Cuenta, ahora: Date): Date | undefined {
  const hasta = [cuenta.pagoHasta, cuenta.pruebaHasta].filter((d): d is Date => !!d && d > ahora).sort((a, b) => b.getTime() - a.getTime())[0];
  return hasta;
}

/** Lo que se le dice al titular al cambiar de plan (con el excedente, si quedó algo prendido). */
function mensajeDePlan(plan: Plan, r: PlanAplicado): string {
  const base = `Listo: ya tenés el plan ${plan.nombre}.`;
  if (!r.excedente) return `${base} Desde el próximo cobro se cobran ${plan.precio !== null ? formatearPesos(plan.precio) : "lo del plan"} por mes.`;
  const abierto = r.retenidos.map((m) => `${m.moduloId} (${m.abierto.join(", ")})`).join("; ");
  const precio = r.excedente.precio !== null ? ` (${formatearPesos(r.excedente.precio)} por mes)` : "";
  return `${base} Lo que ya está vendido no se corta: sigue prendido ${abierto}. Mientras siga abierto se cobra como el plan ${r.excedente.nombre}${precio}; cuando se cierre, se apaga solo y pasás a pagar el plan ${plan.nombre}.`;
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
  if (!plan || !plan.aLaVenta) throw new ErrorComercial("Ese plan no se puede elegir desde acá. Si te interesa, escribinos.");
  if (plan.precio === null) throw new ErrorComercial(`El plan ${plan.nombre} todavía no está disponible. Probá más tarde o elegí otro.`);
  const cuenta = await cuentaDe(tenantId);
  if (!cuenta) throw new ErrorComercial("Tu banda todavía no tiene un plan asignado. Escribinos y lo resolvemos.");
  if (cuenta.pro) throw new ErrorComercial("Tu cuenta tiene un plan a medida: el cambio lo hace el equipo de Deoco.");

  if (cuenta.suscripcionId && cuenta.suscripcionEstado === "activa") {
    if (cuenta.planId === planId && !cuenta.planElegido) return { mensaje: `Ya tenés el plan ${plan.nombre}.` };
    await conTenant(tenantId, (tx) => tx.comercialCuenta.update({ where: { tenantId }, data: { planId, planElegido: null } }));
    const r = await aplicarPlan(tenantId, ahora);
    return { mensaje: mensajeDePlan(plan, r) };
  }

  const banda = await conTenant(tenantId, async (tx) => ({
    titular: await titularDeBanda(tx),
    nombre: (await tx.tenant.findUnique({ where: { id: tenantId }, select: { nombre: true } }))?.nombre ?? slug,
  }));
  if (!banda.titular) throw new ErrorComercial("La banda no tiene titular. Escribinos y lo resolvemos.");
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
  if (!cuenta?.suscripcionId || cuenta.suscripcionEstado === "cancelada") throw new ErrorComercial("No tenés una suscripción activa: no hay nada para cancelar.");
  await cancelarSuscripcion(await comercial(), cuenta.suscripcionId);
  await conTenant(tenantId, (tx) => tx.comercialCuenta.update({ where: { tenantId }, data: { suscripcionEstado: "cancelada", planElegido: null } }));
  const hasta = cuenta.pagoHasta ?? cuenta.pruebaHasta;
  return hasta
    ? `Listo, cancelaste la suscripción: no se cobra más. Todo sigue funcionando hasta el ${hasta.toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" })}; después, sin pago, corre la escalera de la cuota impaga.`
    : "Listo, cancelaste la suscripción: no se cobra más.";
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
  // Rechazado: aviso ya (si estaba al día); los escalones siguientes cuentan desde el rechazo.
  if (resultado === "rechazado" && (await estadoDe(tenantId)) === "ACTIVO" && (await fijarEstado(modulo, tenantId, "MOROSO", "pago de la cuota rechazado"))) {
    await avisarMora(tenantId, "rechazado").catch((e) => console.error(`[comercial] mail de mora a ${tenantId}:`, e));
  }
  return resultado;
}

/** La escalera de la cuota impaga: días desde el vencimiento (comercial_config, la edita el staff). */
export type Escalera = { diasGracia: number; diasAvisoFuerte: number; diasSoloLectura: number; diasMoraASuspender: number; diasArchivo: number };

/** Los escalones, del más leve al más grave. */
const ESCALONES = ["ACTIVO", "MOROSO", "MOROSO_GRAVE", "SOLO_LECTURA", "SUSPENDIDO", "ARCHIVADO"] as const;
export type Escalon = (typeof ESCALONES)[number];
const gravedad = (e: string) => ESCALONES.indexOf(e as Escalon);

/**
 * Qué escalón le toca a una cuenta hoy (sin efectos: se prueba sola). Se cuenta desde la mora ya
 * marcada (un cobro rechazado) o desde el vencimiento: del pago, o de la prueba si nunca pagó.
 * `desde`: la fecha desde la que se cuenta (null si no hay mora).
 */
export function decidir(
  c: Pick<Cuenta, "pruebaHasta" | "pagoHasta" | "moraDesde">,
  cfg: Escalera,
  ahora: Date,
): { estado: Escalon; desde: Date | null } {
  const desdeVencida = c.moraDesde ?? c.pagoHasta ?? c.pruebaHasta;
  if (!desdeVencida) return { estado: "ACTIVO", desde: null };
  const dias = (ahora.getTime() - desdeVencida.getTime()) / DIA;
  // Con la mora marcada (rechazo), el aviso es inmediato; sin ella, después de la gracia.
  const desdeAviso = c.moraDesde ? 0 : cfg.diasGracia;
  const estado: Escalon =
    dias >= cfg.diasArchivo ? "ARCHIVADO"
    : dias >= cfg.diasMoraASuspender ? "SUSPENDIDO"
    : dias >= cfg.diasSoloLectura ? "SOLO_LECTURA"
    : dias >= cfg.diasAvisoFuerte ? "MOROSO_GRAVE"
    : dias >= desdeAviso ? "MOROSO"
    : "ACTIVO";
  return { estado, desde: estado === "ACTIVO" ? null : desdeVencida };
}

/** Lo que dice el mail de cada escalón que lo lleva (el aviso fuerte es solo en el panel). */
async function avisarEscalon(tenantId: string, estado: Escalon, causa: "prueba" | "mora") {
  if (estado === "MOROSO") return avisarMora(tenantId, "vencida");
  if (estado === "SOLO_LECTURA") return avisarSoloLectura(tenantId);
  if (estado === "SUSPENDIDO") return avisarSuspension(tenantId, causa);
  if (estado === "ARCHIVADO") return avisarArchivo(tenantId);
}

/**
 * Una cuenta: la sube al escalón que le toca hoy (nunca la baja: eso lo hace el pago) y avisa al
 * titular. Si el barrido estuvo parado, salta directo al que corresponde.
 */
export async function revisarCuenta(tenantId: string, ahora: Date, cfg: Escalera): Promise<Escalon | "nada"> {
  const modulo = await comercial();
  const cuenta = await cuentaDe(tenantId);
  if (!cuenta) return "nada";
  const d = decidir(cuenta, cfg, ahora);
  const actual = (await conTenant(tenantId, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { estado: true } }))).estado;
  if (gravedad(d.estado) <= gravedad(actual)) return "nada";
  if (d.desde && !cuenta.moraDesde) {
    await conTenant(tenantId, (tx: TxTenant) => tx.comercialCuenta.update({ where: { tenantId }, data: { moraDesde: d.desde } }));
  }
  const causa = cuenta.pagoHasta ? "mora" : "prueba";
  const dias = Math.floor((ahora.getTime() - d.desde!.getTime()) / DIA);
  if (await fijarEstado(modulo, tenantId, d.estado, causa === "prueba" ? `${dias} días desde el fin de la prueba sin pago` : `${dias} días de mora`)) {
    await avisarEscalon(tenantId, d.estado, causa).catch((e) => console.error(`[comercial] mail de ${d.estado} a ${tenantId}:`, e));
  }
  return d.estado;
}

const estadoDe = async (tenantId: string) => (await conTenant(tenantId, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { estado: true } }))).estado;

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
 * instante: si un tope bajó, se despublica lo último publicado (nunca se borra); un módulo que
 * sale del plan queda como excedente si tiene algo abierto. El precio nuevo rige desde el
 * próximo cobro de cada suscripción: el período ya pagado no cambia (3.2, dinero d5).
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

export type DatosPlazos = { diasPrueba: number; planPrueba: string } & Escalera;

export async function guardarPlazos(comoStaff: ComoStaff, datos: DatosPlazos) {
  const d: DatosPlazos = {
    diasPrueba: datos.diasPrueba, planPrueba: datos.planPrueba, diasGracia: datos.diasGracia, diasAvisoFuerte: datos.diasAvisoFuerte,
    diasSoloLectura: datos.diasSoloLectura, diasMoraASuspender: datos.diasMoraASuspender, diasArchivo: datos.diasArchivo,
  };
  for (const [k, v] of Object.entries(d)) {
    if (k !== "planPrueba" && (!Number.isSafeInteger(v) || (v as number) < 0 || (v as number) > 365)) throw new ErrorComercial(`${k}: entre 0 y 365 días.`);
  }
  const escalera = [d.diasGracia, d.diasAvisoFuerte, d.diasSoloLectura, d.diasMoraASuspender, d.diasArchivo];
  if (escalera.some((v, i) => i > 0 && v <= escalera[i - 1])) {
    throw new ErrorComercial("Los días de la escalera van en orden: aviso < aviso fuerte < solo lectura < suspendida < archivada.");
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
  const todos = await planes();
  if (!todos.some((p) => p.id === planId)) throw new ErrorComercial("Ese plan no existe.");
  if (pro) {
    validarPlan({ nombre: "pro", descripcion: "", precioUsd: "", precio: pro.precio, modulos: pro.modulos, almacenamiento: pro.almacenamiento ? BigInt(pro.almacenamiento) : null, topes: pro.topes, aLaVenta: false });
  }
  await comoStaff("comercial.plan_asignado", async (_tx, ctx) => {
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
}
