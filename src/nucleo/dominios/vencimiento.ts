// Vencimiento de los dominios (docs/diseno-dominios.md §9, D11).
//
// Calendario: 45, 30, 15, 7, 3 y 1 día antes, un mail cada vez (cada uno más claro sobre qué se
// pierde) y, desde los 30 días, un aviso fijo en el panel. Comprado en Deoco: "renovalo por $Y"
// (Deoco nunca lo renueva sin que la banda pague). Delegado o .com.ar: "renovalo en tu
// registrador" (o en nic.ar), con la fecha que cargó la banda.
//
// Un comprado que vence sin renovar: el principal vuelve al subdominio, el remitente a Deoco, NADA
// se borra. Durante la gracia (30 días) se renueva al precio de siempre. Después, la recuperación
// del registrador tiene recargo (lo cotiza el staff a mano). Si el registrador lo libera, se pierde:
// se dan de baja la zona y las filas, y queda en la auditoría.
import { avisarAlTitular } from "@/nucleo/correo/deoco";
import { prisma } from "@/nucleo/db/cliente";
import { conTenant } from "@/nucleo/db/con-tenant";
import { formatearPesos } from "@/nucleo/dinero";
import { ZONA } from "@/nucleo/fechas";
import { registro as registroGlobal } from "@/nucleo/modulos";
import type { Registro } from "@/nucleo/modulos/registro";
import { quitarCorreo } from "./correo";
import { ErrorDominio, esDePlataforma, proveedorDns } from "./index";
import { GRACIA_DIAS, graciaHasta, RECUPERACION_DIAS } from "./plazos";
import { registrador } from "./registrador";

const DIA = 86_400_000;
/** Días antes del vencimiento en que se avisa. */
export const CALENDARIO = [45, 30, 15, 7, 3, 1] as const;
/** Desde cuántos días antes el aviso queda fijo en el panel. */
export const AVISO_EN_PANEL_DIAS = 30;

const fecha = (d: Date) => d.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: ZONA });
export const diasHasta = (d: Date, ahora: Date) => Math.ceil((d.getTime() - ahora.getTime()) / DIA);
/** El aviso del calendario que toca con `dias` por delante (el más chico que todavía no pasó), o null. */
export const avisoQueToca = (dias: number) => (dias <= 0 ? null : ([...CALENDARIO].reverse().find((c) => dias <= c) ?? null));

type Fila = Awaited<ReturnType<typeof prisma.dominio.findFirstOrThrow>>;

/** Lo que se pierde si vence, según el camino (para los mails más cercanos a la fecha). */
function loQueSePierde(d: Fila, banda: string) {
  return d.comprado
    ? `Si vence, el sitio de ${banda} deja de verse en ${d.dominio} (vuelve a tu subdominio de Deoco) y los mails desde @${d.dominio} dejan de salir desde ahí. No se borra nada.`
    : `Si vence, ${d.dominio} deja de funcionar: el sitio de ${banda} sigue en tu subdominio de Deoco, pero quien entre por ${d.dominio} no va a llegar, y los mails desde @${d.dominio} dejan de andar.`;
}

async function precioRenovacion(dominio: string, reg: Registro) {
  const tld = dominio.split(".").slice(1).join(".");
  return (await reg.gestor?.gestion.dominios?.precio(tld, 1).catch(() => null)) ?? null;
}

/** Barrido (cada hora): avisos del calendario, vencimientos y dominios perdidos, de todas las bandas. */
export async function revisarVencimientos(ahora = new Date(), reg: Registro = registroGlobal()): Promise<{ avisos: number; vencidos: number; perdidos: number }> {
  const hasta = new Date(ahora.getTime() + CALENDARIO[0] * DIA);
  const bandas = await prisma.$queryRaw<{ id: string }[]>`SELECT b AS id FROM bandas_con_vencimientos(${hasta}::timestamp) AS b`;
  const r = { avisos: 0, vencidos: 0, perdidos: 0 };
  for (const { id: tenantId } of bandas) {
    try {
      const filas = await conTenant(tenantId, (tx) =>
        tx.dominio.findMany({ where: { NOT: { dominio: { startsWith: "www." } }, OR: [{ venceEn: { lte: hasta } }, { vencidoEn: { not: null } }] } }),
      );
      for (const d of filas) {
        if (esDePlataforma(d.dominio) || !d.venceEn) continue;
        if (d.vencidoEn) {
          if (ahora.getTime() >= d.vencidoEn.getTime() + (GRACIA_DIAS + RECUPERACION_DIAS) * DIA && (await perder(tenantId, d))) r.perdidos++;
          continue;
        }
        const dias = diasHasta(d.venceEn, ahora);
        if (dias > 0) {
          if (await avisar(tenantId, d, dias, reg)) r.avisos++;
        } else if (d.comprado) {
          if (await vencer(tenantId, d, ahora, reg)) r.vencidos++;
        }
      }
    } catch (e) {
      console.error(`[vencimiento] ${tenantId}:`, e);
    }
  }
  return r;
}

