// La compra de un dominio, una vez pagada (docs/diseno-dominios.md §4, §8, §10). Una fila de
// `dominio_compra` por compra o renovación, con su paso actual; avanza desde el barrido (y apenas
// se paga), y si Deoco se reinicia retoma desde el último paso confirmado.
//
//   alta:       cliente → registrar → zona → nameservers → activacion → [principal] → listo
//   renovacion: renovar → listo
//   titular:    titular → listo   (cambio de titular registral; sin cobro)
//
// Reglas que no se rompen:
//   - Nunca se registra antes de cobrar: la compra la crea el gestor de cuenta con el cobro hecho.
//   - Nunca se registra dos veces: un cobro, una compra (índice único) y el registrador mira la
//     subcuenta antes de registrar.
//   - Un paso que falla no deshace los anteriores. Sin registrar y sin vuelta (alguien lo registró
//     en el medio, o 24 h sin poder), la compra falla y el pago se devuelve (`devolucion`); ya
//     registrado, el dominio es de la banda: no se devuelve, se sigue intentando.
//   - Lo que no se resuelve solo queda a la vista del staff (/admin/dominios), nunca en silencio.
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { avisarAlTitular } from "@/nucleo/correo/deoco";
import { prisma } from "@/nucleo/db/cliente";
import { conTenant } from "@/nucleo/db/con-tenant";
import { ZONA } from "@/nucleo/fechas";
import { registro as registroGlobal } from "@/nucleo/modulos";
import type { Registro } from "@/nucleo/modulos/registro";
import { ErrorDominio, ErrorProveedor, marcarPrincipal, normalizarDominio, proveedorDns, zonaParaComprado } from "./index";
import { type Aceptacion, type Contacto, ErrorRegistrador, type Operacion, type Registrador, registrador } from "./registrador";

export type PedidoCompra = {
  dominio: string;
  anios: number;
  contacto: Contacto;
  aceptacion: Aceptacion;
  /** Que pase a ser el principal apenas tenga certificado. */
  hacerPrincipal: boolean;
  cobro: { id: string; monto: number };
  usuarioId: string | null;
};

type Compra = Awaited<ReturnType<typeof prisma.dominioCompra.findFirstOrThrow>>;
type Paso = "cliente" | "registrar" | "zona" | "nameservers" | "activacion" | "principal" | "renovar" | "titular" | "listo";

const MIN = 60_000;
const HORA = 60 * MIN;
/** Cada cuánto se consulta una operación del registrador en curso. */
const ESPERA_OPERACION = MIN;
/** Cada cuánto se mira si la zona ya se activó (o si ya hay certificado para el principal). */
const ESPERA_ACTIVACION = 10 * MIN;
/** Espera creciente entre reintentos de un paso que falló (la última se repite). */
const REINTENTOS = [MIN, 5 * MIN, 15 * MIN, 30 * MIN, HORA, 2 * HORA, 4 * HORA, 6 * HORA];
/** Sin poder registrar en este tiempo, se devuelve el pago. */
const TOPE_SIN_REGISTRAR = 24 * HORA;
/** Esperando un dato del titular más que esto, la compra falla sin registrar y se devuelve. */
const TOPE_DATOS = 7 * 24 * HORA;
/** Esperando el certificado para el principal más que esto, queda listo sin principal. */
const TOPE_PRINCIPAL = 24 * HORA;
/** Un paso tomado hace más que esto quedó colgado (el proceso murió mientras corría). */
const COLGADO = 5 * MIN;

/** Cómo se nombra cada dato del titular en un mensaje ("el teléfono"). */
export const DATOS_DEL_TITULAR: Record<keyof Contacto, string> = {
  nombre: "el nombre",
  apellido: "el apellido",
  email: "el email",
  telefono: "el teléfono",
  direccion: "la dirección",
  ciudad: "la ciudad",
  provincia: "la provincia",
  codigoPostal: "el código postal",
  pais: "el país",
};

const fechaLarga = (d: Date) => d.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: ZONA });

function piezas(): { r: Registrador } {
  const r = registrador();
  if (!r || !proveedorDns()) throw new ErrorDominio("La compra de dominios todavía no está habilitada en Deoco.");
  return { r };
}

/**
 * El gestor de cuenta cobró: arranca la compra. Repetido con el mismo cobro (un aviso de pago que
 * llega dos veces), no crea otra.
 */
