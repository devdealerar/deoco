import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { conStaffComo } from "@/nucleo/acceso/staff";
import { esperarCorreos } from "@/nucleo/correo";
import { prisma } from "@/nucleo/db/cliente";
import { esperarEventos } from "@/nucleo/eventos/bus";
import { guardarSecreto } from "@/nucleo/secretos/carga";
import tienda from "../modulos/tienda";
import { type ComoStaff, crearProductoBase, crearProveedor, guardarOferta, leerOpciones, ofertasDe } from "../modulos/tienda/catalogo";
import { registrarPago } from "../modulos/tienda/pagos";
import { crearPedido, type DatosFan, revisarCarrito } from "../modulos/tienda/pedidos";
import { actualizarProducto, crearProducto, duplicarProducto, margen, otrosProveedores, productoDe, publicarProducto, reasignarProveedor, subirDiseno } from "../modulos/tienda/productos";
import { dueno, escenarioAcceso } from "./apoyo";

// La banda elige el proveedor (documento maestro §7): un producto base tiene varias ofertas, una
// por proveedor, con su precio y su plazo. Lo vendido guarda proveedor y costo del momento.

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
let comoStaff: ComoStaff;
let base: { id: string };
let sur: { id: string };
let norte: { id: string };
let otro: { id: string };
const FAN: DatosFan = { nombre: "Lucía", email: "lucia@fan.com", telefono: "341 555-1234", calle: "Córdoba", numero: "1234", piso: "", ciudad: "Rosario", provincia: "Santa Fe", codigoPostal: "2000" };
const VARIANTES = [{ nombre: "Talle", valores: ["M"] }];
const png = () => sharp({ create: { width: 3000, height: 3000, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).withMetadata({ density: 300 }).png().toBuffer();

async function producto(proveedorId: string) {
  const d = await subirDiseno(e.a.id, "Logo", { nombre: "logo.png", datos: await png() });
  const p = await crearProducto(e.a.id, base.id, { disenoId: d.id, nombre: "Remera", descripcion: "", precio: 2500000, variantes: VARIANTES, proveedorId });
  await publicarProducto(e.a.id, p.id, true);
  return p;
}
async function pedidoPagado(productoId: string, cobro: string) {
  const pedido = await crearPedido(tienda, e.a.id, [{ productoId, variante: { Talle: "M" }, cantidad: 1 }], FAN);
  expect(await registrarPago(e.a.id, "mercadopago", { cobroId: cobro, estado: "aprobado", estadoPasarela: "approved", referencia: pedido.id, monto: pedido.total, moneda: "ARS" })).toBe("pagado");
  return pedido;
}

beforeAll(async () => {
  e = await escenarioAcceso();
  comoStaff = (accion, fn) => conStaffComo(e.staff.id, accion, fn);
  for (const t of ["tiendaOrden", "tiendaDeuda", "tiendaPedidoItem", "tiendaPedido", "tiendaProducto", "tiendaDiseno", "tiendaOferta", "tiendaProductoBase", "tiendaProveedor"] as const) {
    await (dueno[t] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  sur = await crearProveedor(comoStaff, { nombre: "Estampados Sur", email: "sur@x.com", contacto: "", formatos: ["png"] });
  norte = await crearProveedor(comoStaff, { nombre: "Taller Norte", email: "norte@x.com", contacto: "", formatos: ["png"] });
  otro = await crearProveedor(comoStaff, { nombre: "Sin ofertas", email: "otro@x.com", contacto: "", formatos: ["png"] });
  base = await crearProductoBase(comoStaff, {
    nombre: "Remera", descripcion: "", opciones: leerOpciones("Talle: M"), costoProduccion: 900000, costoEnvio: 350000, proveedorId: sur.id,
    impresionDpi: 300, impresionFormatos: ["png"], impresionAnchoPx: 3000, impresionAltoPx: 3000,
  });
  await guardarOferta(comoStaff, base.id, norte.id, { costoProduccion: 800000, costoEnvio: 400000, plazoDias: 10, activa: true });
});
beforeEach(async () => {
  await esperarEventos();
  await esperarCorreos();
  for (const t of ["tiendaOrden", "tiendaDeuda", "tiendaPedidoItem", "tiendaPedido", "tiendaProducto", "tiendaDiseno"] as const) {
    await (dueno[t] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await dueno.moduloTenant.deleteMany({ where: { tenantId: e.a.id, moduloId: "tienda" } });
  await dueno.moduloTenant.create({ data: { tenantId: e.a.id, moduloId: "tienda" } });
  await dueno.secreto.deleteMany();
  await guardarSecreto(e.multi.id, e.a.id, "pagos", "mercadopago_access_token", "APP_USR-AAAA");
  await guardarOferta(comoStaff, base.id, norte.id, { costoProduccion: 800000, costoEnvio: 400000, plazoDias: 10, activa: true });
});
afterAll(async () => {
  await esperarEventos();
  await esperarCorreos();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("la banda elige el proveedor", () => {
  it("ve los proveedores de ese producto base con precio y plazo", async () => {
    expect((await ofertasDe(base.id)).map((o) => [o.proveedor.nombre, o.costoProduccion, o.costoEnvio, o.plazoDias])).toEqual([
      ["Estampados Sur", 900000, 350000, 7],
      ["Taller Norte", 800000, 400000, 10],
    ]);
  });

  it("el elegido produce: su costo, su envío, su orden", async () => {
    const p = await producto(norte.id);
    expect(p.proveedorId).toBe(norte.id);
    expect((await revisarCarrito(e.a.id, [{ productoId: p.id, variante: { Talle: "M" }, cantidad: 1 }])).envio).toBe(400000);
    expect(margen(2500000, (await productoDe(e.a.id, p.id)).oferta).costoProduccion).toBe(800000);
    const pedido = await pedidoPagado(p.id, "c-1");
    const [item] = await dueno.tiendaPedidoItem.findMany({ where: { pedidoId: pedido.id } });
    expect([item.proveedorId, item.costoProduccion, item.costoEnvio]).toEqual([norte.id, 800000, 400000]);
    expect((await dueno.tiendaOrden.findMany({ where: { pedidoId: pedido.id } })).map((o) => o.proveedorId)).toEqual([norte.id]);
  });

  it("un proveedor que no ofrece ese producto base no se puede elegir", async () => {
    await expect(producto(otro.id)).rejects.toThrow(/no ofrece/);
  });

  it("con un pedido pagado el proveedor queda fijo: para cambiarlo se duplica", async () => {
    const p = await producto(sur.id);
    await pedidoPagado(p.id, "c-2");
    const datos = { disenoId: p.disenoId, nombre: p.nombre, descripcion: "", precio: p.precio, variantes: VARIANTES, proveedorId: norte.id };
    await expect(actualizarProducto(e.a.id, p.id, datos)).rejects.toThrow(/duplicá el producto/);
    const copia = await duplicarProducto(e.a.id, p.id);
    expect(copia.proveedorId).toBe(sur.id);
    await actualizarProducto(e.a.id, copia.id, { ...datos, nombre: copia.nombre });
    expect((await dueno.tiendaProducto.findUniqueOrThrow({ where: { id: copia.id } })).proveedorId).toBe(norte.id);
    // Sin ventas, cambiar de proveedor se puede.
    const nuevo = await producto(sur.id);
    await actualizarProducto(e.a.id, nuevo.id, { ...datos, disenoId: nuevo.disenoId });
    expect((await dueno.tiendaProducto.findUniqueOrThrow({ where: { id: nuevo.id } })).proveedorId).toBe(norte.id);
  });

  it("lo ya cobrado guarda el costo del momento; el costo nuevo rige para lo que viene", async () => {
    const p = await producto(norte.id);
    const viejo = await pedidoPagado(p.id, "c-3");
    await guardarOferta(comoStaff, base.id, norte.id, { costoProduccion: 850000, costoEnvio: 400000, plazoDias: 10, activa: true });
    const nuevo = await pedidoPagado(p.id, "c-4");
    const costo = async (pedidoId: string) => (await dueno.tiendaPedidoItem.findFirstOrThrow({ where: { pedidoId } })).costoProduccion;
    expect([await costo(viejo.id), await costo(nuevo.id)]).toEqual([800000, 850000]);
  });

  it("si un proveedor deja de ofrecerlo (3.2): sus productos se despublican; lo ya pagado se produce; la banda reasigna en un clic", async () => {
    const existente = await producto(norte.id);
    const pagado = await pedidoPagado(existente.id, "c-5");
    // Un pedido sin pagar de antes del cierre.
    const pendiente = await crearPedido(tienda, e.a.id, [{ productoId: existente.id, variante: { Talle: "M" }, cantidad: 1 }], FAN);
    const r = await guardarOferta(comoStaff, base.id, norte.id, { costoProduccion: 800000, costoEnvio: 400000, plazoDias: 10, activa: false });
    expect(r.despublicados).toBe(1);
    expect((await ofertasDe(base.id)).map((o) => o.proveedor.nombre)).toEqual(["Estampados Sur"]);
    await expect(producto(norte.id)).rejects.toThrow(/ya no ofrece/);
    // Despublicado y marcado; no se vende ni se puede volver a publicar con ese proveedor.
    expect(await dueno.tiendaProducto.findUniqueOrThrow({ where: { id: existente.id } })).toMatchObject({ publicado: false, sinOfertaDesde: expect.any(Date) });
    expect((await revisarCarrito(e.a.id, [{ productoId: existente.id, variante: { Talle: "M" }, cantidad: 1 }])).problemas).toHaveLength(1);
    await expect(publicarProducto(e.a.id, existente.id, true)).rejects.toThrow(/Taller Norte dejó de ofrecer Remera.*Elegí otro proveedor/);
    // Lo ya pagado se produce igual (con su orden al proveedor de entonces).
    expect((await dueno.tiendaOrden.findMany({ where: { pedidoId: pagado.id } })).map((o) => o.proveedorId)).toEqual([norte.id]);
    // El pedido sin pagar ya no se paga (producto fuera de venta: va a devolución si llega igual).
    expect(await registrarPago(e.a.id, "mercadopago", { cobroId: "c-6", estado: "aprobado", estadoPasarela: "approved", referencia: pendiente.id, monto: pendiente.total, moneda: "ARS" })).toBe("tardio");
    // La banda ve las otras ofertas con su costo y su margen, y reasigna en un clic (aunque tenga ventas).
    const otros = await otrosProveedores(e.a.id, existente.id);
    expect(otros.map((o) => [o.proveedor, o.costoProduccion, o.margen.margen])).toEqual([["Estampados Sur", 900000, 1600000]]);
    await reasignarProveedor(e.a.id, existente.id, sur.id);
    expect(await dueno.tiendaProducto.findUniqueOrThrow({ where: { id: existente.id } })).toMatchObject({ publicado: true, sinOfertaDesde: null, proveedorId: sur.id });
    // Si el producto base se discontinúa, lo mismo para todos sus productos.
    await dueno.tiendaProducto.updateMany({ data: { sinOfertaDesde: null } });
    const { actualizarProductoBase } = await import("../modulos/tienda/catalogo");
    const datosBase = await dueno.tiendaProductoBase.findUniqueOrThrow({ where: { id: base.id } });
    await actualizarProductoBase(comoStaff, base.id, { ...datosBase, opciones: leerOpciones("Talle: M"), activo: false });
    expect((await dueno.tiendaProducto.findUniqueOrThrow({ where: { id: existente.id } })).publicado).toBe(false);
    await expect(publicarProducto(e.a.id, existente.id, true)).rejects.toThrow(/se discontinuó/);
    await dueno.tiendaProductoBase.update({ where: { id: base.id }, data: { activo: true } });
  });
});
