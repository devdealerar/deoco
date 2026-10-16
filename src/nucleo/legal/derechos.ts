// Los derechos del fan sobre sus datos (Ley 25.326 arts. 14 y 16; LGPD art. 18; docs/privacidad.md)
// y el botón de arrepentimiento (Ley 24.240 art. 34). El canal: un formulario en el sitio de la
// banda (`/datos-personales`, `/arrepentimiento`). El fan confirma por mail que el email es suyo
// (link con el token después de "#"); recién ahí el pedido corre, con su vencimiento legal:
// acceso, 10 días corridos; corrección, borrado u oposición, 5 días hábiles; arrepentimiento,
// confirmación con un código dentro de las 24 h. La banda lo atiende en `/b/<slug>/datos-personales`.
import { createHash, randomBytes } from "node:crypto";
import { avisarAlTitular } from "@/nucleo/correo/deoco";
import { esEmail } from "@/nucleo/correo/direccion";
import { enviarCorreoDelNucleo, escaparHtml as h } from "@/nucleo/correo";
import { conTenant } from "@/nucleo/db/con-tenant";
import { FECHA_LARGA, sumarDiasCorridos, sumarDiasHabiles } from "@/nucleo/fechas";
import { registro } from "@/nucleo/modulos";
import type { SeccionDeDatos } from "@/nucleo/modulos/contrato";
import { ErrorLegal } from "./index";

export type TipoPedido = "acceso" | "rectificacion" | "supresion" | "oposicion" | "arrepentimiento";
export const TIPOS: Record<TipoPedido, { texto: string; plazo: string }> = {
  acceso: { texto: "Ver qué datos tienen de mí", plazo: "10 días corridos" },
  rectificacion: { texto: "Corregir o actualizar mis datos", plazo: "5 días hábiles" },
  supresion: { texto: "Borrar mis datos", plazo: "5 días hábiles" },
  oposicion: { texto: "Que no usen mis datos para comunicaciones", plazo: "5 días hábiles" },
  arrepentimiento: { texto: "Revocar una compra (arrepentimiento)", plazo: "confirmación en 24 horas" },
};

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const hashDeEmail = (tenantId: string, email: string) => hash(`${tenantId}:${email.trim().toLowerCase()}`);

/** El vencimiento legal de un pedido, desde que el fan confirmó su email. */
export function vencimientoDe(tipo: TipoPedido, desde: Date): Date {
  if (tipo === "acceso") return sumarDiasCorridos(desde, 10);
  if (tipo === "arrepentimiento") return new Date(desde.getTime() + 24 * 3600_000);
  return sumarDiasHabiles(desde, 5);
}

/**
 * El fan pide algo sobre sus datos desde el sitio. Queda "sin verificar" hasta que confirme el
 * mail. Freno: 5 pedidos sin confirmar por email por día (nadie llena la casilla de otro).
 */
export async function pedirSobreMisDatos(
  tenantId: string,
  d: { tipo: string; email: string; nombre: string; detalle: string },
  origen: string,
): Promise<void> {
  const tipo = d.tipo as TipoPedido;
  if (!(tipo in TIPOS)) throw new ErrorLegal("Elegí qué querés pedir.");
  const email = d.email.trim().toLowerCase();
  if (!esEmail(email)) throw new ErrorLegal("Revisá tu email: ahí te escribimos para confirmar.");
  const detalle = d.detalle.trim().slice(0, 2000);
  if ((tipo === "rectificacion" || tipo === "arrepentimiento") && !detalle) {
    throw new ErrorLegal(tipo === "rectificacion" ? "Contanos qué dato hay que corregir y cómo." : "Contanos qué compra querés revocar (fecha o número de pedido).");
  }
  const token = randomBytes(24).toString("hex");
  const banda = await conTenant(tenantId, async (tx) => {
    const recientes = await tx.pedidoDatos.count({ where: { email, estado: "sin-verificar", creadoEn: { gt: new Date(Date.now() - 86_400_000) } } });
    if (recientes >= 5) throw new ErrorLegal("Ya mandaste varios pedidos hoy: confirmalos desde tu mail.");
    await tx.pedidoDatos.create({ data: { tenantId, tipo, email, nombre: d.nombre.trim().slice(0, 120), detalle, tokenHash: hash(token) } });
    return (await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nombre: true } })).nombre;
  });
  const url = `${origen}/datos-personales/confirmar#${token}`;
  await enviarCorreoDelNucleo(tenantId, {
    para: email,
    nombreRemitente: banda,
    asunto: `${banda}: confirmá tu pedido sobre tus datos`,
    html: `<p>Recibimos un pedido en el sitio de ${h(banda)}: <strong>${h(TIPOS[tipo].texto)}</strong>.</p><p>Para que empiece a correr, confirmá que este email es tuyo:</p><p><a href="${h(url)}">Confirmar mi pedido</a></p><p>Si no lo pediste vos, ignorá este mail: no pasa nada.</p>`,
    texto: `Recibimos un pedido en el sitio de ${banda}: ${TIPOS[tipo].texto}.\n\nPara que empiece a correr, confirmá que este email es tuyo: ${url}\n\nSi no lo pediste vos, ignorá este mail: no pasa nada.`,
  });
}

