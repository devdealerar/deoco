// Autogestión del alta en app.<raiz>: una persona se registra sola (email + contraseña), verifica
// el email con un link y crea su banda (nombre + subdominio). El staff conserva todo su poder
// (ve las altas en el back office, puede suspender o archivar como cualquier otra).
//
// Contra el abuso, lo más simple que alcanza (ver docs/decisiones-pendientes.md, P2):
//   - El usuario recién existe al abrir el link del mail: sin email verificado no hay cuenta ni
//     banda, y un subdominio no se reserva con un email ajeno.
//   - Una banda por autogestión por cuenta (la base lo impone en crear_banda_autogestion).
//   - Por IP: pocos registros y pocas bandas por hora (en memoria del proceso). Por email: 3
//     mails de verificación por hora (en la base).
//   - Un campo trampa ("sitio web") que una persona no ve y un bot llena.
import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { LARGO_MINIMO_CLAVE } from "@/nucleo/auth/clave";
import { hashearContrasena } from "@/nucleo/auth/contrasena";
import { bandaCreada } from "@/nucleo/cuenta";
import { escaparHtml as h } from "@/nucleo/correo";
import { esEmail } from "@/nucleo/correo/direccion";
import { remitente, transporte } from "@/nucleo/correo/transporte";
import { prisma } from "@/nucleo/db/cliente";
import { dominioRaiz, origenPlataforma } from "@/nucleo/tenant/hosts";
import { problemaDeSubdominio } from "@/nucleo/tenant/reservados";

export class ErrorAutogestion extends Error {}

/** Cuánto vale el link del mail. */
export const VALIDEZ_LINK_HORAS = 24;
const POR_HORA = { registros: 5, bandas: 3 };

// ── Freno por IP (en memoria: un proceso; ver decisiones) ──────────────────────────────────────

const intentos = new Map<string, number[]>();
/** true si `ip` todavía puede hacer `que` (y lo cuenta). Sin IP conocida, se cuenta como una sola. */
export function permitido(que: keyof typeof POR_HORA, ip: string | null, ahora = Date.now()): boolean {
  const clave = `${que}:${ip ?? "?"}`;
  const recientes = (intentos.get(clave) ?? []).filter((t) => t > ahora - 3_600_000);
  if (recientes.length >= POR_HORA[que]) {
    intentos.set(clave, recientes);
    return false;
  }
  recientes.push(ahora);
  intentos.set(clave, recientes);
  if (intentos.size > 10_000) for (const [k, v] of intentos) if (!v.some((t) => t > ahora - 3_600_000)) intentos.delete(k);
  return true;
}
export const olvidarIntentos = () => intentos.clear();

const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");

// ── 1. Registro: guarda el pedido y manda el link ───────────────────────────────────────────────

export type DatosRegistro = { nombre: string; email: string; contrasena: string; repetida: string; trampa?: string };

/**
 * Siempre responde lo mismo si los datos son válidos ("te mandamos un mail"): no dice si el email
 * ya tiene cuenta (a esa casilla le llega un mail que lo explica).
 */
export async function solicitarRegistro(d: DatosRegistro, ip: string | null): Promise<void> {
  const nombre = d.nombre.trim().replace(/\s+/g, " ");
  const email = d.email.trim().toLowerCase();
  if (d.trampa) return; // un bot: hace como que anduvo
  if (!nombre || nombre.length > 80) throw new ErrorAutogestion("Escribí tu nombre (hasta 80 caracteres).");
  if (!esEmail(email) || email.length > 200) throw new ErrorAutogestion("Ese email no parece válido.");
  if (d.contrasena.length < LARGO_MINIMO_CLAVE) throw new ErrorAutogestion(`La contraseña tiene que tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`);
  if (d.contrasena.length > 200) throw new ErrorAutogestion("La contraseña es demasiado larga.");
  if (d.contrasena !== d.repetida) throw new ErrorAutogestion("Las dos contraseñas no coinciden.");
  const envio = transporte();
  if (!envio) throw new ErrorAutogestion("Ahora no podemos mandar mails. Probá más tarde.");
  if (!permitido("registros", ip)) throw new ErrorAutogestion("Demasiados intentos desde tu conexión. Probá en un rato.");

  const token = randomBytes(32).toString("hex");
  const vence = new Date(Date.now() + VALIDEZ_LINK_HORAS * 3_600_000);
  const [{ r }] = await prisma.$queryRaw<{ r: string }[]>`
    SELECT registro_solicitar(${email}, ${nombre}, ${await hashearContrasena(d.contrasena)}, ${sha256(token)}, ${vence}::timestamp) AS r`;
  if (r === "demasiados") throw new ErrorAutogestion("Ya te mandamos varios mails. Revisá tu casilla (y el spam) o probá en una hora.");

  const app = origenPlataforma();
  const estilo = "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1917;line-height:1.5;max-width:560px";
  const [asunto, lineas, link] =
    r === "existe"
      ? ["Ya tenés una cuenta en Deoco", ["Alguien (seguramente vos) quiso crear una cuenta en Deoco con este email, pero ya tenés una.", "Si no te acordás la contraseña, escribinos."], `${app}/ingresar`]
      : ["Confirmá tu email para crear tu banda en Deoco", [`Hola, ${nombre}: para terminar de crear tu cuenta, confirmá tu email con este link (vale ${VALIDEZ_LINK_HORAS} horas).`, "Si no fuiste vos, ignorá este mail."], `${app}/registro/verificar#${token}`];
  await envio.enviar({
    id: randomBytes(8).toString("hex"),
    de: { nombre: "Deoco", direccion: remitente() },
    para: email,
    asunto,
    html: `<div style="${estilo}">${lineas.map((l) => `<p>${h(l)}</p>`).join("")}<p><a href="${h(link)}">${r === "existe" ? "Ingresar" : "Confirmar mi email"}</a></p></div>`,
    texto: [...lineas, "", link].join("\n"),
  });
}

