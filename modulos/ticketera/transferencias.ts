// Transferir una entrada (D5; documento maestro "Mis compras"; 3.2 público d1): quien la tiene la
// pide desde el área del fan, la confirma desde su mail (una sesión robada no alcanza) y quien la
// recibe la acepta desde el suyo. Al aceptarse, la entrada pasa a su nombre con un código nuevo:
// el QR anterior deja de valer (la puerta lo reconoce como "transferida"). Si no se acepta a
// tiempo (72 h o el comienzo del show), vence y la entrada queda como estaba: nunca se tocó.
import { prisma } from "@/nucleo/db/cliente";
import { conTenant, type TxTenant } from "@/nucleo/db/con-tenant";
import { enviarCorreo, escaparHtml as h } from "@/nucleo/correo";
import { esEmail } from "@/nucleo/correo/direccion";
import { FECHA_LARGA } from "@/nucleo/fechas";
import { contextoDeToken, hashDeToken, nuevoTokenDeAcceso } from "@/nucleo/publico/token";
import { DOCUMENTO } from "./compras";
import { qrPng } from "./correos";
import { ErrorTicketera, esUuid } from "./eventos";
import { codigoFirmado, formatearCodigo, nuevoCodigo } from "./firma";
import ticketera from "./index";

export const VENCE_TRANSFERENCIA_MS = 72 * 3600_000;
const ABIERTAS = ["por-confirmar", "por-aceptar"];

const titularDe = (e: { emailTitular: string | null; compra: { email: string } }) => (e.emailTitular ?? e.compra.email).toLowerCase();
const ctx = (tenantId: string, id: string, paso: string) => contextoDeToken(tenantId, "ticketera", `transferencia:${paso}:${id}`);

/** Las entradas que tiene ese email (las que compró y no transfirió, y las que le transfirieron). */
export async function entradasDelFan(tenantId: string, email: string) {
  const e = email.toLowerCase();
  return conTenant(tenantId, (tx) =>
    tx.ticketeraEntrada.findMany({
      where: {
        anuladaEn: null,
        compra: { estado: "PAGADA" },
        OR: [{ emailTitular: e }, { emailTitular: null, compra: { email: { equals: e, mode: "insensitive" } } }],
      },
      include: {
        evento: true,
        tipo: { select: { nombre: true } },
        compra: { select: { id: true, email: true } },
        transferencias: { where: { estado: { in: ABIERTAS } }, select: { id: true, estado: true, aEmail: true, aNombre: true, vence: true } },
      },
      orderBy: [{ evento: { fecha: "asc" } }, { nombre: "asc" }],
    }),
  );
}

export type DatosTransferencia = { nombre: string; documento: string; email: string };

async function mail(tx: TxTenant, tenantId: string, para: string, asunto: string, parrafos: string[], link: { url: string; texto: string } | null, unica: string) {
  await enviarCorreo(
    ticketera,
    tenantId,
    {
      para,
      asunto,
      html: [...parrafos.map((p) => `<p>${h(p)}</p>`), ...(link ? [`<p><a href="${h(link.url)}">${h(link.texto)}</a></p>`] : [])].join("\n"),
      texto: [...parrafos, ...(link ? [`${link.texto}: ${link.url}`] : [])].join("\n\n"),
    },
    { tx, unica },
  );
}

