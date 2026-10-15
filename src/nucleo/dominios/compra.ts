// La compra de un dominio, una vez pagada (docs/diseno-dominios.md §4, §8, §10). Una fila de
// `dominio_compra` por compra o renovación, con su paso actual; avanza desde el barrido (y apenas
// se paga), y si Deoco se reinicia retoma desde el último paso confirmado.
//
//   alta:       cliente → registrar → zona → nameservers → activacion → [principal] → listo
//   renovacion: renovar → listo
//
// Reglas que no se rompen:
//   - Nunca se registra antes de cobrar: la compra la crea el gestor de cuenta con el cobro hecho.
//   - Nunca se registra dos veces: un cobro, una compra (índice único) y el registrador mira la
//     subcuenta antes de registrar.
//   - Un paso que falla no deshace los anteriores. Sin registrar y sin vuelta (alguien lo registró
//     en el medio, o 24 h sin poder), la compra falla y el pago se devuelve (`devolucion`); ya
//     registrado, el dominio es de la banda: no se devuelve, se sigue intentando.
//   - Lo que no se resuelve solo queda a la vista del staff (/admin/dominios), nunca en silencio.
import { after } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { avisarAlTitular } from "@/nucleo/correo/deoco";
import { prisma } from "@/nucleo/db/cliente";
import { conTenant } from "@/nucleo/db/con-tenant";
import { ZONA } from "@/nucleo/fechas";
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
type Paso = "cliente" | "registrar" | "zona" | "nameservers" | "activacion" | "principal" | "renovar" | "listo";

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
/** Esperando el certificado para el principal más que esto, queda listo sin principal. */
const TOPE_PRINCIPAL = 24 * HORA;
/** Un paso tomado hace más que esto quedó colgado (el proceso murió mientras corría). */
const COLGADO = 5 * MIN;

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
    await tx.auditoria.create({ data: { usuarioId: datos.usuarioId ?? null, tenantId, accion: `dominio.${datos.tipo === "alta" ? "compra" : "renovacion"}_pagada`, detalle: { dominio: datos.dominio, cobroId: cobro.id } } });
    return { compraId: c.id, repetida: false };
  });
  if (!r.repetida) programar(tenantId);
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
  return terminadas;
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
    case "listo":
      return terminarBien(tenantId, c);
  }
}

async function terminarBien(tenantId: string, c: Compra): Promise<Resultado> {
  const vence = c.venceEn;
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
  const sinRegistrar = c.tipo === "alta" && (c.paso === "cliente" || c.paso === "registrar");
  console.error(`[compra] ${c.dominio} (${tenantId}) falló: ${motivo}: ${error}`);
  await conTenant(tenantId, (tx) => tx.auditoria.create({ data: { usuarioId: null, tenantId, accion: "dominio.compra_fallida", detalle: { dominio: c.dominio, motivo, error } } }));
  if (sinRegistrar) {
    await avisarAlTitular(tenantId, {
      clave: `dominio-compra-fallida:${c.id}`,
      asunto: () => `No pudimos registrar ${c.dominio}`,
      parrafos: () => [
        motivo === "no-disponible"
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
        `El registrador no aceptó ${err.campo ? `el dato "${err.campo}"` : "uno de los datos"} del titular de ${c.dominio}. Ya pagaste: corregilo y seguimos solos.`,
      ],
      boton: { texto: "Corregir en Dominios", ruta: "/dominios" },
    }).catch((x) => console.error(`[compra] aviso de datos de ${c.dominio}:`, x));
    return { tipo: "fin", datos: { estado: "datos", motivo: "datos-invalidos", campo: err.campo ?? null, error: err.message.slice(0, 500) } };
  }
  const primer = c.primerFalloEn ?? ahora;
  // Sin registrar, 24 h sin poder: se devuelve. (Con una operación aceptada, se mira antes la subcuenta.)
  if (c.tipo === "alta" && (c.paso === "cliente" || c.paso === "registrar") && ahora.getTime() - primer.getTime() >= TOPE_SIN_REGISTRAR) {
    const clienteId = await clienteDe(tenantId, c.registrador).catch(() => null);
    const registrado = clienteId ? await r.dominio(clienteId, c.dominio).catch(() => null) : null;
    if (!registrado) return fallar(tenantId, c, err.tipo, err.message);
  }
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
      data: { contacto: contacto as unknown as Prisma.InputJsonValue, estado: "en-curso", proximoIntento: new Date(), motivo: null, campo: null, error: null, operacion: undefined },
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