/** El fan abrió el link: el pedido corre desde ahora, con su vencimiento. Avisa a la banda. */
export async function confirmarPedidoDeDatos(tenantId: string, token: string, ahora = new Date()): Promise<{ codigo: string; venceEn: Date; tipo: TipoPedido } | null> {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const p = await conTenant(tenantId, async (tx) => {
    const fila = await tx.pedidoDatos.findFirst({ where: { tokenHash: hash(token) } });
    if (!fila) return null;
    if (fila.estado !== "sin-verificar") return fila;
    const venceEn = vencimientoDe(fila.tipo as TipoPedido, ahora);
    // El token se usa una vez: después del canje queda vacío.
    return tx.pedidoDatos.update({ where: { id: fila.id }, data: { estado: "abierto", verificadoEn: ahora, venceEn, tokenHash: null } });
  });
  if (!p || !p.venceEn) return null;
  const codigo = p.id.slice(0, 8).toUpperCase();
  const tipo = p.tipo as TipoPedido;
  if (p.verificadoEn?.getTime() === ahora.getTime()) {
    await avisarAlTitular(tenantId, {
      clave: `pedido-datos:${p.id}`,
      asunto: (b) => `${b}: un fan pidió algo sobre sus datos (vence el ${FECHA_LARGA.format(p.venceEn!)})`,
      parrafos: () => [
        `${p.email} pidió: ${TIPOS[tipo].texto}. Código ${codigo}.`,
        `Por ley hay que responder antes del ${FECHA_LARGA.format(p.venceEn!)} (${TIPOS[tipo].plazo}). En el panel ves sus datos y lo respondés en un clic.`,
      ],
      boton: { texto: "Ver el pedido", ruta: "/datos-personales" },
    });
  }
  return { codigo, venceEn: p.venceEn, tipo };
}

/** Los pedidos de la banda: abiertos primero, por vencimiento. */
export const pedidosDeDatos = (tenantId: string) =>
  conTenant(tenantId, (tx) => tx.pedidoDatos.findMany({ where: { estado: { not: "sin-verificar" } }, orderBy: [{ estado: "asc" }, { venceEn: "asc" }], take: 200 }));

/** Los abiertos que vencen en los próximos días (para el aviso del panel). */
export const pedidosPorVencer = (tenantId: string, dias = 3) =>
  conTenant(tenantId, (tx) => tx.pedidoDatos.findMany({ where: { estado: "abierto", venceEn: { lt: new Date(Date.now() + dias * 86_400_000) } }, orderBy: { venceEn: "asc" } }));

/**
 * Todo lo que la banda tiene de una persona, por su email: lo del núcleo (correos que se le
 * mandaron, pedidos de datos) y lo de cada módulo que declara `datosPersonales` (prendido o no:
 * los datos siguen ahí aunque el módulo esté apagado).
 */
export async function datosDeLaPersona(tenantId: string, email: string): Promise<SeccionDeDatos[]> {
  const e = email.trim().toLowerCase();
  const nucleo = await conTenant(tenantId, async (tx) => ({
    correos: await tx.correo.findMany({ where: { para: { equals: e, mode: "insensitive" } }, select: { asunto: true, creadoEn: true, estado: true }, orderBy: { creadoEn: "desc" }, take: 200 }),
    pedidos: await tx.pedidoDatos.findMany({ where: { email: e }, select: { tipo: true, estado: true, creadoEn: true }, orderBy: { creadoEn: "desc" } }),
  }));
  const secciones: SeccionDeDatos[] = [
    { titulo: "Correos que te mandó la banda", filas: nucleo.correos.map((c) => ({ asunto: c.asunto, fecha: c.creadoEn.toISOString(), estado: c.estado })) },
    { titulo: "Pedidos sobre tus datos", filas: nucleo.pedidos.map((p) => ({ tipo: TIPOS[p.tipo as TipoPedido]?.texto ?? p.tipo, estado: p.estado, fecha: p.creadoEn.toISOString() })) },
  ];
  for (const m of registro().modulos) {
    if (!m.datosPersonales) continue;
    secciones.push(...(await m.datosPersonales.buscar(tenantId, e)));
  }
  return secciones.filter((s) => s.filas.length > 0);
}

async function contestar(tenantId: string, email: string, asunto: string, parrafos: string[], adjunto?: { nombre: string; contenido: Buffer }) {
  const banda = (await conTenant(tenantId, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nombre: true } }))).nombre;
  await enviarCorreoDelNucleo(tenantId, {
    para: email,
    nombreRemitente: banda,
    asunto: `${banda}: ${asunto}`,
    html: parrafos.map((p) => `<p>${h(p)}</p>`).join(""),
    texto: parrafos.join("\n\n"),
    ...(adjunto ? { adjuntos: [{ nombre: adjunto.nombre, tipo: "application/json", contenido: adjunto.contenido }] } : {}),
  });
}