/** Quien tiene la entrada pide transferirla. Le llega un mail para confirmar. */
export async function pedirTransferencia(tenantId: string, emailFan: string, entradaId: string, d: DatosTransferencia, origen: string, ahora = new Date()): Promise<string> {
  const a = { nombre: d.nombre.trim().replace(/\s+/g, " "), documento: d.documento.trim().replace(/\s+/g, " "), email: d.email.trim().toLowerCase() };
  if (a.nombre.length < 2 || a.nombre.length > 100) throw new ErrorTicketera("Poné el nombre de quien recibe la entrada.");
  if (!DOCUMENTO.test(a.documento)) throw new ErrorTicketera("El documento de quien la recibe no parece válido.");
  if (!esEmail(a.email)) throw new ErrorTicketera("Revisá el email de quien la recibe.");
  if (!esUuid(entradaId)) throw new ErrorTicketera("Esa entrada no existe.");
  return conTenant(tenantId, async (tx) => {
    const e = await tx.ticketeraEntrada.findUnique({ where: { id: entradaId }, include: { compra: { select: { email: true, estado: true } }, evento: true } });
    if (!e || titularDe(e) !== emailFan.toLowerCase() || e.compra.estado !== "PAGADA" || e.anuladaEn) throw new ErrorTicketera("Esa entrada no es tuya.");
    if (e.validadaEn) throw new ErrorTicketera("Esa entrada ya se usó.");
    if (e.evento.fecha <= ahora) throw new ErrorTicketera("El show ya empezó: la entrada no se puede transferir.");
    if (a.email === titularDe(e)) throw new ErrorTicketera("Ese email es el tuyo.");
    const id = crypto.randomUUID();
    const t = nuevoTokenDeAcceso(ctx(tenantId, id, "confirmar"));
    const vence = new Date(Math.min(ahora.getTime() + VENCE_TRANSFERENCIA_MS, e.evento.fecha.getTime()));
    try {
      await tx.ticketeraTransferencia.create({
        data: { id, tenantId, entradaId, deEmail: titularDe(e), aEmail: a.email, aNombre: a.nombre, aDocumento: a.documento, confirmarHash: t.hash, confirmarCifrado: t.cifrado, vence },
      });
    } catch (err) {
      if (String((err as Error)?.message).includes("ticketera_transferencia_una_abierta") || (err as { code?: string })?.code === "P2002") {
        throw new ErrorTicketera("Esa entrada ya tiene una transferencia en curso: cancelala para hacer otra.");
      }
      throw err;
    }
    await mail(
      tx,
      tenantId,
      titularDe(e),
      `Confirmá la transferencia de tu entrada · ${e.evento.nombre}`,
      [
        `Pediste transferir tu entrada para ${e.evento.nombre} (${FECHA_LARGA.format(e.evento.fecha)}) a ${a.nombre} (${a.email}).`,
        "Para seguir, confirmalo desde este link. Después, la otra persona la tiene que aceptar desde su mail. Hasta que la acepte, tu entrada sigue siendo tuya y tu QR sigue valiendo.",
        "Si no lo pediste vos, no abras el link: no pasa nada.",
      ],
      { url: `${origen}/fechas/transferencia/confirmar#${t.token}`, texto: "Confirmar la transferencia" },
      `transferencia:${id}:confirmar`,
    );
    return id;
  });
}

/** Quien la da confirma desde su mail: le llega el pedido a quien la recibe. */
export async function confirmarTransferencia(tenantId: string, token: string, origen: string, ahora = new Date()): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(token)) return false;
  return conTenant(tenantId, async (tx) => {
    const t = await tx.ticketeraTransferencia.findFirst({ where: { confirmarHash: hashDeToken(token), estado: "por-confirmar" }, include: { entrada: { include: { evento: true } } } });
    if (!t || t.vence <= ahora) return false;
    const acepto = nuevoTokenDeAcceso(ctx(tenantId, t.id, "aceptar"));
    await tx.ticketeraTransferencia.update({ where: { id: t.id }, data: { estado: "por-aceptar", confirmarHash: null, confirmarCifrado: null, aceptarHash: acepto.hash, aceptarCifrado: acepto.cifrado } });
    const banda = (await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nombre: true } })).nombre;
    await mail(
      tx,
      tenantId,
      t.aEmail,
      `Te transfieren una entrada · ${t.entrada.evento.nombre} · ${banda}`,
      [
        `Hola ${t.aNombre}: ${t.deEmail} te transfiere una entrada para ${t.entrada.evento.nombre} (${FECHA_LARGA.format(t.entrada.evento.fecha)}, ${t.entrada.evento.lugar}).`,
        `Aceptala desde este link y te llega a vos, a tu nombre (documento ${t.aDocumento}), con su QR. Vence el ${FECHA_LARGA.format(t.vence)}: si no la aceptás, vuelve a quien te la mandó.`,
      ],
      { url: `${origen}/fechas/transferencia/aceptar#${acepto.token}`, texto: "Aceptar la entrada" },
      `transferencia:${t.id}:aceptar`,
    );
    return true;
  });
}

/**
 * Quien la recibe la acepta: la entrada pasa a su nombre con un código nuevo (el QR anterior deja
 * de valer) y le llega con su QR. Todo en una transacción, con la entrada bloqueada.
 */