export async function dominioPagado(tenantId: string, p: PedidoCompra): Promise<{ compraId: string; repetida: boolean }> {
  const { r } = piezas();
  const dominio = normalizarDominio(p.dominio);
  return crear(tenantId, p.cobro, {
    usuarioId: p.usuarioId,
    tipo: "alta",
    dominio,
    registrador: r.nombre,
    anios: p.anios,
    contacto: p.contacto as unknown as Prisma.InputJsonValue,
    aceptacion: { fecha: p.aceptacion.fecha.toISOString(), ip: p.aceptacion.ip, claves: p.aceptacion.claves },
    hacerPrincipal: p.hacerPrincipal,
    paso: "cliente",
  });
}

/** El gestor de cuenta cobró una renovación. */
export async function renovacionPagada(
  tenantId: string,
  p: { dominio: string; anios: number; cobro: { id: string; monto: number }; usuarioId: string | null },
): Promise<{ compraId: string; repetida: boolean }> {
  const { r } = piezas();
  return crear(tenantId, p.cobro, { usuarioId: p.usuarioId, tipo: "renovacion", dominio: normalizarDominio(p.dominio), registrador: r.nombre, anios: p.anios, paso: "renovar" });
}

async function crear(
  tenantId: string,
  cobro: { id: string; monto: number },
  datos: Omit<Prisma.DominioCompraUncheckedCreateInput, "tenantId" | "cobroId" | "monto">,
): Promise<{ compraId: string; repetida: boolean }> {
  const r = await conTenant(tenantId, async (tx) => {
    const ya = await tx.dominioCompra.findFirst({ where: { cobroId: cobro.id }, select: { id: true } });
    if (ya) return { compraId: ya.id, repetida: true };
    const c = await tx.dominioCompra.create({ data: { tenantId, cobroId: cobro.id, monto: cobro.monto, ...datos }, select: { id: true } });
    const accion = datos.tipo === "titular" ? "dominio.titular_pedido" : `dominio.${datos.tipo === "alta" ? "compra" : "renovacion"}_pagada`;
    await tx.auditoria.create({ data: { usuarioId: datos.usuarioId ?? null, tenantId, accion, detalle: { dominio: datos.dominio, cobroId: cobro.id } } });
    return { compraId: c.id, repetida: false };
  });
  if (!r.repetida && datos.tipo === "titular") programar(tenantId);
  else if (!r.repetida) {
    // Que pueda cerrar la página: en el mail va adónde ver en qué está.
    await avisarAlTitular(tenantId, {
      clave: `dominio-pago-recibido:${cobro.id}`,
      asunto: () => (datos.tipo === "alta" ? `Recibimos tu pago: estamos registrando ${datos.dominio}` : `Recibimos tu pago: estamos renovando ${datos.dominio}`),
      parrafos: () => [
        datos.tipo === "alta"
          ? `Ya está pago ${datos.dominio}. Lo estamos registrando a nombre del titular y después conectamos el sitio: suele tardar menos de una hora.`
          : `Ya está paga la renovación de ${datos.dominio}. La estamos haciendo.`,
        "No tenés que hacer nada: te avisamos cuando esté. Mientras tanto, podés ver en qué va desde el panel.",
      ],
      boton: { texto: "Ver en qué va", ruta: "/dominios/compras" },
    }).catch((e) => console.error(`[compra] aviso de pago de ${datos.dominio}:`, e));
    programar(tenantId);
  }
  return r;
}

const enMarcha = new Set<Promise<unknown>>();

function programar(tenantId: string) {
  const correr = () => {
    const p = avanzarCompras(tenantId).catch((e) => console.error(`[compra] ${tenantId}:`, e));
    enMarcha.add(p);
    void p.finally(() => enMarcha.delete(p));
    return p;
  };
  try {
    after(correr);
  } catch {
    void correr(); // fuera de un pedido de Next
  }
}

/** Espera lo que quedó corriendo en segundo plano. Para pruebas y cierres ordenados. */
export async function esperarCompras() {
  while (enMarcha.size > 0) await Promise.all([...enMarcha]);
}

/** Barrido: las compras que toca avanzar, de todas las bandas. Devuelve cuántas terminaron (listas o fallidas). */
export async function revisarCompras(ahora = new Date()): Promise<number> {
  await vencerDatos(ahora).catch((e) => console.error("[compra] datos vencidos:", e));
  await pedirDevoluciones().catch((e) => console.error("[compra] devoluciones:", e));
  if (!registrador()) return 0;
  const bandas = await prisma.$queryRaw<{ id: string }[]>`SELECT b AS id FROM bandas_con_compras_pendientes(${ahora}::timestamp) AS b`;
  let terminadas = 0;
  for (const { id } of bandas) terminadas += await avanzarCompras(id, ahora).catch((e) => (console.error(`[compra] ${id}:`, e), 0));
  return terminadas;
}

