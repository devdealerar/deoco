// Mails de la tienda, colgados de pedido.pagado: la confirmación al fan y una orden de
// producción por proveedor. Cada uno con su clave única: un aviso repetido o un reproceso del
// evento no los manda dos veces. La orden al proveedor NO lleva montos de venta ni datos de pago.
import { urlFirmada } from "@/nucleo/archivos/firmados";
import { enviarCorreo, escaparHtml as h } from "@/nucleo/correo";
import { conTenant } from "@/nucleo/db/con-tenant";
import { origenDeBanda } from "@/nucleo/publico/origen";
import { origenPlataforma } from "@/nucleo/tenant/hosts";
import type { Evento } from "@/nucleo/modulos/contrato";
import { describirVariante, tituloEnvio } from "./comun";
import { type Contacto, contactoDeTienda } from "./contacto";
import { formatearPesos } from "@/nucleo/dinero";
import { describirEspecificacion } from "./impresion";
import tienda from "./index";

/** Cuánto vale el link al archivo de impresión que recibe el proveedor. */
export const VALIDEZ_LINK_IMPRESION = 14 * 24 * 60 * 60;

const numero = (id: string) => id.slice(0, 8).toUpperCase();

async function pedidoCompleto(tenantId: string, pedidoId: string) {
  return conTenant(tenantId, async (tx) => ({
    pedido: await tx.tiendaPedido.findUniqueOrThrow({
      where: { id: pedidoId },
      include: { items: { include: { producto: { include: { diseno: true } }, productoBase: true }, orderBy: { nombreProducto: "asc" } } },
    }),
    banda: await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nombre: true } }),
    sitio: await origenDeBanda(tenantId, { tx }),
  }));
}
type Datos = Awaited<ReturnType<typeof pedidoCompleto>>;

function direccion(p: Datos["pedido"]) {
  return [`${p.calle} ${p.numero}${p.piso ? `, ${p.piso}` : ""}`, `${p.ciudad}, ${p.provincia} (${p.codigoPostal})`];
}

const estilo = "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1917;line-height:1.5;max-width:560px";
const celda = "padding:6px 0;border-bottom:1px solid #e7e5e4;vertical-align:top";

// ---------- Al fan ----------

export function correoAlFan({ pedido, banda, sitio }: Datos, contacto: Contacto) {
  const envios = pedido.envios as { monto: number; productos: string[] }[];
  // El token va después de "#": el navegador nunca lo manda a un servidor (ni en Referer ni en logs).
  const url = sitio ? `${sitio}/tienda/pedido/${pedido.id}#${pedido.token}` : null;
  const [linea1, linea2] = direccion(pedido);
  const renglones = pedido.items.map((i) => ({
    nombre: i.nombreProducto,
    variante: describirVariante(i.variante as Record<string, string>),
    cantidad: i.cantidad,
    importe: formatearPesos(i.precioUnitario * i.cantidad),
  }));
  const filasEnvio = envios.length ? envios.map((e) => [tituloEnvio(e, envios), formatearPesos(e.monto)]) : [["Envío", formatearPesos(pedido.envio)]];

  const html = `<div style="${estilo}">
<h1 style="font-size:20px">¡Gracias por tu compra, ${h(pedido.nombre)}!</h1>
<p>Recibimos el pago de tu pedido <strong>#${numero(pedido.id)}</strong> en la tienda de <strong>${h(banda.nombre)}</strong>.</p>
<table style="width:100%;border-collapse:collapse">
${renglones.map((r) => `<tr><td style="${celda}">${h(r.nombre)} × ${r.cantidad}${r.variante ? `<br><span style="color:#57534e;font-size:14px">${h(r.variante)}</span>` : ""}</td><td style="${celda};text-align:right">${r.importe}</td></tr>`).join("\n")}
${filasEnvio.map(([t, m]) => `<tr><td style="${celda}">${h(t)}</td><td style="${celda};text-align:right">${m}</td></tr>`).join("\n")}
<tr><td style="padding:8px 0;font-weight:700">Total</td><td style="padding:8px 0;font-weight:700;text-align:right">${formatearPesos(pedido.total)}</td></tr>
</table>
<h2 style="font-size:16px;margin-top:24px">Lo enviamos a</h2>
<p>${h(pedido.nombre)}<br>${h(linea1)}<br>${h(linea2)}</p>
<h2 style="font-size:16px;margin-top:24px">¿Qué sigue?</h2>
<p>Tu pedido se produce especialmente para vos y te lo envía el fabricante a esa dirección. ${url ? `Podés ver en qué anda en <a href="${h(url)}">${h(url)}</a>.` : ""}</p>
<p>¿Alguna consulta? Respondé este mail: le llega a ${h(contacto.nombre)}.</p>
</div>`;

  const texto = [
    `¡Gracias por tu compra, ${pedido.nombre}!`,
    `Recibimos el pago de tu pedido #${numero(pedido.id)} en la tienda de ${banda.nombre}.`,
    "",
    ...renglones.map((r) => `- ${r.nombre} × ${r.cantidad}${r.variante ? ` (${r.variante})` : ""}: ${r.importe}`),
    ...filasEnvio.map(([t, m]) => `- ${t}: ${m}`),
    `Total: ${formatearPesos(pedido.total)}`,
    "",
    "Lo enviamos a:",
    pedido.nombre,
    linea1,
    linea2,
    "",
    "¿Qué sigue? Tu pedido se produce especialmente para vos y te lo envía el fabricante a esa dirección.",
    ...(url ? [`En qué anda: ${url}`] : []),
    `¿Alguna consulta? Respondé este mail: le llega a ${contacto.nombre}.`,
  ].join("\n");

  return { para: pedido.email, asunto: `Tu compra en ${banda.nombre} · pedido #${numero(pedido.id)}`, html, texto };
}