export async function aceptarTransferencia(tenantId: string, token: string, ahora = new Date()): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(token)) return false;
  return conTenant(tenantId, async (tx) => {
    const t = await tx.ticketeraTransferencia.findFirst({ where: { aceptarHash: hashDeToken(token), estado: "por-aceptar" } });
    if (!t) return false;
    await tx.$queryRaw`SELECT id FROM ticketera_entrada WHERE id = ${t.entradaId}::uuid FOR UPDATE`;
    const e = await tx.ticketeraEntrada.findUniqueOrThrow({ where: { id: t.entradaId }, include: { compra: { select: { email: true, estado: true } }, evento: true, tipo: true } });
    // Vencida, o la entrada cambió mientras tanto (se usó, se anuló, se la transfirió a otro): no.
    if (t.vence <= ahora || e.validadaEn || e.anuladaEn || e.compra.estado !== "PAGADA" || titularDe(e) !== t.deEmail) {
      await tx.ticketeraTransferencia.update({ where: { id: t.id }, data: { estado: "vencida", aceptarHash: null, aceptarCifrado: null, resueltaEn: ahora } });
      return false;
    }
    const codigo = codigoFirmado(tenantId, nuevoCodigo());
    await tx.ticketeraEntrada.update({ where: { id: e.id }, data: { codigo, nombre: t.aNombre, documento: t.aDocumento, emailTitular: t.aEmail } });
    await tx.ticketeraTransferencia.update({ where: { id: t.id }, data: { estado: "aceptada", aceptarHash: null, aceptarCifrado: null, codigoAnterior: e.codigo, resueltaEn: ahora } });
    const banda = (await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nombre: true } })).nombre;
    const cuando = FECHA_LARGA.format(e.evento.fecha);
    await enviarCorreo(
      ticketera,
      tenantId,
      {
        para: t.aEmail,
        asunto: `Tu entrada · ${e.evento.nombre} · ${banda}`,
        html: `<p>Ya es tuya: tu entrada para <strong>${h(e.evento.nombre)}</strong> (${h(cuando)}, ${h(e.evento.lugar)}, ${h(e.evento.ciudad)}).</p>
<div style="border:1px solid #e7e5e4;border-radius:12px;padding:16px;margin:16px 0;text-align:center">
<img src="cid:qr-${codigo}" width="220" height="220" alt="QR de la entrada ${codigo}">
<div style="font-size:18px;font-weight:700">${h(t.aNombre)}</div>
<div style="color:#57534e">Documento ${h(t.aDocumento)} · ${h(e.tipo.nombre)}</div>
<div style="font-family:monospace;font-size:16px;letter-spacing:2px;margin-top:4px">${formatearCodigo(codigo)}</div>
</div>
<p>Mostrá este QR en la puerta. También la tenés en "Mis compras", al pie del sitio de ${h(banda)}.</p>`,
        texto: `Ya es tuya: tu entrada para ${e.evento.nombre} (${cuando}, ${e.evento.lugar}, ${e.evento.ciudad}).\n\n${t.aNombre} (documento ${t.aDocumento}) · ${e.tipo.nombre}: ${formatearCodigo(codigo)}\n\nMostrá el QR en la puerta. También la tenés en "Mis compras", al pie del sitio de ${banda}.`,
        adjuntos: [{ nombre: `entrada-${codigo}.png`, tipo: "image/png", cid: `qr-${codigo}`, contenido: await qrPng(codigo) }],
      },
      { tx, unica: `transferencia:${t.id}:entrada` },
    );
    await mail(tx, tenantId, t.deEmail, `Se transfirió tu entrada · ${e.evento.nombre}`, [`${t.aNombre} aceptó la entrada que le transferiste para ${e.evento.nombre}. Tu QR de esa entrada ya no vale.`], null, `transferencia:${t.id}:aviso`);
    return true;
  });
}

/** Quien la da la cancela mientras no se aceptó. */
export async function cancelarTransferencia(tenantId: string, emailFan: string, transferenciaId: string, ahora = new Date()): Promise<void> {
  if (!esUuid(transferenciaId)) throw new ErrorTicketera("Esa transferencia no existe.");
  const { count } = await conTenant(tenantId, (tx) =>
    tx.ticketeraTransferencia.updateMany({
      where: { id: transferenciaId, deEmail: emailFan.toLowerCase(), estado: { in: ABIERTAS } },
      data: { estado: "cancelada", confirmarHash: null, confirmarCifrado: null, aceptarHash: null, aceptarCifrado: null, resueltaEn: ahora },
    }),
  );
  if (!count) throw new ErrorTicketera("Esa transferencia ya no está abierta.");
}

/** Tarea del barrido: las transferencias sin aceptar a tiempo vencen (la entrada nunca cambió). */
export async function vencerTransferencias(ahora = new Date()): Promise<void> {
  const bandas = await prisma.$queryRaw<{ id: string }[]>`SELECT b AS id FROM ticketera_bandas_con_transferencias() AS b`;
  for (const { id } of bandas) {
    await conTenant(id, (tx) =>
      tx.ticketeraTransferencia.updateMany({
        where: { estado: { in: ABIERTAS }, vence: { lte: ahora } },
        data: { estado: "vencida", confirmarHash: null, confirmarCifrado: null, aceptarHash: null, aceptarCifrado: null, resueltaEn: ahora },
      }),
    ).catch((e) => console.error(`[ticketera] vencer transferencias de ${id}:`, e instanceof Error ? e.message : e));
  }
}

/** ¿Ese código es de una entrada que se transfirió? (para que la puerta lo diga claro). */
export async function fueTransferida(tx: TxTenant, codigo: string): Promise<boolean> {
  return (await tx.ticketeraTransferencia.count({ where: { codigoAnterior: codigo, estado: "aceptada" } })) > 0;
}