/** Avanza las compras de la banda que toca. Cada una se "toma" en la base: nunca corre dos veces a la vez. */
export async function avanzarCompras(tenantId: string, ahora = new Date()): Promise<number> {
  const compras = await conTenant(tenantId, (tx) =>
    tx.dominioCompra.findMany({ where: { estado: "en-curso", proximoIntento: { lte: ahora } }, orderBy: { creadoEn: "asc" } }),
  );
  let terminadas = 0;
  for (const c of compras) {
    const { count } = await conTenant(tenantId, (tx) =>
      tx.dominioCompra.updateMany({
        where: { id: c.id, estado: "en-curso", OR: [{ tomadoEn: null }, { tomadoEn: { lt: new Date(ahora.getTime() - COLGADO) } }] },
        data: { tomadoEn: ahora },
      }),
    );
    if (count === 0) continue;
    try {
      const fin = await avanzar(tenantId, c, ahora);
      if (fin) terminadas++;
    } finally {
      await conTenant(tenantId, (tx) => tx.dominioCompra.update({ where: { id: c.id }, data: { tomadoEn: null } }));
    }
  }
  if (terminadas) await pedirDevolucionesDe(tenantId);
  return terminadas;
}

/** Compras que esperan un dato del titular hace más de 7 días: fallan sin registrar y se devuelven. */
export async function vencerDatos(ahora = new Date()): Promise<number> {
  const limite = new Date(ahora.getTime() - TOPE_DATOS);
  const bandas = await prisma.$queryRaw<{ id: string }[]>`SELECT b AS id FROM bandas_con_datos_vencidos(${limite}::timestamp) AS b`;
  let vencidas = 0;
  for (const { id: tenantId } of bandas) {
    const compras = await conTenant(tenantId, (tx) => tx.dominioCompra.findMany({ where: { estado: "datos", datosDesde: { lt: limite } } }));
    for (const c of compras) {
      // ¿Quedó registrado igual (una operación que respondió tarde)? Entonces es de la banda: sigue, no se devuelve.
      const r = registrador();
      const clienteId = r ? await clienteDe(tenantId, c.registrador).catch(() => null) : null;
      if (r && clienteId && (await r.dominio(clienteId, c.dominio).catch(() => null))) {
        await conTenant(tenantId, (tx) => tx.dominioCompra.updateMany({ where: { id: c.id, estado: "datos" }, data: { estado: "en-curso", paso: "zona", operacion: Prisma.DbNull, datosDesde: null, proximoIntento: ahora } }));
        continue;
      }
      const fin = await fallar(tenantId, c, "datos-invalidos", `Nadie corrigió el dato rechazado en 7 días: ${c.error ?? ""}`);
      const { count } = await conTenant(tenantId, (tx) => tx.dominioCompra.updateMany({ where: { id: c.id, estado: "datos" }, data: { ...(fin.datos as Prisma.DominioCompraUpdateManyMutationInput), datosDesde: null } }));
      vencidas += count;
    }
    if (compras.length) await pedirDevolucionesDe(tenantId);
  }
  return vencidas;
}

// ── Devoluciones ─────────────────────────────────────────────────────────────────────────────
// La plata es del gestor (la cobró en la cuenta de Deoco): acá solo se le pide que devuelva. Una
// compra fallida sin registrar queda `devolucion: "pendiente"` hasta que el gestor la anota
// ("pedida"); desde ahí la corre y la reintenta él, y si no sale lo muestra al staff. Si el gestor
// no la pudo anotar, sigue pendiente: el barrido vuelve a pedirla y el back office la muestra.

/** Pide las devoluciones pendientes de una banda. Devuelve cuántas pidió. */
export async function pedirDevolucionesDe(tenantId: string, reg: Registro = registroGlobal()): Promise<number> {
  const cobro = reg.gestor?.gestion.dominios;
  if (!cobro) return 0;
  const pendientes = await conTenant(tenantId, (tx) => tx.dominioCompra.findMany({ where: { devolucion: "pendiente" }, select: { id: true, cobroId: true, dominio: true, motivo: true, tipo: true } }));
  let pedidas = 0;
  for (const c of pendientes) {
    try {
      const motivo = c.tipo === "renovacion" ? `No se pudo renovar ${c.dominio}` : c.motivo === "no-disponible" ? `Alguien registró ${c.dominio} antes` : `No se pudo registrar ${c.dominio}`;
      await cobro.devolver(tenantId, c.cobroId, motivo);
      await conTenant(tenantId, async (tx) => {
        await tx.dominioCompra.updateMany({ where: { id: c.id, devolucion: "pendiente" }, data: { devolucion: "pedida" } });
        await tx.auditoria.create({ data: { usuarioId: null, tenantId, accion: "dominio.devolucion_pedida", detalle: { dominio: c.dominio, cobroId: c.cobroId } } });
      });
      pedidas++;
    } catch (e) {
      console.error(`[compra] no se pudo pedir la devolución de ${c.dominio} (${tenantId}):`, e);
    }
  }
  return pedidas;
}