/** El mail del calendario que toca (una vez por vencimiento y aviso: `unica`). */
async function avisar(tenantId: string, d: Fila, dias: number, reg: Registro): Promise<boolean> {
  const aviso = avisoQueToca(dias);
  if (!aviso || !d.venceEn) return false;
  // Una renovación ya paga y en curso: no se le pide que pague otra vez.
  const renovando = await conTenant(tenantId, (tx) => tx.dominioCompra.findFirst({ where: { dominio: d.dominio, tipo: "renovacion", estado: { in: ["en-curso", "datos"] } } }));
  if (renovando) return false;
  const precio = d.comprado ? await precioRenovacion(d.dominio, reg) : null;
  const cuando = dias === 1 ? "mañana" : `en ${dias} días`;
  const nicAr = /\.ar$/.test(d.dominio);
  await avisarAlTitular(tenantId, {
    clave: `dominio-vence:${d.dominio}:${d.venceEn.toISOString().slice(0, 10)}:${aviso}`,
    asunto: () => (aviso <= 7 ? `${d.dominio} vence ${cuando}` : `${d.dominio} vence el ${fecha(d.venceEn!)}`),
    parrafos: (banda) => [
      d.comprado
        ? `${d.dominio} vence el ${fecha(d.venceEn!)}. Renovalo desde Dominios${precio !== null ? ` por ${formatearPesos(precio)} (un año)` : ""}: Deoco nunca lo renueva sin que lo pagues.`
        : `${d.dominio} vence el ${fecha(d.venceEn!)} (la fecha que cargaste). Se renueva ${nicAr ? "en nic.ar" : "en tu registrador, donde lo compraste"}: Deoco no lo puede renovar por vos.`,
      ...(aviso <= 15 ? [loQueSePierde(d, banda)] : []),
      ...(aviso <= 3 && d.comprado ? [`Si se te pasa, tenés ${GRACIA_DIAS} días para renovarlo al mismo precio.`] : []),
    ],
    boton: { texto: d.comprado ? "Renovar" : "Ver Dominios", ruta: "/dominios" },
  });
  return true;
}

/** Un comprado que venció: vuelve al subdominio y el remitente a Deoco. No se borra nada. */
async function vencer(tenantId: string, d: Fila, ahora: Date, reg: Registro): Promise<boolean> {
  // Antes, lo que dice el registrador: si ya está renovado (una renovación que terminó tarde), no venció.
  const r = registrador();
  const cliente = r ? await conTenant(tenantId, (tx) => tx.registradorCliente.findFirst({ where: { registrador: r.nombre } })) : null;
  const real = r && cliente ? await r.dominio(cliente.clienteId, d.dominio).catch(() => null) : null;
  if (real && real.venceEn > ahora) {
    await conTenant(tenantId, (tx) => tx.dominio.update({ where: { id: d.id }, data: { venceEn: real.venceEn } }));
    return false;
  }
  const marcado = await conTenant(tenantId, async (tx) => {
    const { count } = await tx.dominio.updateMany({ where: { id: d.id, vencidoEn: null }, data: { vencidoEn: ahora, vencidoEraPrincipal: d.esPrincipal } });
    if (count === 0) return false;
    if (d.esPrincipal) {
      const sub = (await tx.dominio.findMany({ where: { verificado: true } })).find((x) => esDePlataforma(x.dominio));
      if (sub) {
        await tx.dominio.update({ where: { id: d.id }, data: { esPrincipal: false } });
        await tx.dominio.update({ where: { id: sub.id }, data: { esPrincipal: true } });
      }
    }
    await tx.auditoria.create({ data: { usuarioId: null, tenantId, accion: "dominio.vencido", detalle: { dominio: d.dominio, eraPrincipal: d.esPrincipal } } });
    return true;
  });
  if (!marcado) return false;
  const precio = await precioRenovacion(d.dominio, reg);
  await avisarAlTitular(tenantId, {
    clave: `dominio-vencido:${d.dominio}:${d.venceEn!.toISOString().slice(0, 10)}`,
    asunto: () => `${d.dominio} venció`,
    parrafos: (banda) => [
      `${d.dominio} venció sin renovarse. ${d.esPrincipal ? `El sitio de ${banda} volvió a tu subdominio de Deoco, ` : "El sitio sigue en tu subdominio de Deoco, "}y los mails salen desde Deoco. No se borró nada.`,
      `Todavía podés recuperarlo al mismo precio${precio !== null ? ` (${formatearPesos(precio)})` : ""} hasta el ${fecha(graciaHasta(ahora))}: renovalo desde Dominios y vuelve todo como estaba.`,
    ],
    boton: { texto: "Renovar", ruta: "/dominios" },
  });
  return true;
}

