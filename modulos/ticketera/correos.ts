// compra.pagada → mail al comprador con un QR por entrada (imágenes embebidas, cid:) y el link
// para volver a verlas. Una vez por compra (clave única).
import QRCode from "qrcode";
import { enviarCorreo, escaparHtml as h } from "@/nucleo/correo";
import { conTenant } from "@/nucleo/db/con-tenant";
import type { Evento } from "@/nucleo/modulos/contrato";
import { FECHA_LARGA } from "./dinero";
import ticketera from "./index";

export const qrPng = (codigo: string) => QRCode.toBuffer(codigo, { type: "png", width: 320, margin: 2, errorCorrectionLevel: "M" });
export const qrSvg = (codigo: string) => QRCode.toString(codigo, { type: "svg", margin: 2, errorCorrectionLevel: "M" });

const sitio = (dominio: string) => (process.env.NODE_ENV === "production" ? `https://${dominio}` : `http://${dominio}:${process.env.PORT ?? 3000}`);
const estilo = "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1917;line-height:1.5;max-width:560px";

export async function alPagarseCompra(evento: Evento) {
  const { compraId } = evento.payload as { compraId: string };
  const datos = await conTenant(evento.tenantId, async (tx) => {
    const c = await tx.ticketeraCompra.findUnique({ where: { id: compraId }, include: { evento: true, tipo: true, entradas: { orderBy: { nombre: "asc" } } } });
    const banda = await tx.tenant.findUniqueOrThrow({ where: { id: evento.tenantId }, select: { nombre: true } });
    const dominio = (await tx.dominio.findFirst({ where: { esPrincipal: true }, select: { dominio: true } }))?.dominio ?? null;
    return c && { c, banda, dominio };
  });
  if (!datos || datos.c.estado !== "PAGADA") return;
  const { c, banda, dominio } = datos;
  // El token va después de "#": el navegador nunca lo manda a un servidor (ni en Referer ni en logs).
  const url = dominio ? `${sitio(dominio)}/fechas/compra/${c.id}#${c.token}` : null;
  const cuando = FECHA_LARGA.format(c.evento.fecha);
  const adjuntos = await Promise.all(
    c.entradas.map(async (e) => ({ nombre: `entrada-${e.codigo}.png`, tipo: "image/png", cid: `qr-${e.codigo}`, contenido: await qrPng(e.codigo) })),
  );
  const html = `<div style="${estilo}">
<h1 style="font-size:20px">Tus entradas para ${h(c.evento.nombre)}</h1>
<p><strong>${h(cuando)}</strong> · ${h(c.evento.lugar)}, ${h(c.evento.ciudad)}${c.evento.direccion ? ` (${h(c.evento.direccion)})` : ""}</p>
<p>Mostrá el QR de cada entrada en la puerta (desde el celular o impreso). Cada entrada vale para una sola persona y entra una sola vez.</p>
${c.entradas
  .map(
    (e) => `<div style="border:1px solid #e7e5e4;border-radius:12px;padding:16px;margin:16px 0;text-align:center">
<img src="cid:qr-${e.codigo}" width="220" height="220" alt="QR de la entrada ${e.codigo}">
<div style="font-size:18px;font-weight:700">${h(e.nombre)}</div>
<div style="color:#57534e">Documento ${h(e.documento)} · ${h(c.tipo.nombre)}</div>
<div style="font-family:monospace;font-size:16px;letter-spacing:2px;margin-top:4px">${e.codigo}</div>
</div>`,
  )
  .join("\n")}
${url ? `<p>¿Perdiste este mail? Tus entradas están siempre en <a href="${h(url)}">${h(url)}</a> (no compartas ese link).</p>` : ""}
</div>`;
  const texto = [
    `Tus entradas para ${c.evento.nombre}`,
    `${cuando} · ${c.evento.lugar}, ${c.evento.ciudad}${c.evento.direccion ? ` (${c.evento.direccion})` : ""}`,
    "",
    "Mostrá el QR de cada entrada en la puerta. Si no se ve, el código se puede tipear:",
    ...c.entradas.map((e) => `- ${e.nombre} (documento ${e.documento}) · ${c.tipo.nombre}: ${e.codigo}`),
    "",
    ...(url ? [`Tus entradas, siempre: ${url} (no compartas ese link)`] : []),
  ].join("\n");
  await enviarCorreo(
    ticketera,
    evento.tenantId,
    { para: c.email, asunto: `Tus entradas · ${c.evento.nombre} · ${banda.nombre}`, html, texto, adjuntos },
    { unica: `compra:${c.id}:entradas` },
  );
}