// ── 2. El link del mail: crea el usuario ────────────────────────────────────────────────────────

/** El token del link → el usuario nuevo (con el email verificado), o null si no sirve. */
export async function confirmarRegistro(token: string): Promise<string | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const [{ id }] = await prisma.$queryRaw<{ id: string | null }[]>`SELECT registro_confirmar(${sha256(token)}) AS id`;
  return id;
}

// ── 3. La banda ─────────────────────────────────────────────────────────────────────────────────

export type DatosBanda = { nombre: string; subdominio: string; opcion?: string };

/**
 * Crea la banda de `usuarioId` (verificado: existe), con su subdominio y la persona de titular,
 * y le avisa al gestor de cuenta (prueba o plan). Devuelve adónde ir: el panel o la pasarela.
 */
export async function crearBandaPropia(usuarioId: string, d: DatosBanda, ip: string | null): Promise<{ slug: string; tenantId: string; redireccion: string }> {
  const nombre = d.nombre.trim().replace(/\s+/g, " ");
  const sub = d.subdominio.trim().toLowerCase();
  if (!nombre || nombre.length > 80) throw new ErrorAutogestion("Escribí el nombre de la banda (hasta 80 caracteres).");
  const problema = problemaDeSubdominio(sub);
  if (problema) throw new ErrorAutogestion(problema);
  if (!permitido("bandas", ip)) throw new ErrorAutogestion("Demasiados intentos desde tu conexión. Probá en un rato.");
  const dominio = `${sub}.${dominioRaiz()}`;
  let tenantId: string;
  try {
    [{ tenantId }] = await prisma.$queryRaw<{ tenantId: string }[]>`
      SELECT crear_banda_autogestion(${usuarioId}::uuid, ${nombre}, ${sub}, ${dominio}) AS "tenantId"`;
  } catch (e) {
    const texto = String((e as { message?: string }).message ?? e);
    if (texto.includes("deoco:ya-tiene-banda")) throw new ErrorAutogestion("Tu cuenta ya creó una banda. Para sumar otra, escribinos.");
    if (texto.includes("deoco:dominio-tomado") || texto.includes("tenant_slug_key") || (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2010" && texto.includes("23505"))) {
      throw new ErrorAutogestion(`${dominio} ya está tomado. Probá con otro.`);
    }
    if (texto.includes("deoco:sin-usuario")) throw new ErrorAutogestion("Tu cuenta no existe. Volvé a registrarte.");
    throw e;
  }
  // La banda ya existe: si el gestor falla, queda en pie (sin plan; el staff lo ve) y el error, en el log.
  const r = await bandaCreada(tenantId, "autogestion", d.opcion).catch((e) => {
    console.error(`[autogestion] gestor de cuenta para ${sub}:`, e);
    return {} as { redireccion?: string };
  });
  return { slug: sub, tenantId, redireccion: r.redireccion ?? `/b/${sub}` };
}

/** ¿Puede crear una banda sola? (una por cuenta) */
export async function yaCreoBanda(usuarioId: string): Promise<boolean> {
  const [{ n }] = await prisma.$queryRaw<{ n: number }[]>`SELECT bandas_autogestionadas(${usuarioId}::uuid) AS n`;
  return n > 0;
}
