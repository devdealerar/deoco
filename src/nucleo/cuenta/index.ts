// Cuenta de cada banda: su estado, sus módulos prendidos y sus límites. Lo decide UN módulo,
// el gestor de cuenta (`gestionaCuenta` en su contrato), p. ej. según el plan y los pagos de la
// banda. El núcleo no sabe de planes ni de precios: guarda estados, módulos y números, y valida
// que quien los cambia sea el gestor.
//
// El gestor sube la banda por la escalera de la cuota (hasta ARCHIVADO) y la devuelve a ACTIVO con
// el pago. Una banda ARCHIVADA ya no la toca: desarchivar es del staff.
// Los errores van primero y en su propio archivo: los módulos los usan al cargarse
// (accionesDelPanel) y este archivo importa el registro, que importa los módulos.
import { ErrorCuenta, ErrorLimite } from "./errores";
import type { EstadoTenant, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/nucleo/db/cliente";
import { conTenant, type TxTenant } from "@/nucleo/db/con-tenant";
import { registro as registroGlobal } from "@/nucleo/modulos";
import type { Modulo } from "@/nucleo/modulos/contrato";
import { modulosPrendidos } from "@/nucleo/modulos/encendido";
import type { Registro } from "@/nucleo/modulos/registro";


export { ErrorCuenta, ErrorLimite };

export type EstadoAutomatico = EstadoTenant;

function exigirGestor(modulo: Modulo, reg: Registro) {
  if (reg.modulo(modulo.id) !== modulo || reg.gestor?.moduloId !== modulo.id) {
    throw new ErrorCuenta(`"${modulo.id}" no es el gestor de cuenta.`);
  }
}

/** Fila de auditoría de un cambio que hizo la plataforma sola (sin persona): `detalle.por`. */
async function auditar(tx: TxTenant, tenantId: string, por: string, accion: string, detalle: Record<string, Prisma.InputJsonValue | null>) {
  await tx.auditoria.createMany({ data: [{ usuarioId: null, tenantId, accion, detalle: { ...detalle, por } }] });
}

/**
 * Cambia el estado de la banda (cualquiera de la escalera, ARCHIVADO incluido). Una banda ya
 * ARCHIVADA no se toca, salvo `volver` (la banda volvió y pagó desde Plan y pago); si no, la
 * desarchiva el staff. Devuelve si cambió algo. Queda en la auditoría con el motivo.
 */
export async function fijarEstado(
  modulo: Modulo,
  tenantId: string,
  estado: EstadoAutomatico,
  motivo: string,
  reg: Registro = registroGlobal(),
  opciones: { volver?: boolean } = {},
): Promise<boolean> {
  exigirGestor(modulo, reg);
  return conTenant(tenantId, async (tx) => {
    const [actual] = await tx.$queryRaw<{ estado: EstadoTenant }[]>`SELECT estado FROM "tenant" WHERE id = ${tenantId}::uuid FOR UPDATE`;
    if (!actual || actual.estado === estado || (actual.estado === "ARCHIVADO" && !(opciones.volver && estado === "ACTIVO"))) return false;
    await tx.tenant.update({ where: { id: tenantId }, data: { estado } });
    await auditar(tx, tenantId, modulo.id, "banda.estado_cambiado", { de: actual.estado, a: estado, motivo });
    return true;
  });
}

/** Lo que un módulo tiene abierto en la banda (`enCurso`). Si la consulta falla, se asume que hay algo: nunca se apaga a ciegas. */
export async function abiertoEn(moduloId: string, tenantId: string, reg: Registro = registroGlobal()): Promise<string[]> {
  const m = reg.modulo(moduloId);
  if (!m) return [];
  try {
    // Pagos que la banda todavía tiene que devolver: su pantalla del módulo los muestra.
    const devolver = m.cobros ? await conTenant(tenantId, (tx) => tx.cobroDuplicado.count({ where: { moduloId, devueltoEn: null } })) : 0;
    const propio = m.enCurso ? await m.enCurso(tenantId) : [];
    return [...propio, ...(devolver ? [`${devolver} ${devolver === 1 ? "pago para devolver" : "pagos para devolver"}`] : [])];
  } catch (e) {
    console.error(`[cuenta] enCurso(${moduloId}):`, e);
    return ["no se pudo revisar lo que tiene abierto"];
  }
}

export type ModuloRetenido = { moduloId: string; abierto: string[] };

/**
 * Deja prendidos exactamente `deseados` (más el gestor, que nunca se apaga a sí mismo). Lo que
 * se apaga conserva sus datos. Falla si la lista no cierra con las dependencias.
 *
 * Un cambio de plan NUNCA corta una operación en curso (3.2, núcleo d5): un módulo que habría
 * que apagar pero tiene algo abierto (`enCurso`) queda prendido como excedente (`retenidos`,
 * `moduloTenant.excedenteDesde`), con lo que necesita. El gestor vuelve a llamar cuando quiera
 * (el barrido): se apaga recién cuando no queda nada abierto. Un módulo que vuelve a estar en
 * `deseados` deja de ser excedente.
 */
export async function fijarModulos(
  modulo: Modulo,
  tenantId: string,
  deseados: readonly string[],
  reg: Registro = registroGlobal(),
  ahora = new Date(),
): Promise<{ prendidos: string[]; apagados: string[]; retenidos: ModuloRetenido[] }> {
  exigirGestor(modulo, reg);
  const desconocidos = deseados.filter((id) => !reg.modulo(id));
  if (desconocidos.length) throw new ErrorCuenta(`No existen los módulos ${desconocidos.join(", ")}.`);
  const objetivo = new Set([...deseados, modulo.id]);
  for (const id of objetivo) {
    const faltan = (reg.modulo(id)!.dependencias ?? []).filter((d) => !objetivo.has(d));
    if (faltan.length) throw new ErrorCuenta(`"${id}" necesita ${faltan.join(", ")}, que no está en la lista.`);
  }
  const filas = await conTenant(tenantId, (tx) => tx.moduloTenant.findMany({ select: { moduloId: true, excedenteDesde: true } }));
  // Solo se apagan módulos que existen: una fila de un módulo que no está en el build no se toca.
  const aApagar = filas.filter((f) => !objetivo.has(f.moduloId) && reg.modulo(f.moduloId)).map((f) => f.moduloId);
  // Lo que tiene algo abierto se queda (y lo que depende de un retenido, también: no se rompe la cadena).
  const retenidos: ModuloRetenido[] = [];
  for (const id of aApagar) {
    const abierto = await abiertoEn(id, tenantId, reg);
    if (abierto.length) retenidos.push({ moduloId: id, abierto });
  }
  const quedan = new Set([...objetivo, ...retenidos.map((r) => r.moduloId)]);
  for (const r of [...retenidos]) {
    for (const d of reg.modulo(r.moduloId)!.dependencias ?? []) {
      if (!quedan.has(d) && aApagar.includes(d)) {
        retenidos.push({ moduloId: d, abierto: [`lo necesita ${r.moduloId}, que tiene operaciones abiertas`] });
        quedan.add(d);
      }
    }
  }

  return conTenant(tenantId, async (tx) => {
    const actuales = new Map((await tx.moduloTenant.findMany({ select: { moduloId: true, excedenteDesde: true } })).map((f) => [f.moduloId, f.excedenteDesde]));
    const prendidos = [...objetivo].filter((id) => !actuales.has(id)).sort();
    const apagados = [...actuales.keys()].filter((id) => !quedan.has(id) && reg.modulo(id)).sort();
    const retenidoIds = new Set(retenidos.map((r) => r.moduloId));
    const nuevosRetenidos = retenidos.filter((r) => actuales.has(r.moduloId) && !actuales.get(r.moduloId));
    const dejanDeSerExcedente = [...actuales.entries()].filter(([id, desde]) => desde && objetivo.has(id)).map(([id]) => id);
    if (apagados.length) await tx.moduloTenant.deleteMany({ where: { moduloId: { in: apagados } } });
    if (prendidos.length) await tx.moduloTenant.createMany({ data: prendidos.map((moduloId) => ({ tenantId, moduloId })), skipDuplicates: true });
    for (const r of retenidos) {
      if (!actuales.has(r.moduloId)) continue;
      await tx.moduloTenant.updateMany({
        where: { moduloId: r.moduloId },
        data: { excedenteMotivo: r.abierto.join("; "), ...(actuales.get(r.moduloId) ? {} : { excedenteDesde: ahora }) },
      });
    }
    if (dejanDeSerExcedente.length) {
      await tx.moduloTenant.updateMany({ where: { moduloId: { in: dejanDeSerExcedente } }, data: { excedenteDesde: null, excedenteMotivo: null } });
    }
    if (prendidos.length || apagados.length || nuevosRetenidos.length || dejanDeSerExcedente.length) {
      await auditar(tx, tenantId, modulo.id, "banda.modulos_cambiados", {
        prendidos,
        apagados,
        excedente: nuevosRetenidos.map((r) => ({ modulo: r.moduloId, abierto: r.abierto })),
        ...(dejanDeSerExcedente.length ? { yaNoExcedente: dejanDeSerExcedente } : {}),
      });
    }
    return { prendidos, apagados, retenidos: retenidos.filter((r) => retenidoIds.has(r.moduloId) && actuales.has(r.moduloId)) };
  });
}

/** Módulos de la banda que siguen prendidos como excedente: desde cuándo y por qué. */
export async function excedentesDe(tenantId: string) {
  return conTenant(tenantId, (tx) =>
    tx.moduloTenant.findMany({ where: { excedenteDesde: { not: null } }, select: { moduloId: true, excedenteDesde: true, excedenteMotivo: true }, orderBy: { moduloId: "asc" } }),
  ) as Promise<{ moduloId: string; excedenteDesde: Date; excedenteMotivo: string | null }[]>;
}

/** Ids de las bandas con algún módulo en excedente (para que el gestor las revise). */
export async function bandasConExcedente(): Promise<string[]> {
  const filas = await prisma.$queryRaw<{ id: string }[]>`SELECT bandas_con_excedente() AS id`;
  return filas.map((f) => f.id);
}

export type Limites = {
  /** Bytes para archivos. null: el de la plataforma (DEOCO_LIMITE_ALMACENAMIENTO). Ausente: no cambia. */
  almacenamiento?: bigint | null;
  /** `<modulo>.<clave>` → tope (null: sin tope). Los que no se nombran no cambian. */
  topes?: Record<string, number | null>;
};

/**
 * Fija los límites de la banda. Si un tope baja (o aparece), el módulo dueño saca de
 * circulación lo que sobra (`ajustar`, en orden inverso, sin borrar). Devuelve cuánto sacó cada uno.
 */
export async function fijarLimites(
  modulo: Modulo,
  tenantId: string,
  limites: Limites,
  reg: Registro = registroGlobal(),
): Promise<Record<string, number>> {
  exigirGestor(modulo, reg);
  const topes = limites.topes ?? {};
  for (const [id, valor] of Object.entries(topes)) {
    if (!reg.limites.some((l) => l.id === id)) throw new ErrorCuenta(`No existe el límite "${id}".`);
    if (valor !== null && (!Number.isInteger(valor) || valor < 0)) throw new ErrorCuenta(`Tope inválido para "${id}": ${valor}.`);
  }
  if (limites.almacenamiento != null && limites.almacenamiento < BigInt(0)) throw new ErrorCuenta("Almacenamiento negativo.");

  const bajaron = await conTenant(tenantId, async (tx) => {
    const antes = new Map((await tx.limiteBanda.findMany()).map((f) => [f.limite, f.maximo]));
    const bajaron: { id: string; maximo: number }[] = [];
    for (const [id, valor] of Object.entries(topes)) {
      const anterior = antes.get(id) ?? null;
      if (valor === anterior) continue;
      if (valor === null) await tx.limiteBanda.deleteMany({ where: { limite: id } });
      else {
        await tx.limiteBanda.upsert({ where: { tenantId_limite: { tenantId, limite: id } }, create: { tenantId, limite: id, maximo: valor }, update: { maximo: valor } });
        if (anterior === null || valor < anterior) bajaron.push({ id, maximo: valor });
      }
    }
    if (limites.almacenamiento !== undefined) {
      await tx.tenant.update({ where: { id: tenantId }, data: { limiteAlmacenamiento: limites.almacenamiento } });
    }
    await auditar(tx, tenantId, modulo.id, "banda.limites_cambiados", {
      topes,
      almacenamiento: limites.almacenamiento === undefined ? "sin cambio" : (limites.almacenamiento?.toString() ?? null),
    });
    return bajaron;
  });

  // Después de guardar: cada módulo ajusta lo suyo (lo que sobra se despublica; nada se borra).
  const sacados: Record<string, number> = {};
  for (const { id, maximo } of bajaron) {
    const l = reg.limites.find((x) => x.id === id)!;
    sacados[id] = await l.definicion.ajustar(tenantId, maximo);
  }
  return sacados;
}

function limitePropio(modulo: Modulo, clave: string, reg: Registro) {
  const id = `${modulo.id}.${clave}`;
  const l = reg.limites.find((x) => x.id === id);
  if (!l || reg.modulo(modulo.id) !== modulo) throw new ErrorCuenta(`"${modulo.id}" no declara el límite "${clave}".`);
  return l;
}

/** Tope del límite propio del módulo para la banda; null si no tiene. */
export async function limiteDe(modulo: Modulo, tenantId: string, clave: string, reg: Registro = registroGlobal()): Promise<number | null> {
  const { id } = limitePropio(modulo, clave, reg);
  const fila = await conTenant(tenantId, (tx) => tx.limiteBanda.findUnique({ where: { tenantId_limite: { tenantId, limite: id } } }));
  return fila?.maximo ?? null;
}

/** El mensaje para quien llegó al tope: cuánto permite y, si el gestor sabe, cómo tener más. */
export async function mensajeDeLimite(id: string, tenantId: string, maximo: number, necesarios: number, reg: Registro = registroGlobal()) {
  const l = reg.limites.find((x) => x.id === id);
  const etiqueta = l?.definicion.etiqueta ?? id;
  // Lo ya publicado no cambia: solo no se puede sumar más.
  const base = `Tu plan permite hasta ${maximo} ${etiqueta} y ya llegaste. Lo que ya está publicado sigue igual.`;
  const como = await reg.gestor?.gestion.comoAmpliar(tenantId, id, necesarios).catch((e) => {
    console.error(`[cuenta] comoAmpliar(${id}): ${e instanceof Error ? e.message : e}`);
    return null;
  });
  return como ? `${base} ${como}` : base;
}

/**
 * En la transacción del módulo, ANTES de crear o publicar algo que cuenta: bloquea el límite de
 * la banda (dos pedidos a la vez no pasan juntos el tope) y verifica que `usadosDespues()` (lo
 * que habría con el cambio, contado en la misma transacción) no pase el tope. Si pasa, tira
 * ErrorLimite con el mensaje para mostrar.
 */
export async function exigirLimite(
  tx: TxTenant,
  modulo: Modulo,
  tenantId: string,
  clave: string,
  usadosDespues: () => Promise<number>,
  reg: Registro = registroGlobal(),
): Promise<void> {
  const { id } = limitePropio(modulo, clave, reg);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:${id}`}))`;
  const fila = await tx.limiteBanda.findUnique({ where: { tenantId_limite: { tenantId, limite: id } } });
  if (!fila) return;
  const usados = await usadosDespues();
  if (usados > fila.maximo) throw new ErrorLimite(await mensajeDeLimite(id, tenantId, fila.maximo, usados, reg), id, fila.maximo);
}

export type UsoDeLimite = { id: string; etiqueta: string; usados: number; maximo: number | null };

/** Cuánto usa la banda de cada límite de sus módulos prendidos (para mostrarle su cuenta). */
export async function usoDeLimites(tenantId: string, reg: Registro = registroGlobal()): Promise<UsoDeLimite[]> {
  const prendidos = await modulosPrendidos(tenantId, reg);
  const topes = new Map((await conTenant(tenantId, (tx) => tx.limiteBanda.findMany())).map((f) => [f.limite, f.maximo]));
  const deEllos = reg.limites.filter((l) => prendidos.has(l.moduloId));
  return Promise.all(
    deEllos.map(async (l) => ({ id: l.id, etiqueta: l.definicion.etiqueta, usados: await l.definicion.usados(tenantId), maximo: topes.get(l.id) ?? null })),
  );
}

/**
 * Una banda nueva (alta del staff o autogestión): prende el gestor de cuenta y le avisa (p. ej.
 * para arrancar el período de prueba). Sin gestor, no hace nada.
 */
export async function bandaCreada(
  tenantId: string,
  origen: "staff" | "autogestion",
  opcion?: string,
  reg: Registro = registroGlobal(),
): Promise<{ redireccion?: string }> {
  if (!reg.gestor) return {};
  const { moduloId, gestion } = reg.gestor;
  await conTenant(tenantId, (tx) => tx.moduloTenant.createMany({ data: [{ tenantId, moduloId }], skipDuplicates: true }));
  return (await gestion.alCrearBanda(tenantId, origen, opcion)) ?? {};
}

/** Lo que se ofrece al crear una banda sola (p. ej. "Probar gratis" o un plan). Vacío: nada que elegir. */
export async function opcionesDeAlta(reg: Registro = registroGlobal()) {
  return (await reg.gestor?.gestion.opcionesDeAlta?.()) ?? [];
}

/**
 * Lo que el gestor necesita saber del build para armar planes: qué módulos hay (id y nombre) y
 * qué límites declaran. Solo nombres, nunca contratos (un módulo no importa el registro).
 */
export type CatalogoDeCuenta = {
  modulos: { id: string; nombre: string; esGestor: boolean }[];
  limites: { id: string; moduloId: string; etiqueta: string }[];
};
export function catalogoDeCuenta(reg: Registro = registroGlobal()): CatalogoDeCuenta {
  return {
    modulos: reg.modulos.map((m) => ({ id: m.id, nombre: m.nombre, esGestor: reg.gestor?.moduloId === m.id })),
    limites: reg.limites.map((l) => ({ id: l.id, moduloId: l.moduloId, etiqueta: l.definicion.etiqueta })),
  };
}