// ---------- Al proveedor ----------

/** Orden de producción para un proveedor: solo sus renglones. Sin montos de venta ni datos de pago. */
export async function correoAlProveedor(
  { pedido, banda }: Datos,
  contacto: Contacto,
  proveedor: { id: string; nombre: string; email: string },
  links: Map<string, string>,
) {
  const renglones = pedido.items.filter((i) => i.proveedorId === proveedor.id);
  const [linea1, linea2] = direccion(pedido);
  const urlPortal = `${origenPlataforma()}/portal/tienda`;
  const html = `<div style="${estilo}">
<h1 style="font-size:20px">Orden de producción #${numero(pedido.id)}</h1>
<p>Para <strong>${h(proveedor.nombre)}</strong>, de la tienda de <strong>${h(banda.nombre)}</strong> en Deoco. Producir y enviar:</p>
<table style="width:100%;border-collapse:collapse">
${renglones
  .map((i) => {
    const variante = describirVariante(i.variante as Record<string, string>);
    const link = links.get(i.producto.disenoId)!;
    return `<tr><td style="${celda}"><strong>${i.cantidad} × ${h(i.productoBase.nombre)}</strong>${variante ? ` · ${h(variante)}` : ""}<br>
<span style="font-size:14px">Producto de la banda: ${h(i.nombreProducto)}</span><br>
<span style="font-size:14px">Archivo de impresión: <a href="${h(link)}">${h(i.producto.diseno.archivoNombre)}</a> (${h(describirEspecificacion(i.productoBase))})</span></td></tr>`;
  })
  .join("\n")}
</table>
<p style="font-size:14px;color:#57534e">Los links de los archivos vencen a los ${VALIDEZ_LINK_IMPRESION / 86400} días. Si vencen, abrí la orden en tu panel de proveedor: ahí siempre hay uno nuevo. Ahí también la marcás despachada: <a href="${h(urlPortal)}">${h(urlPortal)}</a></p>
<h2 style="font-size:16px;margin-top:24px">Enviar a</h2>
<p>${h(pedido.nombre)}<br>${h(linea1)}<br>${h(linea2)}<br>Tel.: ${h(pedido.telefono)}</p>
<h2 style="font-size:16px;margin-top:24px">Contacto de la banda</h2>
<p>${h(contacto.nombre)}<br>${h(contacto.email)}${contacto.telefono ? `<br>Tel.: ${h(contacto.telefono)}` : ""}</p>
</div>`;

  const texto = [
    `Orden de producción #${numero(pedido.id)}`,
    `Para ${proveedor.nombre}, de la tienda de ${banda.nombre} en Deoco. Producir y enviar:`,
    "",
    ...renglones.map((i) => {
      const variante = describirVariante(i.variante as Record<string, string>);
      return `- ${i.cantidad} × ${i.productoBase.nombre}${variante ? ` · ${variante}` : ""} (producto de la banda: ${i.nombreProducto})\n  Archivo de impresión: ${links.get(i.producto.disenoId)} (${describirEspecificacion(i.productoBase)})`;
    }),
    "",
    `Los links de los archivos vencen a los ${VALIDEZ_LINK_IMPRESION / 86400} días. Si vencen, abrí la orden en tu panel de proveedor (ahí también la marcás despachada): ${urlPortal}`,
    "",
    "Enviar a:",
    pedido.nombre,
    linea1,
    linea2,
    `Tel.: ${pedido.telefono}`,
    "",
    "Contacto de la banda:",
    contacto.nombre,
    contacto.email,
    ...(contacto.telefono ? [`Tel.: ${contacto.telefono}`] : []),
  ].join("\n");

  return { para: proveedor.email, asunto: `Orden de producción #${numero(pedido.id)} · ${banda.nombre}`, html, texto };
}

/**
 * pedido.pagado → mail al fan + una orden por proveedor. Idempotente: cada mail con su clave
 * única (pedido + destinatario).
 */