/** Barrido: las devoluciones que todavía no se le pidieron al gestor, de todas las bandas. */
export async function pedirDevoluciones(reg: Registro = registroGlobal()): Promise<number> {
  if (!reg.gestor?.gestion.dominios) return 0;
  const bandas = await prisma.$queryRaw<{ id: string }[]>`SELECT b AS id FROM bandas_con_devoluciones_pendientes() AS b`;
  let pedidas = 0;
  for (const { id } of bandas) pedidas += await pedirDevolucionesDe(id, reg);
  return pedidas;
}

/** Corre los pasos de una compra hasta que uno tenga que esperar. true si terminó. */
async function avanzar(tenantId: string, inicial: Compra, ahora: Date): Promise<boolean> {
  const { r } = piezas();
  let c = inicial;
  for (let vuelta = 0; vuelta < 10; vuelta++) {
    let r1: Resultado;
    try {
      r1 = await paso(tenantId, c, r, ahora);
    } catch (e) {
      r1 = await falla(tenantId, c, r, e, ahora);
    }
    c = await conTenant(tenantId, (tx) =>
      tx.dominioCompra.update({
        where: { id: c.id },
        data: {
          ...r1.datos,
          ...(r1.tipo === "siguiente"
            ? { paso: r1.paso, operacion: r1.operacion ?? Prisma.DbNull, error: null, motivo: null, campo: null, primerFalloEn: null, intentos: 0 }
            : {}),
          ...(r1.tipo === "esperar" ? { proximoIntento: new Date(ahora.getTime() + r1.ms) } : {}),
          // Esperar sin fallar (una operación en curso, la activación): lo que había fallado antes, ya no.
          ...(r1.tipo === "esperar" && !r1.falla ? { error: null, motivo: null, primerFalloEn: null, intentos: 0 } : {}),
        },
      }),
    );
    if (r1.tipo === "esperar") return false;
    if (r1.tipo === "fin") return true;
  }
  return false;
}

type Resultado =
  | { tipo: "siguiente"; paso: Paso; operacion?: Prisma.InputJsonValue | null; datos?: Prisma.DominioCompraUpdateInput }
  | { tipo: "esperar"; ms: number; datos?: Prisma.DominioCompraUpdateInput; falla?: true }
  | { tipo: "fin"; datos: Prisma.DominioCompraUpdateInput };

const op = (c: Compra) => (c.operacion as Operacion | null) ?? null;

/** Una operación del registrador: si no hay, la pide; si está en curso, la consulta. */
async function operacionDe(c: Compra, r: Registrador, clienteId: string, pedir: () => Promise<Operacion>): Promise<Operacion> {
  const o = op(c);
  return o ? (o.estado === "lista" ? o : await r.operacion(clienteId, o)) : await pedir();
}

async function clienteDe(tenantId: string, registradorNombre: string): Promise<string> {
  const rc = await conTenant(tenantId, (tx) => tx.registradorCliente.findFirst({ where: { registrador: registradorNombre } }));
  if (!rc) throw new ErrorRegistrador("La banda todavía no tiene subcuenta en el registrador.", "desconocido");
  return rc.clienteId;
}

