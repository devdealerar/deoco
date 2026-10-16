// Complementos sueltos (3.2 núcleo d6: "un evento puntual que excede el plan → complemento suelto
// en lugar de cambio de plan") y el excedente que solo se mide (d5: "se permite el excedente, se
// avisa y se factura después").
//
// - El staff define los complementos (`comercial_complemento`): a qué tope suman, cuánto y por
//   cuántos meses calendario.
// - La banda los compra en Plan y pago con un pago único a la cuenta de Deoco (el mismo cobro que
//   los dominios: inmediato, monto exacto, devolución con reintentos). Al aprobarse, el núcleo
//   suma al tope (`sumarExtra`, `limite_extra`) para el mes que eligió.
// - Excedente: lo que pasa de un tope que solo mide (entradas vendidas en el mes). No se cobra
//   solo: se muestra con el plan y el complemento que lo cubren (decisión del bloque D).
import type { Prisma } from "@/generated/prisma/client";
import { usoDeLimites, catalogoDeCuenta, type UsoDeLimite } from "@/nucleo/cuenta";
import { prisma } from "@/nucleo/db/cliente";
import { conTenant } from "@/nucleo/db/con-tenant";
import { formatearPesos } from "@/nucleo/dinero";
import { mesArgentino } from "@/nucleo/fechas";
import { titularDeBanda } from "@/nucleo/personas";
import { origenPlataforma } from "@/nucleo/tenant/hosts";
import { type ComoStaff, ErrorComercial, planes } from "./cuenta";
import { cobroUnico } from "./dominios";

export type Complemento = Awaited<ReturnType<typeof prisma.comercialComplemento.findFirstOrThrow>>;

export const listarComplementos = (soloActivos = true) =>
  prisma.comercialComplemento.findMany({ where: soloActivos ? { activo: true } : {}, orderBy: [{ orden: "asc" }, { id: "asc" }] });

export type DatosComplemento = Pick<Complemento, "nombre" | "descripcion" | "precio" | "limite" | "cantidad" | "meses" | "activo">;

/** El staff crea o cambia un complemento. Lo ya comprado no cambia (cada compra guarda lo suyo). */
export async function guardarComplemento(comoStaff: ComoStaff, id: string, d: DatosComplemento) {
  if (!/^[a-z0-9-]{2,40}$/.test(id)) throw new ErrorComercial("El id va en minúsculas, números y guiones (2 a 40).");
  const nombre = d.nombre.trim();
  if (!nombre || nombre.length > 80) throw new ErrorComercial("Falta el nombre (hasta 80 caracteres).");
  if (!Number.isSafeInteger(d.precio) || d.precio <= 0) throw new ErrorComercial("El precio tiene que ser mayor que cero.");
  if (!Number.isSafeInteger(d.cantidad) || d.cantidad <= 0) throw new ErrorComercial("La cantidad tiene que ser mayor que cero.");
  if (!Number.isInteger(d.meses) || d.meses < 1 || d.meses > 12) throw new ErrorComercial("Dura de 1 a 12 meses.");
  if (!catalogoDeCuenta().limites.some((l) => l.id === d.limite)) throw new ErrorComercial(`No existe el límite "${d.limite}".`);
  const datos = { ...d, nombre, descripcion: d.descripcion.trim().slice(0, 300) };
  return comoStaff("comercial.complemento_guardado", async (tx, ctx) => {
    const antes = await tx.comercialComplemento.findUnique({ where: { id } });
    const r = await tx.comercialComplemento.upsert({ where: { id }, create: { id, ...datos }, update: datos });
    ctx.detalle({ id, antes: antes && { precio: antes.precio, cantidad: antes.cantidad, activo: antes.activo }, despues: { precio: r.precio, cantidad: r.cantidad, activo: r.activo } });
    return r;
  });
}

/** Los meses que se pueden elegir para un complemento: este y los cinco siguientes. */
export function mesesElegibles(ahora = new Date()): { clave: string; texto: string }[] {
  const out: { clave: string; texto: string }[] = [];
  let d = ahora;
  for (let i = 0; i < 6; i++) {
    const m = mesArgentino(d);
    const texto = m.desde.toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" });
    out.push({ clave: m.clave, texto: i === 0 ? `${texto} (este mes)` : texto });
    d = new Date(m.hasta.getTime() + 3600_000);
  }
  return out;
}

