// Área del fan (D5; documento maestro "Mis compras"): sin cuenta ni contraseña. El fan pone su
// email en /mis-compras, le llega un link de un solo uso (vence a los 30 minutos; pedir otro deja
// sin efecto el anterior: 3.2 público d1) y al abrirlo el navegador queda con una sesión de ese
// sitio por 30 días. Los módulos muestran lo suyo (`areaDelFan` del contrato) y abren sus páginas
// privadas a esa sesión si el email coincide. En la base, nunca los tokens: sus hashes.
import { cookies } from "next/headers";
import { conTenant } from "@/nucleo/db/con-tenant";
import { enviarCorreoDelNucleo, escaparHtml as h } from "@/nucleo/correo";
import { esEmail } from "@/nucleo/correo/direccion";
import { registro } from "@/nucleo/modulos";
import { modulosPrendidos } from "@/nucleo/modulos/encendido";
import { hashDeToken } from "./token";
import { randomBytes } from "node:crypto";

export const LINK_FAN_MINUTOS = 30;
export const SESION_FAN_DIAS = 30;
/** Un link por email cada tantos segundos (el formulario no sirve para llenarle la casilla a nadie). */
const ESPERA_ENTRE_LINKS_MS = 2 * 60_000;

const COOKIE = "deoco_fan";
const nuevoToken = () => randomBytes(32).toString("hex");

/** Los módulos prendidos de la banda que muestran algo en el área del fan, en orden. */
export async function seccionesDelFan(tenantId: string) {
  const prendidos = await modulosPrendidos(tenantId);
  return registro()
    .modulos.filter((m) => m.areaDelFan && prendidos.has(m.id))
    .map((m) => ({ moduloId: m.id, ...m.areaDelFan! }))
    .sort((a, b) => a.orden - b.orden);
}

/**
 * El fan pide su link. Solo sale si tiene algo en esta banda (y no se le dice a quien pidió si lo
 * tiene: la respuesta es la misma). Devuelve si salió (para las pruebas).
 */
export async function pedirLinkDelFan(tenantId: string, emailCrudo: string, origen: string, ahora = new Date()): Promise<boolean> {
  const email = emailCrudo.trim().toLowerCase();
  if (!esEmail(email)) return false;
  const secciones = await seccionesDelFan(tenantId);
  const tiene = (await Promise.all(secciones.map((s) => s.tiene(tenantId, email).catch(() => false)))).some(Boolean);
  if (!tiene) return false;
  const token = nuevoToken();
  const enviado = await conTenant(tenantId, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:fan:${email}`}))`;
    const ultimo = await tx.accesoFan.findFirst({ where: { email, linkUsadoEn: null, linkHash: { not: null } }, orderBy: { creadoEn: "desc" } });
    if (ultimo && ahora.getTime() - ultimo.creadoEn.getTime() < ESPERA_ENTRE_LINKS_MS) return false;
    // El link anterior sin usar deja de servir.
    await tx.accesoFan.updateMany({ where: { email, linkUsadoEn: null, linkHash: { not: null } }, data: { linkHash: null } });
    await tx.accesoFan.create({ data: { tenantId, email, linkHash: hashDeToken(token), linkVence: new Date(ahora.getTime() + LINK_FAN_MINUTOS * 60_000) } });
    const banda = (await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nombre: true } })).nombre;
    const url = `${origen}/mis-compras#${token}`;
    await enviarCorreoDelNucleo(
      tenantId,
      {
        para: email,
        nombreRemitente: banda,
        asunto: `Tus compras en ${banda}`,
        html: `<p>Para ver tus compras y tus entradas de ${h(banda)}, abrí este link (sirve una sola vez y vence en ${LINK_FAN_MINUTOS} minutos):</p>
<p><a href="${h(url)}">Ver mis compras</a></p>
<p>Si no lo pediste, ignorá este mail: nadie puede entrar sin este link.</p>`,
        texto: `Para ver tus compras y tus entradas de ${banda}, abrí este link (sirve una sola vez y vence en ${LINK_FAN_MINUTOS} minutos):\n${url}\n\nSi no lo pediste, ignorá este mail: nadie puede entrar sin este link.`,
      },
      { tx },
    );
    return true;
  });
  return enviado;
}

/** Abre el link del mail: lo da por usado y devuelve la sesión nueva (null si el link no sirve). */
export async function canjearLinkDelFan(tenantId: string, token: string, ahora = new Date()): Promise<string | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const sesion = nuevoToken();
  const { count } = await conTenant(tenantId, (tx) =>
    tx.accesoFan.updateMany({
      where: { linkHash: hashDeToken(token), linkUsadoEn: null, linkVence: { gt: ahora } },
      data: { linkUsadoEn: ahora, linkHash: null, sesionHash: hashDeToken(sesion), sesionVence: new Date(ahora.getTime() + SESION_FAN_DIAS * 86_400_000) },
    }),
  );
  return count === 1 ? sesion : null;
}

/** Deja la sesión en este navegador (en una acción del servidor, en el sitio de la banda). */
export async function recordarSesionDelFan(sesion: string) {
  (await cookies()).set(COOKIE, sesion, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESION_FAN_DIAS * 86_400 });
}

/** El email de una sesión vigente, o null. */
export async function emailDeSesion(tenantId: string, sesion: string | null | undefined, ahora = new Date()): Promise<string | null> {
  if (!sesion || !/^[0-9a-f]{64}$/.test(sesion)) return null;
  const fila = await conTenant(tenantId, (tx) =>
    tx.accesoFan.findFirst({ where: { sesionHash: hashDeToken(sesion), cerradaEn: null, sesionVence: { gt: ahora } }, select: { email: true } }),
  );
  return fila?.email ?? null;
}

/** El email del fan con sesión en este sitio, o null. Solo en un pedido del sitio de la banda. */
export async function emailDelFan(tenantId: string): Promise<string | null> {
  return emailDeSesion(tenantId, (await cookies()).get(COOKIE)?.value);
}

/** Cierra la sesión de este navegador. */
export async function cerrarSesionDelFan(tenantId: string): Promise<void> {
  const jar = await cookies();
  const sesion = jar.get(COOKIE)?.value;
  if (sesion && /^[0-9a-f]{64}$/.test(sesion)) {
    await conTenant(tenantId, (tx) => tx.accesoFan.updateMany({ where: { sesionHash: hashDeToken(sesion), cerradaEn: null }, data: { cerradaEn: new Date() } }));
  }
  jar.delete(COOKIE);
}