async function paso(tenantId: string, c: Compra, r: Registrador, ahora: Date): Promise<Resultado> {
  const contacto = c.contacto as unknown as Contacto;
  switch (c.paso as Paso) {
    case "cliente": {
      const ya = await conTenant(tenantId, (tx) => tx.registradorCliente.findFirst({ where: { registrador: c.registrador } }));
      if (!ya) {
        const { clienteId } = await r.crearCliente({ email: contacto.email, nombre: contacto.nombre, apellido: contacto.apellido, referencia: tenantId });
        await conTenant(tenantId, (tx) => tx.registradorCliente.create({ data: { tenantId, registrador: c.registrador, clienteId } }));
      }
      return { tipo: "siguiente", paso: "registrar", operacion: null };
    }
    case "registrar": {
      const clienteId = await clienteDe(tenantId, c.registrador);
      const a = c.aceptacion as { fecha: string; ip: string; claves: string[] };
      const o = await operacionDe(c, r, clienteId, () =>
        // Sin nameservers: los de la zona se ponen después (la zona no se puede crear antes de que el dominio exista).
        r.registrar(clienteId, { dominio: c.dominio, contacto, anios: c.anios, nameservers: [], aceptacion: { fecha: new Date(a.fecha), ip: a.ip, claves: a.claves } }),
      );
      if (o.estado === "en-curso") return { tipo: "esperar", ms: ESPERA_OPERACION, datos: { operacion: o } };
      if (o.estado === "fallida") {
        // ¿Quedó registrado igual? Si está en la subcuenta, sí: se sigue.
        if (await r.dominio(clienteId, c.dominio)) return { tipo: "siguiente", paso: "zona", operacion: null };
        return fallar(tenantId, c, "desconocido", `El registrador no pudo registrarlo: ${o.motivo ?? ""}`);
      }
      const d = await r.dominio(clienteId, c.dominio);
      await conTenant(tenantId, (tx) => tx.auditoria.create({ data: { usuarioId: null, tenantId, accion: "dominio.registrado", detalle: { dominio: c.dominio, registrador: c.registrador } } }));
      return { tipo: "siguiente", paso: "zona", operacion: null, datos: { venceEn: d?.venceEn ?? null } };
    }
    case "zona": {
      const nameservers = await zonaParaComprado(tenantId, c.dominio);
      return { tipo: "siguiente", paso: "nameservers", operacion: { nameservers } as unknown as Prisma.InputJsonValue };
    }
    case "nameservers": {
      const clienteId = await clienteDe(tenantId, c.registrador);
      const previo = c.operacion as { nameservers?: string[] } & Partial<Operacion>;
      const o = previo?.id ? (previo.estado === "lista" ? (previo as Operacion) : await r.operacion(clienteId, previo as Operacion)) : await r.ponerNameservers(clienteId, c.dominio, previo?.nameservers ?? []);
      if (o.estado === "en-curso") return { tipo: "esperar", ms: ESPERA_OPERACION, datos: { operacion: o } };
      if (o.estado === "fallida") throw new ErrorRegistrador(`No se pudieron poner los nameservers: ${o.motivo ?? ""}`, "temporal");
      return { tipo: "siguiente", paso: "activacion", operacion: null };
    }
    case "activacion": {
      // La verificación la hace la revisión de delegaciones (cada 10 min): acá se espera.
      const fila = await conTenant(tenantId, (tx) => tx.dominio.findFirst({ where: { dominio: c.dominio, comprado: true } }));
      if (!fila) throw new ErrorRegistrador(`No está la fila de ${c.dominio} en la banda.`, "desconocido");
      if (!fila.verificado) return { tipo: "esperar", ms: ESPERA_ACTIVACION };
      return { tipo: "siguiente", paso: c.hacerPrincipal && c.usuarioId ? "principal" : "listo", operacion: null };
    }
    case "principal": {
      const fila = await conTenant(tenantId, (tx) => tx.dominio.findFirst({ where: { dominio: c.dominio, comprado: true } }));
      try {
        if (fila) await marcarPrincipal(c.usuarioId!, tenantId, fila.id);
      } catch (e) {
        if (!(e instanceof ErrorDominio)) throw e;
        // Todavía sin certificado: se espera, hasta un tope (después queda listo sin principal).
        if (ahora.getTime() - c.creadoEn.getTime() < TOPE_PRINCIPAL) return { tipo: "esperar", ms: ESPERA_ACTIVACION };
      }
      return { tipo: "siguiente", paso: "listo", operacion: null };
    }
    case "renovar": {
      const clienteId = await clienteDe(tenantId, c.registrador);
      const o = await operacionDe(c, r, clienteId, async () => {
        const d = await r.dominio(clienteId, c.dominio);
        if (!d) throw new ErrorRegistrador(`${c.dominio} ya no está en la subcuenta de la banda.`, "desconocido");
        await conTenant(tenantId, (tx) => tx.dominioCompra.update({ where: { id: c.id }, data: { venceEn: d.venceEn } }));
        return r.renovar(clienteId, c.dominio, d.venceEn, c.anios);
      });
      if (o.estado === "en-curso") return { tipo: "esperar", ms: ESPERA_OPERACION, datos: { operacion: o } };
      if (o.estado === "fallida") throw new ErrorRegistrador(`El registrador no pudo renovarlo: ${o.motivo ?? ""}`, "desconocido");
      const d = await r.dominio(clienteId, c.dominio);
      return { tipo: "siguiente", paso: "listo", operacion: null, datos: { venceEn: d?.venceEn ?? null } };
    }
    case "titular": {
      const clienteId = await clienteDe(tenantId, c.registrador);
      const o = await operacionDe(c, r, clienteId, () => r.cambiarTitular(clienteId, c.dominio, contacto));
      if (o.estado === "en-curso") return { tipo: "esperar", ms: ESPERA_OPERACION, datos: { operacion: o } };
      if (o.estado === "fallida") throw new ErrorRegistrador(`El registrador no pudo cambiar el titular: ${o.motivo ?? ""}`, "desconocido");
      return { tipo: "siguiente", paso: "listo", operacion: null };
    }
    case "listo":
      return terminarBien(tenantId, c);
  }
}

