// La base de fans de la banda: quién está, cómo entró y si recibe el newsletter. Doble
// confirmación (el pedido queda "pendiente" hasta que abre el link del mail), baja en un clic y
// la prueba del consentimiento (cuándo, qué texto vio, desde dónde). Documento maestro
// "Newsletter"; docs/privacidad.md §9 (art. 27 de la Ley 25.326 y Disp. 4/2009).
import { conTenant, type TxTenant } from "@/nucleo/db/con-tenant";
import { enviarCorreo, escaparHtml as h } from "@/nucleo/correo";
import { esEmail } from "@/nucleo/correo/direccion";
import { estaSuprimido } from "@/nucleo/legal/derechos";
import { origenDeBanda } from "@/nucleo/publico/origen";
import { contextoDeToken, hashDeToken, nuevoTokenDeAcceso, tokenParaEnlace } from "@/nucleo/publico/token";
import { mesArgentino } from "@/nucleo/fechas";
import fans from "./index";

export class ErrorFans extends Error {}

/** Lo que ve quien se suscribe (y queda guardado como prueba del consentimiento). */
export const textoConsentimiento = (banda: string) =>
  `Quiero recibir por mail las novedades de ${banda} (shows, lanzamientos, merch). Me puedo dar de baja cuando quiera, con un clic, desde cualquier mail.`;

/** El link de confirmación vence a los 7 días; pedirlo de nuevo manda uno nuevo y el viejo deja de servir. */
const VENCE_CONFIRMAR_MS = 7 * 86_400_000;

const normalizar = (email: string) => email.trim().toLowerCase();

const ctxConfirmar = (tenantId: string, id: string) => contextoDeToken(tenantId, "fans", `confirmar:${id}`);
const ctxBaja = (tenantId: string, id: string) => contextoDeToken(tenantId, "fans", `baja:${id}`);

/** El link de baja del contacto (lo crea si no tiene). Solo sirve para darse de baja. */
export async function tokenDeBaja(tx: TxTenant, tenantId: string, contactoId: string): Promise<string> {
  const c = await tx.fansContacto.findUniqueOrThrow({ where: { tenantId_id: { tenantId, id: contactoId } }, select: { bajaCifrado: true } });
  const existente = tokenParaEnlace(c.bajaCifrado, ctxBaja(tenantId, contactoId));
  if (existente) return existente;
  const t = nuevoTokenDeAcceso(ctxBaja(tenantId, contactoId));
  await tx.fansContacto.update({ where: { tenantId_id: { tenantId, id: contactoId } }, data: { bajaHash: t.hash, bajaCifrado: t.cifrado } });
  return t.token;
}

/**
 * Alguien pide recibir el newsletter (formulario del sitio o casilla de la compra). Queda
 * pendiente y le llega el mail para confirmar. Si ya está confirmado, no pasa nada (y no se le
 * dice a quien pidió: no se revela quién está en la base). Si pidió la supresión de sus datos, no
 * se lo vuelve a sumar.
 */
export async function pedirSuscripcion(
  tenantId: string,
  datos: { email: string; nombre?: string; origen: "formulario" | "tienda" | "ticketera" },
): Promise<void> {
  const email = normalizar(datos.email);
  if (!esEmail(email)) throw new ErrorFans("Revisá el mail.");
  if (await estaSuprimido(tenantId, email)) return;
  await conTenant(tenantId, async (tx) => {
    const banda = (await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nombre: true } })).nombre;
    const previo = await tx.fansContacto.findUnique({ where: { tenantId_email: { tenantId, email } } });
    if (previo?.newsletter === "confirmado") return;
    const ahora = new Date();
    // Freno: el formulario no sirve para llenarle la casilla de mails a nadie (uno cada 10 minutos).
    if (previo?.newsletter === "pendiente" && previo.pedidoEn && ahora.getTime() - previo.pedidoEn.getTime() < 10 * 60_000) return;
    const consentimiento = {
      newsletter: "pendiente",
      pedidoEn: ahora,
      consentimiento: textoConsentimiento(banda),
      consentimientoOrigen: datos.origen === "formulario" ? "formulario del sitio" : `casilla en la compra (${datos.origen})`,
      bajaEn: null,
    };
    const c = previo
      ? await tx.fansContacto.update({
          where: { id: previo.id },
          data: { ...consentimiento, ...(datos.nombre?.trim() && !previo.nombre ? { nombre: datos.nombre.trim().slice(0, 120) } : {}) },
        })
      : await tx.fansContacto.create({
          data: { tenantId, email, nombre: datos.nombre?.trim().slice(0, 120) ?? "", origen: datos.origen, ...consentimiento },
        });
    const t = nuevoTokenDeAcceso(ctxConfirmar(tenantId, c.id));
    await tx.fansContacto.update({
      where: { id: c.id },
      data: { confirmarHash: t.hash, confirmarCifrado: t.cifrado, confirmarVence: new Date(ahora.getTime() + VENCE_CONFIRMAR_MS) },
    });
    const sitio = await origenDeBanda(tenantId, { tx });
    if (!sitio) return; // sin sitio no hay dónde confirmar: queda pendiente
    const url = `${sitio}/novedades/confirmar#${t.token}`;
    await enviarCorreo(
      fans,
      tenantId,
      {
        para: email,
        asunto: `Confirmá que querés recibir las novedades de ${banda}`,
        html: `<p>Hola${c.nombre ? ` ${h(c.nombre)}` : ""}:</p>
<p>Pediste recibir por mail las novedades de <strong>${h(banda)}</strong>. Para confirmarlo, abrí este link (vence en 7 días):</p>
<p><a href="${h(url)}">Sí, quiero recibirlas</a></p>
<p>Si no fuiste vos, ignorá este mail: sin confirmar no te llega nada.</p>`,
        texto: `Hola${c.nombre ? ` ${c.nombre}` : ""}:\n\nPediste recibir por mail las novedades de ${banda}. Para confirmarlo, abrí este link (vence en 7 días):\n${url}\n\nSi no fuiste vos, ignorá este mail: sin confirmar no te llega nada.`,
      },
      { tx },
    );
  });
}