/** El período de un complemento que arranca en `mes` ("2026-11") y dura `meses`. */
export function periodoDe(mes: string, meses: number): { desde: Date; hasta: Date } {
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new ErrorComercial("Elegí el mes.");
  const desde = mesArgentino(new Date(`${mes}-15T12:00:00Z`)).desde;
  let hasta = desde;
  for (let i = 0; i < meses; i++) hasta = mesArgentino(new Date(hasta.getTime() + 3600_000)).hasta;
  return { desde, hasta };
}

/**
 * La banda compra un complemento para `mes`: a la pasarela de Deoco. Solo el titular (lo exige la
 * acción). Un mes que ya pasó no se puede elegir.
 */
export async function comprarComplemento(tenantId: string, slug: string, complementoId: string, mes: string, usuarioId: string, ahora = new Date()) {
  const c = await prisma.comercialComplemento.findUnique({ where: { id: complementoId } });
  if (!c || !c.activo) throw new ErrorComercial("Ese complemento no está disponible.");
  if (!mesesElegibles(ahora).some((m) => m.clave === mes)) throw new ErrorComercial("Elegí un mes entre este y los cinco que siguen.");
  const { desde, hasta } = periodoDe(mes, c.meses);
  const titular = await conTenant(tenantId, (tx) => titularDeBanda(tx));
  if (!titular) throw new ErrorComercial("La banda no tiene titular.");
  return cobroUnico(tenantId, {
    tipo: "complemento",
    dominio: c.id,
    anios: 1,
    monto: c.precio,
    clave: `complemento:${c.id}:${mes}:${Date.now()}`,
    datos: { complementoId: c.id, nombre: c.nombre, limite: c.limite, cantidad: c.cantidad, mes, desde: desde.toISOString(), hasta: hasta.toISOString() } as Prisma.InputJsonValue,
    usuarioId,
    email: titular.email,
    vuelta: `${origenPlataforma()}/b/${slug}/pago`,
    titulo: `Deoco · ${c.nombre} (${mes})`,
  });
}

/** Complementos comprados por la banda (pagados), con su período. */
export async function complementosDeBanda(tenantId: string) {
  const filas = await conTenant(tenantId, (tx) =>
    tx.comercialDominioCobro.findMany({ where: { tipo: "complemento", estado: { in: ["pagado", "devuelto"] } }, orderBy: { pagadoEn: "desc" }, take: 50 }),
  );
  return filas.map((f) => {
    const d = f.datos as { nombre: string; mes: string; cantidad: number; limite: string };
    return { id: f.id, nombre: d.nombre, mes: d.mes, cantidad: d.cantidad, limite: d.limite, monto: f.monto, estado: f.estado, pagadoEn: f.pagadoEn };
  });
}

export type Sugerencia = { limite: UsoDeLimite; plan: { id: string; nombre: string; precio: number | null } | null; complementos: Complemento[] };

/**
 * Lo que la banda tiene en el tope o pasado (el excedente de lo que solo se mide, como las
 * entradas del mes): con el plan que lo cubre y los complementos que suman a ese tope. Nunca
 * sugiere bajar de plan.
 */
export async function sugerencias(tenantId: string, planActual: string, ahora = new Date()): Promise<Sugerencia[]> {
  const [uso, todos, comps] = await Promise.all([usoDeLimites(tenantId, undefined, ahora), planes(), listarComplementos()]);
  const actual = todos.find((p) => p.id === planActual);
  const precioActual = actual?.precio ?? 0;
  return uso
    .filter((l) => l.maximo !== null && (l.excedente > 0 || l.usados >= l.maximo))
    .map((l) => {
      const cubre = todos.find(
        (p) => p.aLaVenta && p.precio !== null && p.precio > precioActual && (p.topes[l.id] === undefined || p.topes[l.id] >= l.usados),
      );
      return { limite: l, plan: cubre ? { id: cubre.id, nombre: cubre.nombre, precio: cubre.precio } : null, complementos: comps.filter((c) => c.limite === l.id) };
    });
}

export const precioComplemento = (c: Pick<Complemento, "precio">) => formatearPesos(c.precio);