/**
 * Cambio de titular registral de un dominio comprado (lo pide el titular de la banda desde el
 * panel). Va por la misma máquina, sin cobro: reintentos, dato rechazado, progreso.
 */
export async function cambiarTitularRegistral(usuarioId: string, tenantId: string, crudo: string, contacto: Contacto): Promise<{ compraId: string }> {
  const { r } = piezas();
  const dominio = normalizarDominio(crudo);
  const fila = await conTenant(tenantId, (tx) => tx.dominio.findFirst({ where: { dominio, comprado: true } }));
  if (!fila) throw new ErrorDominio(`${dominio} no es un dominio comprado en Deoco.`);
  if (fila.vencidoEn) throw new ErrorDominio(`${dominio} está vencido: renovalo primero.`);
  const abierta = await conTenant(tenantId, (tx) => tx.dominioCompra.findFirst({ where: { dominio, tipo: "titular", estado: { in: ["en-curso", "datos"] } } }));
  if (abierta) throw new ErrorDominio("Ya hay un cambio de titular en curso para ese dominio.");
  const { compraId } = await crear(tenantId, { id: `titular:${randomUUID()}`, monto: 0 }, {
    usuarioId,
    tipo: "titular",
    dominio,
    registrador: r.nombre,
    contacto: contacto as unknown as Prisma.InputJsonValue,
    paso: "titular",
  });
  return { compraId };
}

async function terminarBien(tenantId: string, c: Compra): Promise<Resultado> {
  const vence = c.venceEn;
  const contacto = c.contacto as unknown as Contacto;
  if (c.tipo === "titular") {
    await conTenant(tenantId, (tx) => tx.auditoria.create({ data: { usuarioId: c.usuarioId, tenantId, accion: "dominio.titular_cambiado", detalle: { dominio: c.dominio, titular: `${contacto.nombre} ${contacto.apellido}` } } }));
    await avisarAlTitular(tenantId, {
      clave: `dominio-titular:${c.id}`,
      asunto: () => `Cambiamos el titular de ${c.dominio}`,
      parrafos: () => [
        `${c.dominio} ahora está registrado a nombre de ${contacto.nombre} ${contacto.apellido} (${contacto.email}).`,
        "Por las reglas del registro, después de un cambio de titular el dominio no se puede llevar a otro registrador por 60 días.",
      ],
      boton: { texto: "Ver Dominios", ruta: "/dominios" },
    }).catch((e) => console.error(`[compra] aviso de ${c.dominio}:`, e));
    return { tipo: "fin", datos: { estado: "listo", terminadoEn: new Date(), operacion: undefined } };
  }
  // El vencimiento del dominio: el que informó el registrador. Renovado después de vencer, vuelve
  // a ser el principal si lo era (sin certificado todavía, queda como secundario y la banda elige).
  const fila = await conTenant(tenantId, async (tx) => {
    const f = await tx.dominio.findFirst({ where: { dominio: c.dominio, comprado: true } });
    if (f && vence) await tx.dominio.update({ where: { id: f.id }, data: { venceEn: vence, vencidoEn: null, vencidoEraPrincipal: false } });
    return f;
  });
  if (fila?.vencidoEn && fila.vencidoEraPrincipal && c.usuarioId) await marcarPrincipal(c.usuarioId, tenantId, fila.id).catch(() => undefined);
  await conTenant(tenantId, (tx) => tx.auditoria.create({ data: { usuarioId: null, tenantId, accion: `dominio.${c.tipo === "alta" ? "compra" : "renovacion"}_lista`, detalle: { dominio: c.dominio } } }));
  await avisarAlTitular(tenantId, {
    clave: `dominio-compra-lista:${c.id}`,
    asunto: () => (c.tipo === "alta" ? `${c.dominio} ya es tuyo` : `Renovamos ${c.dominio}`),
    parrafos: (banda) =>
      c.tipo === "alta"
        ? [
            `${c.dominio} quedó registrado a nombre de ${(c.contacto as unknown as Contacto).nombre} ${(c.contacto as unknown as Contacto).apellido} y el sitio de ${banda} ya anda en https://${c.dominio}.`,
            ...(vence ? [`Vence el ${fechaLarga(vence)}. Te avisamos antes para renovarlo; Deoco nunca lo renueva sin que lo pagues.`] : []),
          ]
        : [`${c.dominio} quedó renovado${vence ? ` hasta el ${fechaLarga(vence)}` : ""}.`],
    boton: { texto: "Ver Dominios", ruta: "/dominios" },
  }).catch((e) => console.error(`[compra] aviso de ${c.dominio}:`, e));
  return { tipo: "fin", datos: { estado: "listo", terminadoEn: new Date(), operacion: undefined } };
}