export async function alPagarsePedido(evento: Evento) {
  const { pedidoId } = evento.payload as { pedidoId: string };
  const datos = await pedidoCompleto(evento.tenantId, pedidoId);
  const contacto = await contactoDeTienda(evento.tenantId);
  const responderA = contacto.email || undefined;

  await enviarCorreo(tienda, evento.tenantId, { ...correoAlFan(datos, contacto), responderA }, { unica: `pedido:${pedidoId}:fan` });

  const proveedorIds = [...new Set(datos.pedido.items.map((i) => i.proveedorId).filter((x): x is string => !!x))];
  const proveedores = await conTenant(evento.tenantId, (tx) => tx.tiendaProveedor.findMany({ where: { id: { in: proveedorIds } } }));
  // Un link por diseño (aunque varios renglones lo usen).
  const links = new Map<string, string>();
  for (const i of datos.pedido.items) {
    if (!links.has(i.producto.disenoId)) {
      links.set(i.producto.disenoId, await urlFirmada(tienda, evento.tenantId, i.producto.diseno.archivoId, { validoPorSegundos: VALIDEZ_LINK_IMPRESION }));
    }
  }
  for (const p of proveedores) {
    await enviarCorreo(
      tienda,
      evento.tenantId,
      { ...(await correoAlProveedor(datos, contacto, p, links)), responderA },
      { unica: `pedido:${pedidoId}:orden:${p.id}` },
    );
  }
}

// ---------- Al fan, cuando el proveedor despacha ----------

/** orden.despachada → mail al fan con lo que salió y el seguimiento. Una vez por orden. */
export async function alDespacharseOrden(evento: Evento) {
  const { ordenId } = evento.payload as { ordenId: string };
  const datos = await conTenant(evento.tenantId, async (tx) => {
    const orden = await tx.tiendaOrden.findUnique({ where: { id: ordenId } });
    if (!orden) return null;
    const pedido = await tx.tiendaPedido.findUniqueOrThrow({ where: { id: orden.pedidoId } });
    const items = await tx.tiendaPedidoItem.findMany({ where: { pedidoId: orden.pedidoId, proveedorId: orden.proveedorId }, orderBy: { nombreProducto: "asc" } });
    const otras = await tx.tiendaOrden.count({ where: { pedidoId: orden.pedidoId, NOT: { id: orden.id } } });
    const faltan = await tx.tiendaOrden.count({ where: { pedidoId: orden.pedidoId, NOT: { id: orden.id }, estado: "EN_PRODUCCION" } });
    const banda = await tx.tenant.findUniqueOrThrow({ where: { id: evento.tenantId }, select: { nombre: true } });
    const sitio = await origenDeBanda(evento.tenantId, { tx });
    return { orden, pedido, items, otras, faltan, banda, sitio };
  });
  if (!datos) return;
  const { orden, pedido, items, otras, faltan, banda, sitio } = datos;
  const contacto = await contactoDeTienda(evento.tenantId);
  const url = sitio ? `${sitio}/tienda/pedido/${pedido.id}#${pedido.token}` : null;
  const renglones = items.map((i) => {
    const variante = describirVariante(i.variante as Record<string, string>);
    return `${i.nombreProducto} × ${i.cantidad}${variante ? ` (${variante})` : ""}`;
  });
  const parte = faltan > 0 ? "Una parte de tu pedido" : otras > 0 ? "El resto de tu pedido" : "Tu pedido";
  const html = `<div style="${estilo}">
<h1 style="font-size:20px">${parte} ya salió</h1>
<p>${h(pedido.nombre)}, despacharon lo siguiente de tu pedido <strong>#${numero(pedido.id)}</strong> en la tienda de <strong>${h(banda.nombre)}</strong>:</p>
<ul>${renglones.map((r) => `<li>${h(r)}</li>`).join("")}</ul>
${orden.seguimiento ? `<p>Número de seguimiento: <strong>${h(orden.seguimiento)}</strong></p>` : "<p>El envío no tiene número de seguimiento.</p>"}
${faltan > 0 ? "<p>El resto de tu pedido sale por separado: te avisamos cuando se despache.</p>" : ""}
${url ? `<p>Tu pedido: <a href="${h(url)}">${h(url)}</a></p>` : ""}
<p>¿Alguna consulta? Respondé este mail: le llega a ${h(contacto.nombre)}.</p>
</div>`;
  const texto = [
    `${parte} ya salió`,
    `${pedido.nombre}, despacharon lo siguiente de tu pedido #${numero(pedido.id)} en la tienda de ${banda.nombre}:`,
    ...renglones.map((r) => `- ${r}`),
    "",
    orden.seguimiento ? `Número de seguimiento: ${orden.seguimiento}` : "El envío no tiene número de seguimiento.",
    ...(faltan > 0 ? ["El resto de tu pedido sale por separado: te avisamos cuando se despache."] : []),
    ...(url ? [`Tu pedido: ${url}`] : []),
    `¿Alguna consulta? Respondé este mail: le llega a ${contacto.nombre}.`,
  ].join("\n");
  await enviarCorreo(
    tienda,
    evento.tenantId,
    { para: pedido.email, asunto: `${parte} #${numero(pedido.id)} ya salió · ${banda.nombre}`, html, texto, responderA: contacto.email || undefined },
    { unica: `orden:${ordenId}:despachada` },
  );
}