/**
 * La banda responde un pedido. Acceso: le manda al fan sus datos (JSON adjunto). Supresión:
 * anonimiza en cada módulo lo que se puede, guarda el email en hash en la lista de supresión y le
 * cuenta al fan qué se conservó y por qué. Los demás: la respuesta de la banda, tal cual.
 */
export async function resolverPedidoDeDatos(
  tenantId: string,
  id: string,
  usuarioId: string,
  d: { estado: "resuelto" | "rechazado"; respuesta: string },
): Promise<string> {
  const p = await conTenant(tenantId, (tx) => tx.pedidoDatos.findUnique({ where: { id } }));
  if (!p || p.estado !== "abierto") throw new ErrorLegal("Ese pedido no está abierto.");
  const tipo = p.tipo as TipoPedido;
  const respuesta = d.respuesta.trim().slice(0, 2000);
  if (d.estado === "rechazado" && !respuesta) throw new ErrorLegal("Para rechazarlo, explicá por qué (la ley pide fundarlo).");
  const parrafos: string[] = [];
  let adjunto: { nombre: string; contenido: Buffer } | undefined;
  if (d.estado === "resuelto" && tipo === "acceso") {
    const datos = await datosDeLaPersona(tenantId, p.email);
    adjunto = { nombre: "mis-datos.json", contenido: Buffer.from(JSON.stringify({ email: p.email, generado: new Date().toISOString(), secciones: datos }, null, 2)) };
    parrafos.push(`Te adjuntamos todos los datos que tenemos asociados a ${p.email} (${datos.reduce((s, x) => s + x.filas.length, 0)} registros).`);
  }
  if (d.estado === "resuelto" && tipo === "supresion") {
    const r = await suprimirDatosDeLaPersona(tenantId, p.email);
    parrafos.push(`Borramos (anonimizamos) tus datos: ${r.anonimizados} registros.`);
    if (r.conservados.length) parrafos.push(`Se conserva, por obligación legal o porque está en curso: ${r.conservados.join("; ")}.`);
  }
  if (respuesta) parrafos.push(respuesta);
  if (!parrafos.length) parrafos.push(d.estado === "resuelto" ? "Tu pedido quedó resuelto." : "No pudimos hacer lo que pediste.");
  await conTenant(tenantId, async (tx) => {
    await tx.pedidoDatos.update({ where: { id }, data: { estado: d.estado, respuesta: parrafos.join("\n"), respondidoEn: new Date(), respondidoPor: usuarioId } });
    await tx.auditoria.create({ data: { usuarioId, tenantId, accion: `legal.pedido_${d.estado}`, detalle: { pedidoId: id, tipo } } });
  });
  await contestar(tenantId, p.email, d.estado === "resuelto" ? "respondimos tu pedido sobre tus datos" : "tu pedido sobre tus datos", parrafos, adjunto);
  return d.estado === "resuelto" ? "Respondido: le mandamos la respuesta por mail." : "Rechazado, con el motivo, por mail.";
}

/**
 * Supresión: cada módulo anonimiza lo suyo; el núcleo vacía los cuerpos de los correos que se le
 * mandaron y suma el email (en hash) a la lista de supresión de la banda.
 */
export async function suprimirDatosDeLaPersona(tenantId: string, email: string): Promise<{ anonimizados: number; conservados: string[] }> {
  const e = email.trim().toLowerCase();
  let anonimizados = 0;
  const conservados: string[] = [];
  for (const m of registro().modulos) {
    if (!m.datosPersonales) continue;
    const r = await m.datosPersonales.suprimir(tenantId, e);
    anonimizados += r.anonimizados;
    conservados.push(...r.conservados);
  }
  await conTenant(tenantId, async (tx) => {
    const { count } = await tx.correo.updateMany({ where: { para: { equals: e, mode: "insensitive" }, estado: { not: "PENDIENTE" } }, data: { para: "suprimido@invalid", html: "", texto: "", adjuntos: [] } });
    anonimizados += count;
    await tx.supresionDatos.createMany({ data: [{ tenantId, emailHash: hashDeEmail(tenantId, e) }], skipDuplicates: true });
  });
  return { anonimizados, conservados };
}

/** ¿Este email pidió que se borren sus datos en la banda? (la newsletter no lo vuelve a sumar) */
export async function estaSuprimido(tenantId: string, email: string): Promise<boolean> {
  return !!(await conTenant(tenantId, (tx) => tx.supresionDatos.findUnique({ where: { tenantId_emailHash: { tenantId, emailHash: hashDeEmail(tenantId, email) } } })));
}