/**
 * Pasada la gracia y la recuperación: si el registrador lo liberó (ya no está en la subcuenta), se
 * perdió. Se dan de baja la zona, el correo y las filas. Si sigue en la subcuenta, se espera.
 */
async function perder(tenantId: string, d: Fila): Promise<boolean> {
  const r = registrador();
  if (!r) return false;
  const cliente = await conTenant(tenantId, (tx) => tx.registradorCliente.findFirst({ where: { registrador: r.nombre } }));
  if (cliente && (await r.dominio(cliente.clienteId, d.dominio))) return false;
  const p = proveedorDns();
  if (p && d.via === "zona" && d.proveedorId) await p.borrarZona(d.proveedorId).catch((e) => console.warn(`[vencimiento] no se pudo borrar la zona de ${d.dominio}:`, e));
  const correo = await conTenant(tenantId, (tx) => tx.correoDominio.findFirst({ where: { dominio: d.dominio } }));
  if (correo) await quitarCorreo(null, tenantId).catch((e) => console.warn(`[vencimiento] no se pudo quitar el correo de ${d.dominio}:`, e));
  await conTenant(tenantId, async (tx) => {
    await tx.dominio.deleteMany({ where: { dominio: { in: [d.dominio, `www.${d.dominio}`] }, esPrincipal: false } });
    await tx.auditoria.create({ data: { usuarioId: null, tenantId, accion: "dominio.perdido", detalle: { dominio: d.dominio, vencidoEn: d.vencidoEn?.toISOString() ?? null } } });
  });
  await avisarAlTitular(tenantId, {
    clave: `dominio-perdido:${d.dominio}`,
    asunto: () => `${d.dominio} ya no es tuyo`,
    parrafos: (banda) => [
      `${d.dominio} venció hace más de ${GRACIA_DIAS + RECUPERACION_DIAS} días y el registrador lo liberó: ya no está registrado a tu nombre. Lo sacamos de Deoco.`,
      `El sitio de ${banda} sigue en tu subdominio de Deoco. Si querés, podés buscar otro dominio en Dominios.`,
    ],
    boton: { texto: "Ir a Dominios", ruta: "/dominios" },
  });
  return true;
}

/** Los dominios de la banda que vencen en 30 días o ya vencieron (aviso fijo en el panel). */
export async function dominiosPorVencerEnPanel(tenantId: string, ahora = new Date()) {
  const filas = await conTenant(tenantId, (tx) =>
    tx.dominio.findMany({
      where: { NOT: { dominio: { startsWith: "www." } }, OR: [{ venceEn: { lte: new Date(ahora.getTime() + AVISO_EN_PANEL_DIAS * DIA) } }, { vencidoEn: { not: null } }] },
      select: { dominio: true, venceEn: true, vencidoEn: true, comprado: true },
    }),
  );
  return filas.filter((d) => d.venceEn && !esDePlataforma(d.dominio)).map((d) => ({ ...d, dias: diasHasta(d.venceEn!, ahora) }));
}

/** Delegado o .com.ar: la banda carga cuándo vence, para que le avisemos (null: no avisar). */
export async function fijarVencimiento(usuarioId: string, tenantId: string, dominioId: string, venceEn: Date | null): Promise<void> {
  const d = await conTenant(tenantId, (tx) => tx.dominio.findUnique({ where: { id: dominioId } }));
  if (!d || esDePlataforma(d.dominio)) throw new ErrorDominio("Ese dominio no existe en la banda.");
  if (d.comprado) throw new ErrorDominio("El vencimiento de un dominio comprado en Deoco lo informa el registrador.");
  if (venceEn && (venceEn.getTime() < Date.now() - DIA || venceEn.getTime() > Date.now() + 10 * 366 * DIA)) {
    throw new ErrorDominio("Esa fecha no parece un vencimiento (tiene que ser en los próximos 10 años).");
  }
  await conTenant(tenantId, async (tx) => {
    await tx.dominio.update({ where: { id: d.id }, data: { venceEn } });
    await tx.auditoria.create({ data: { usuarioId, tenantId, accion: "dominio.vencimiento_cargado", detalle: { dominio: d.dominio, venceEn: venceEn?.toISOString() ?? null } } });
  });
}