/** El fan abre el link del mail: queda confirmado. Devuelve false si el link no sirve o venció. */
export async function confirmarSuscripcion(tenantId: string, token: string, ahora = new Date()): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(token)) return false;
  return conTenant(tenantId, async (tx) => {
    const c = await tx.fansContacto.findFirst({ where: { confirmarHash: hashDeToken(token) } });
    if (!c || !c.confirmarVence || c.confirmarVence < ahora) return false;
    await tx.fansContacto.update({
      where: { id: c.id },
      data: { newsletter: "confirmado", confirmadoEn: ahora, confirmarHash: null, confirmarCifrado: null, confirmarVence: null, bajaEn: null },
    });
    return true;
  });
}

/**
 * Baja en un clic: con el token del link de baja. Si vino de un envío, queda contada en ese
 * envío (estadística). Idempotente. Devuelve false si el token no es de nadie.
 */
export async function darDeBaja(tenantId: string, token: string, entregaId?: string, ahora = new Date()): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(token)) return false;
  return conTenant(tenantId, async (tx) => {
    const c = await tx.fansContacto.findFirst({ where: { bajaHash: hashDeToken(token) } });
    if (!c) return false;
    if (c.newsletter !== "baja") {
      await tx.fansContacto.update({ where: { id: c.id }, data: { newsletter: "baja", bajaEn: ahora, confirmarHash: null, confirmarCifrado: null, confirmarVence: null } });
    }
    if (entregaId && /^[0-9a-f-]{36}$/.test(entregaId)) {
      await tx.fansEntrega.updateMany({ where: { id: entregaId, contactoId: c.id, bajaEn: null }, data: { bajaEn: ahora } });
    }
    // Lo que todavía no le salió de un envío en curso, ya no sale.
    await tx.fansEntrega.updateMany({ where: { contactoId: c.id, estado: "PENDIENTE" }, data: { estado: "SALTEADA" } });
    return true;
  });
}

/** La banda da de baja a alguien desde el panel (porque se lo pidió por otro medio). */
export async function bajaDesdeElPanel(tenantId: string, contactoId: string, usuarioId: string): Promise<void> {
  await conTenant(tenantId, async (tx) => {
    const c = await tx.fansContacto.findUnique({ where: { tenantId_id: { tenantId, id: contactoId } } });
    if (!c) throw new ErrorFans("Ese contacto no está en la base.");
    await tx.fansContacto.update({ where: { id: c.id }, data: { newsletter: "baja", bajaEn: new Date(), confirmarHash: null, confirmarCifrado: null, confirmarVence: null } });
    await tx.fansEntrega.updateMany({ where: { contactoId: c.id, estado: "PENDIENTE" }, data: { estado: "SALTEADA" } });
    await tx.auditoria.create({ data: { usuarioId, tenantId, accion: "fans.baja_desde_panel", detalle: { contactoId: c.id } } });
  });
}

export type Comprador = { clave: string; email: string; nombre: string; ciudad: string; provincia: string; novedades: boolean; fecha: string };