/** Termina mal: sin registrar, el pago se devuelve. */
async function fallar(tenantId: string, c: Compra, motivo: string, error: string): Promise<Resultado> {
  // Se devuelve lo que no se hizo: un alta sin registrar o una renovación sin renovar.
  const sinRegistrar = (c.tipo === "alta" && (c.paso === "cliente" || c.paso === "registrar")) || (c.tipo === "renovacion" && c.paso === "renovar");
  console.error(`[compra] ${c.dominio} (${tenantId}) falló: ${motivo}: ${error}`);
  await conTenant(tenantId, (tx) => tx.auditoria.create({ data: { usuarioId: null, tenantId, accion: "dominio.compra_fallida", detalle: { dominio: c.dominio, motivo, error } } }));
  if (c.tipo === "titular") {
    await avisarAlTitular(tenantId, {
      clave: `dominio-titular-fallido:${c.id}`,
      asunto: () => `No pudimos cambiar el titular de ${c.dominio}`,
      parrafos: () => [`El registrador no aceptó el cambio de titular de ${c.dominio}. El dominio sigue como estaba. Podés volver a pedirlo desde Dominios o escribirnos.`],
      boton: { texto: "Ir a Dominios", ruta: "/dominios" },
    }).catch((e) => console.error(`[compra] aviso de ${c.dominio}:`, e));
  }
  if (sinRegistrar) {
    await avisarAlTitular(tenantId, {
      clave: `dominio-compra-fallida:${c.id}`,
      asunto: () => (c.tipo === "renovacion" ? `No pudimos renovar ${c.dominio}` : `No pudimos registrar ${c.dominio}`),
      parrafos: () => [
        c.tipo === "renovacion"
          ? `No pudimos renovar ${c.dominio}. Te devolvemos el pago completo; si todavía no venció, probá de nuevo desde Dominios o escribinos.`
          : motivo === "no-disponible"
            ? `Alguien registró ${c.dominio} antes que nosotros. Te devolvemos el pago completo.`
            : `No pudimos registrar ${c.dominio}. Te devolvemos el pago completo.`,
        "Podés buscar otro en Dominios.",
      ],
      boton: { texto: "Ir a Dominios", ruta: "/dominios" },
    }).catch((e) => console.error(`[compra] aviso de ${c.dominio}:`, e));
  }
  return { tipo: "fin", datos: { estado: "fallido", motivo, error: error.slice(0, 500), terminadoEn: new Date(), ...(sinRegistrar ? { devolucion: "pendiente" } : {}) } };
}