/** Una compra pagada (tienda o entradas) suma al comprador a la base. Idempotente por `clave`. */
export async function sumarComprador(tenantId: string, origen: "tienda" | "ticketera", comprador: Comprador): Promise<void> {
  const email = normalizar(comprador.email);
  if (!esEmail(email) || (await estaSuprimido(tenantId, email))) return;
  const fecha = new Date(comprador.fecha);
  await conTenant(tenantId, async (tx) => {
    const ya = await tx.fansCompra.findUnique({ where: { tenantId_clave: { tenantId, clave: comprador.clave } } });
    if (ya) return;
    const previo = await tx.fansContacto.findUnique({ where: { tenantId_email: { tenantId, email } } });
    const c = previo
      ? await tx.fansContacto.update({
          where: { id: previo.id },
          data: {
            compras: { increment: 1 },
            primeraCompraEn: previo.primeraCompraEn && previo.primeraCompraEn < fecha ? previo.primeraCompraEn : fecha,
            ultimaCompraEn: previo.ultimaCompraEn && previo.ultimaCompraEn > fecha ? previo.ultimaCompraEn : fecha,
            ...(!previo.nombre && comprador.nombre ? { nombre: comprador.nombre.slice(0, 120) } : {}),
            ...(comprador.ciudad ? { ciudad: comprador.ciudad.slice(0, 120) } : {}),
            ...(comprador.provincia ? { provincia: comprador.provincia.slice(0, 120) } : {}),
          },
        })
      : await tx.fansContacto.create({
          data: {
            tenantId,
            email,
            nombre: comprador.nombre.slice(0, 120),
            ciudad: comprador.ciudad.slice(0, 120),
            provincia: comprador.provincia.slice(0, 120),
            origen,
            compras: 1,
            primeraCompraEn: fecha,
            ultimaCompraEn: fecha,
          },
        });
    await tx.fansCompra.create({ data: { tenantId, clave: comprador.clave, contactoId: c.id } });
  });
  // Tildó "quiero recibir novedades" en la compra: igual confirma por mail (doble confirmación).
  if (comprador.novedades) await pedirSuscripcion(tenantId, { email, nombre: comprador.nombre, origen });
}

// ── Listado, métricas y exportación ───────────────────────────────────────────────────────────

export const ESTADOS_NEWSLETTER: Record<string, string> = { no: "No", pendiente: "Sin confirmar", confirmado: "Suscripto", baja: "Se dio de baja" };
export const ORIGENES: Record<string, string> = { formulario: "Formulario del sitio", tienda: "Tienda", ticketera: "Entradas" };

export type FiltroContactos = { buscar?: string; newsletter?: string; pagina?: number };
export const POR_PAGINA = 50;

export async function listarContactos(tenantId: string, f: FiltroContactos) {
  const buscar = f.buscar?.trim().toLowerCase();
  const where = {
    ...(buscar ? { OR: [{ email: { contains: buscar } }, { nombre: { contains: buscar, mode: "insensitive" as const } }] } : {}),
    ...(f.newsletter && ESTADOS_NEWSLETTER[f.newsletter] ? { newsletter: f.newsletter } : {}),
  };
  const pagina = Math.max(1, f.pagina ?? 1);
  return conTenant(tenantId, async (tx) => {
    const [total, filas] = await Promise.all([
      tx.fansContacto.count({ where }),
      tx.fansContacto.findMany({ where, orderBy: { creadoEn: "desc" }, skip: (pagina - 1) * POR_PAGINA, take: POR_PAGINA }),
    ]);
    return { total, filas, pagina };
  });
}

/** Lo que la banda ve de su base (documento maestro §métricas): crecimiento, geografía, repetición. */
export async function metricas(tenantId: string, ahora = new Date()) {
  return conTenant(tenantId, async (tx) => {
    const [total, suscriptos, pendientes, conCompra, repiten, provincias] = await Promise.all([
      tx.fansContacto.count(),
      tx.fansContacto.count({ where: { newsletter: "confirmado" } }),
      tx.fansContacto.count({ where: { newsletter: "pendiente" } }),
      tx.fansContacto.count({ where: { compras: { gt: 0 } } }),
      tx.fansContacto.count({ where: { compras: { gt: 1 } } }),
      tx.fansContacto.groupBy({ by: ["provincia"], where: { provincia: { not: "" } }, _count: { _all: true }, orderBy: { _count: { provincia: "desc" } }, take: 6 }),
    ]);
    // Suscriptos nuevos por mes, los últimos 6 (hora argentina).
    const meses: { mes: string; nuevos: number }[] = [];
    let m = mesArgentino(ahora);
    for (let i = 0; i < 6; i++) {
      const nuevos = await tx.fansContacto.count({ where: { confirmadoEn: { gte: m.desde, lt: m.hasta } } });
      meses.unshift({ mes: m.clave, nuevos });
      m = mesArgentino(new Date(m.desde.getTime() - 86_400_000));
    }
    return {
      total,
      suscriptos,
      pendientes,
      conCompra,
      repiten,
      provincias: provincias.map((p) => ({ provincia: p.provincia, cantidad: p._count._all })),
      meses,
    };
  });
}

const celda = (v: unknown) => {
  const t = v instanceof Date ? v.toISOString() : v === null || v === undefined ? "" : String(v);
  return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** La base en CSV (para llevársela a otra herramienta). Con la prueba del consentimiento. */
export async function contactosEnCsv(tenantId: string): Promise<string> {
  const filas = await conTenant(tenantId, (tx) => tx.fansContacto.findMany({ orderBy: { creadoEn: "asc" } }));
  const columnas = ["email", "nombre", "ciudad", "provincia", "origen", "compras", "primeraCompraEn", "ultimaCompraEn", "newsletter", "pedidoEn", "confirmadoEn", "bajaEn", "consentimiento", "consentimientoOrigen", "creadoEn"] as const;
  return "﻿" + [columnas.join(","), ...filas.map((f) => columnas.map((c) => celda(f[c])).join(","))].join("\n") + "\n";
}