/** Un paso tiró: decide reintentar, esperar a la banda o fallar. */
async function falla(tenantId: string, c: Compra, r: Registrador, e: unknown, ahora: Date): Promise<Resultado> {
  const err =
    e instanceof ErrorRegistrador
      ? e
      : e instanceof ErrorProveedor
        ? new ErrorRegistrador(e.message, e.tipo === "temporal" ? "temporal" : "desconocido")
        : e instanceof ErrorDominio
          ? new ErrorRegistrador(e.message, "desconocido")
          : new ErrorRegistrador(e instanceof Error ? e.message : String(e), "desconocido");
  const sinRegistrar = c.tipo === "alta" && (c.paso === "cliente" || (c.paso === "registrar" && !op(c)));
  if (err.tipo === "no-disponible" && sinRegistrar) return fallar(tenantId, c, "no-disponible", err.message);
  if (err.tipo === "datos-invalidos") {
    await avisarAlTitular(tenantId, {
      clave: `dominio-compra-datos:${c.id}:${err.campo ?? "?"}:${c.intentos}`,
      asunto: () => `Revisá un dato para registrar ${c.dominio}`,
      parrafos: () => [
        `El registrador no aceptó ${err.campo && err.campo in DATOS_DEL_TITULAR ? DATOS_DEL_TITULAR[err.campo as keyof Contacto] : "uno de los datos"} del titular de ${c.dominio}. Ya pagaste: corregilo y seguimos solos.`,
      ],
      boton: { texto: "Corregir el dato", ruta: "/dominios/compras" },
    }).catch((x) => console.error(`[compra] aviso de datos de ${c.dominio}:`, x));
    return { tipo: "fin", datos: { estado: "datos", motivo: "datos-invalidos", campo: err.campo ?? null, error: err.message.slice(0, 500), datosDesde: ahora } };
  }
  const primer = c.primerFalloEn ?? ahora;
  // Sin registrar, 24 h sin poder: se devuelve. (Con una operación aceptada, se mira antes la subcuenta.)
  if (c.tipo === "alta" && (c.paso === "cliente" || c.paso === "registrar") && ahora.getTime() - primer.getTime() >= TOPE_SIN_REGISTRAR) {
    const clienteId = await clienteDe(tenantId, c.registrador).catch(() => null);
    const registrado = clienteId ? await r.dominio(clienteId, c.dominio).catch(() => null) : null;
    if (!registrado) return fallar(tenantId, c, err.tipo, err.message);
  }
  // Renovación sin poder en 24 h (p. ej. el dominio ya no está en la subcuenta): si el registrador
  // no muestra un vencimiento posterior al de antes de renovar, no se renovó y se devuelve.
  if (c.tipo === "renovacion" && c.paso === "renovar" && ahora.getTime() - primer.getTime() >= TOPE_SIN_REGISTRAR) {
    const clienteId = await clienteDe(tenantId, c.registrador).catch(() => null);
    const d = clienteId ? await r.dominio(clienteId, c.dominio).catch(() => null) : null;
    if (d && c.venceEn && d.venceEn > c.venceEn) return { tipo: "siguiente", paso: "listo", operacion: null, datos: { venceEn: d.venceEn } };
    return fallar(tenantId, c, err.tipo, err.message);
  }
  // Cambio de titular sin poder en 24 h: queda como estaba (no hay plata en juego).
  if (c.tipo === "titular" && ahora.getTime() - primer.getTime() >= TOPE_SIN_REGISTRAR) return fallar(tenantId, c, err.tipo, err.message);
  if (!c.motivo || c.motivo !== err.tipo) console.error(`[compra] ${c.dominio} (${tenantId}), paso ${c.paso}: ${err.tipo}: ${err.message}`);
  const espera = REINTENTOS[Math.min(c.intentos, REINTENTOS.length - 1)];
  return {
    tipo: "esperar",
    ms: err.tipo === "sin-saldo" ? 15 * MIN : espera,
    falla: true,
    datos: { intentos: { increment: 1 }, primerFalloEn: primer, motivo: err.tipo, error: err.message.slice(0, 500) },
  };
}

/** La banda corrigió el dato que el registrador no aceptó: sigue sola. */
export async function corregirDatosCompra(tenantId: string, compraId: string, contacto: Contacto): Promise<void> {
  const { count } = await conTenant(tenantId, (tx) =>
    tx.dominioCompra.updateMany({
      where: { id: compraId, estado: "datos" },
      data: { contacto: contacto as unknown as Prisma.InputJsonValue, estado: "en-curso", proximoIntento: new Date(), motivo: null, campo: null, error: null, operacion: undefined, datosDesde: null },
    }),
  );
  if (count === 0) throw new ErrorDominio("Esa compra no está esperando datos.");
  programar(tenantId);
}

/** Staff: reintentar ya una compra en curso (después de recargar saldo, por ejemplo). */
export async function reintentarCompra(tenantId: string, compraId: string): Promise<void> {
  piezas();
  const { count } = await conTenant(tenantId, (tx) =>
    tx.dominioCompra.updateMany({ where: { id: compraId, estado: "en-curso" }, data: { proximoIntento: new Date() } }),
  );
  if (count === 0) throw new ErrorDominio("Esa compra no está en curso.");
  await avanzarCompras(tenantId);
}
