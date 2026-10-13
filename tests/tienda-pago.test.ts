import { createHmac } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { conStaffComo } from "@/nucleo/acceso/staff";
import { atenderAviso, urlAviso } from "@/nucleo/avisos";
import { conTenant } from "@/nucleo/db/con-tenant";
import { prisma } from "@/nucleo/db/cliente";
import { esperarEventos } from "@/nucleo/eventos/bus";
import { guardarSecreto } from "@/nucleo/secretos/carga";
import tienda from "../modulos/tienda";
import { type ComoStaff, crearProductoBase, crearProveedor, leerOpciones } from "../modulos/tienda/catalogo";
import { verificarFirma } from "@/nucleo/archivos/firmados";
import { bandejaDeSalida, esperarCorreos, vaciarBandeja } from "@/nucleo/correo";
import { alPagarsePedido, VALIDEZ_LINK_IMPRESION } from "../modulos/tienda/correos";
import { guardarContacto } from "../modulos/tienda/contacto";
import { deudaDeBanda, deudaDeTodas, iniciarCobro, registrarPago } from "../modulos/tienda/pagos";
import { crearPedido, type DatosFan, revisarCarrito } from "../modulos/tienda/pedidos";
import { crearProducto, publicarProducto, subirDiseno } from "../modulos/tienda/productos";
import { dueno, escenarioAcceso } from "./apoyo";
import { MercadoPagoFalso } from "./mercadopago-falso";

const mp = new MercadoPagoFalso();
let e: Awaited<ReturnType<typeof escenarioAcceso>>;
let titularB = "";
let comoStaff: ComoStaff;
const TOKEN_A = "APP_USR-AAAA-token-de-la-banda-a";
const TOKEN_B = "APP_USR-BBBB-token-de-la-banda-b";
const FAN: DatosFan = {
  nombre: "Lucía Fan", email: "lucia@fan.com", telefono: "341 555-1234", calle: "Córdoba", numero: "1234",
  piso: "", ciudad: "Rosario", provincia: "Santa Fe", codigoPostal: "2000",
};
const ORIGEN = "https://banda-a.deoco.com";
let sur: { id: string };
let prensa: { id: string };
let remeraBase: { id: string };
let viniloBase: { id: string };

const png = (a: number, h: number) =>
  sharp({ create: { width: a, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).withMetadata({ density: 300 }).png().toBuffer();

async function productos(tenantId: string) {
  const d = await subirDiseno(tenantId, "Logo", { nombre: "logo.png", datos: await png(4200, 5000) });
  const remera = await crearProducto(tenantId, remeraBase.id, {
    disenoId: d.id, nombre: "Remera Gira", descripcion: "", precio: 2500000, variantes: [{ nombre: "Talle", valores: ["M"] }],
  });
  const vinilo = await crearProducto(tenantId, viniloBase.id, { disenoId: d.id, nombre: "Vinilo", descripcion: "", precio: 4000000, variantes: [] });
  await publicarProducto(tenantId, remera.id, true);
  await publicarProducto(tenantId, vinilo.id, true);
  return { remera, vinilo };
}

/** Pedido de A (2 remeras + 1 vinilo) con su cobro creado. */
async function pedidoDeA() {
  const { remera, vinilo } = await productos(e.a.id);
  const pedido = await crearPedido(tienda, e.a.id, [
    { productoId: remera.id, variante: { Talle: "M" }, cantidad: 2 },
    { productoId: vinilo.id, variante: {}, cantidad: 1 },
  ], FAN);
  const redireccion = await iniciarCobro(tienda, e.a.id, pedido.id, ORIGEN);
  return { pedido, redireccion };
}

/** Lo que manda Mercado Pago (webhook): solo el id; el resto se consulta a la API. */
const aviso = (tenantId: string, cuerpo: unknown, cabeceras: Record<string, string> = {}, query = "") =>
  atenderAviso(
    new Request(`http://app.deoco.com/avisos/${tenantId}/tienda/pago/mercadopago${query}`, {
      method: "POST",
      body: JSON.stringify(cuerpo),
      headers: { "content-type": "application/json", ...cabeceras },
    }),
    { tenantId, moduloId: "tienda", path: "/pago/mercadopago" },
  );
const avisoDePago = (tenantId: string, pagoId: string) => aviso(tenantId, { type: "payment", action: "payment.updated", data: { id: pagoId } });

/** Mercado Pago "aprueba" un pago en la cuenta de esa banda. */
const aprobar = (id: string, pedidoId: string, total: number, token = TOKEN_A, extra: Partial<{ status: string; currency_id: string }> = {}) =>
  mp.pagos.set(id, { status: "approved", external_reference: pedidoId, transaction_amount: total / 100, currency_id: "ARS", token, ...extra });

beforeAll(async () => {
  await mp.iniciar();
  process.env.DEOCO_MERCADOPAGO_API = mp.base;
  e = await escenarioAcceso();
  titularB = (await dueno.usuario.findUniqueOrThrow({ where: { email: "b@x.com" } })).id;
  comoStaff = (accion, fn) => conStaffComo(e.staff.id, accion, fn);
  for (const t of ["tiendaPagoExtra", "tiendaDeuda", "tiendaPedidoItem", "tiendaPedido", "tiendaProducto", "tiendaDiseno", "tiendaProductoBase", "tiendaProveedor"] as const) {
    await (dueno[t] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  sur = await crearProveedor(comoStaff, { nombre: "Estampados Sur", email: "ordenes@sur.com", contacto: "", formatos: ["png", "pdf"] });
  prensa = await crearProveedor(comoStaff, { nombre: "Prensa de Vinilos", email: "pedidos@vinilos.com", contacto: "", formatos: ["png", "pdf"] });
  const comun = { descripcion: "", impresionDpi: 300, impresionFormatos: ["png"], impresionAnchoPx: 3000, impresionAltoPx: 3000 };
  remeraBase = await crearProductoBase(comoStaff, { ...comun, nombre: "Remera", opciones: leerOpciones("Talle: M"), costoProduccion: 900000, costoEnvio: 350000, proveedorId: null });
  viniloBase = await crearProductoBase(comoStaff, { ...comun, nombre: "Vinilo", opciones: [], costoProduccion: 2000000, costoEnvio: 500000, proveedorId: prensa.id });
});
beforeEach(async () => {
  mp.limpiar();
  for (const t of ["tiendaPagoExtra", "tiendaDeuda", "tiendaPedidoItem", "tiendaPedido", "tiendaProducto", "tiendaDiseno"] as const) {
    await (dueno[t] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await dueno.evento.deleteMany();
  await dueno.correo.deleteMany();
  await dueno.tiendaPagoExtra.deleteMany();
  await dueno.tiendaConfig.deleteMany();
  vaciarBandeja();
  await dueno.secreto.deleteMany();
  await dueno.moduloTenant.deleteMany({ where: { moduloId: "tienda" } });
  await dueno.moduloTenant.createMany({ data: [{ tenantId: e.a.id, moduloId: "tienda" }, { tenantId: e.b.id, moduloId: "tienda" }] });
  await guardarSecreto(e.multi.id, e.a.id, "pagos", "mercadopago_access_token", TOKEN_A);
  await guardarSecreto(titularB, e.b.id, "pagos", "mercadopago_access_token", TOKEN_B);
});
afterAll(async () => {
  await esperarEventos();
  await dueno.moduloTenant.deleteMany({ where: { moduloId: "tienda" } });
  await mp.cerrar();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("prueba 1: el cobro se crea en la pasarela de esa banda, con su token", () => {
  it("preferencia con el token de A, renglones, envío, aviso y referencia; el fan va a su init_point", async () => {
    const { pedido, redireccion } = await pedidoDeA();
    const [pref] = mp.preferencias;
    expect(pref.token).toBe(TOKEN_A);
    expect(redireccion).toBe(`${mp.base}/checkout?pref=${pref.id}`);
    expect(pref.cuerpo).toMatchObject({
      items: [
        { title: "Remera Gira", quantity: 2, unit_price: 25000, currency_id: "ARS" },
        { title: "Vinilo", quantity: 1, unit_price: 40000, currency_id: "ARS" },
        // Dos proveedores, dos paquetes: un envío por cada uno.
        { title: "Envío de Remera Gira", quantity: 1, unit_price: 3500, currency_id: "ARS" },
        { title: "Envío de Vinilo", quantity: 1, unit_price: 5000, currency_id: "ARS" },
      ],
      payer: { name: "Lucía Fan", email: "lucia@fan.com" },
      external_reference: pedido.id,
      notification_url: urlAviso(e.a.id, tienda, "/pago/mercadopago"),
      back_urls: { success: `${ORIGEN}/tienda/pedido/${pedido.id}?resultado=exito` },
      auto_return: "approved",
    });
    expect(await dueno.tiendaPedido.findUniqueOrThrow({ where: { id: pedido.id } })).toMatchObject({
      pasarela: "mercadopago", preferenciaId: pref.id, urlPago: redireccion, estado: "PENDIENTE",
    });
  });

  it("la banda B cobra con el token de B", async () => {
    const { vinilo } = await productos(e.b.id);
    const pedido = await crearPedido(tienda, e.b.id, [{ productoId: vinilo.id, variante: {}, cantidad: 1 }], FAN);
    await iniciarCobro(tienda, e.b.id, pedido.id, "https://banda-b.deoco.com");
    expect(mp.preferencias.map((p) => p.token)).toEqual([TOKEN_B]);
  });
});

describe("prueba 2: el aviso marca PAGADO; repetido, no duplica nada", () => {
  it("consulta el pago a la API con el token de la banda; copia costos, deuda y evento una sola vez", async () => {
    const { pedido } = await pedidoDeA();
    aprobar("9001", pedido.id, pedido.total);
    const r = await avisoDePago(e.a.id, "9001");
    expect([r.status, await r.json()]).toEqual([200, { resultado: "pagado" }]);
    expect(mp.consultas).toEqual([{ token: TOKEN_A, ruta: "/v1/payments/9001" }]);
    expect(await dueno.tiendaPedido.findUniqueOrThrow({ where: { id: pedido.id } })).toMatchObject({ estado: "PAGADO", cobroId: "9001", estadoCobro: "approved" });

    for (let i = 0; i < 3; i++) expect(await (await avisoDePago(e.a.id, "9001")).json()).toEqual({ resultado: "ya-pagado" });
    const eventos = await dueno.evento.findMany({ where: { nombre: "pedido.pagado" } });
    expect(eventos.map((x) => [x.tenantId, x.claveUnica, x.payload])).toEqual([[e.a.id, "mercadopago:9001", { pedidoId: pedido.id }]]);
    expect(await dueno.tiendaDeuda.count()).toBe(2); // una por proveedor, no más
  });

  it("del cuerpo del aviso no se cree nada: lo que dice la API manda", async () => {
    const { pedido } = await pedidoDeA();
    aprobar("9002", pedido.id, pedido.total, TOKEN_A, { status: "rejected" });
    // El aviso "dice" approved y el monto; da igual.
    const r = await aviso(e.a.id, { type: "payment", data: { id: "9002" }, status: "approved", transaction_amount: pedido.total / 100 });
    expect(await r.json()).toEqual({ resultado: "no-aprobado" });
    expect(await dueno.tiendaPedido.findUniqueOrThrow({ where: { id: pedido.id } })).toMatchObject({ estado: "PENDIENTE", estadoCobro: "rejected" });
    // Un pago que la API no conoce (inventado): error, la pasarela reintentaría; nada cambia.
    expect((await avisoDePago(e.a.id, "123456")).status).toBe(500);
    expect(await dueno.tiendaDeuda.count()).toBe(0);
  });

  it("formato IPN (?topic=payment&id=…) también; un aviso que no es de pago se ignora", async () => {
    const { pedido } = await pedidoDeA();
    aprobar("9003", pedido.id, pedido.total);
    expect(await (await aviso(e.a.id, {}, {}, "?topic=payment&id=9003")).json()).toEqual({ resultado: "pagado" });
    expect(await (await aviso(e.a.id, { type: "merchant_order", data: { id: "77" } })).text()).toBe("ignorado");
  });

  it("el pago de un pedido de B no se registra en A (ni con la cuenta de A)", async () => {
    const { vinilo } = await productos(e.b.id);
    const deB = await crearPedido(tienda, e.b.id, [{ productoId: vinilo.id, variante: {}, cantidad: 1 }], FAN);
    aprobar("9004", deB.id, deB.total, TOKEN_A); // un pago en la cuenta de A que apunta al pedido de B
    expect(await (await avisoDePago(e.a.id, "9004")).json()).toEqual({ resultado: "ajeno" });
    expect((await dueno.tiendaPedido.findUniqueOrThrow({ where: { id: deB.id } })).estado).toBe("PENDIENTE");
    // Y el aviso al endpoint de B no ve ese pago (es de la cuenta de A): no pasa nada.
    expect((await avisoDePago(e.b.id, "9004")).status).toBe(500);
    expect((await dueno.tiendaPedido.findUniqueOrThrow({ where: { id: deB.id } })).estado).toBe("PENDIENTE");
  });

  it("con la clave de webhooks cargada, la firma se verifica", async () => {
    const { pedido } = await pedidoDeA();
    await guardarSecreto(e.multi.id, e.a.id, "pagos", "mercadopago_secreto_avisos", "secreto-de-webhooks-de-la-banda");
    aprobar("9005", pedido.id, pedido.total);
    const firmar = (id: string, ts: string, req: string) =>
      createHmac("sha256", "secreto-de-webhooks-de-la-banda").update(`id:${id};request-id:${req};ts:${ts};`).digest("hex");
    const malo = await aviso(e.a.id, { type: "payment", data: { id: "9005" } }, { "x-signature": "ts=1,v1=00", "x-request-id": "r1" }, "?data.id=9005&type=payment");
    expect(malo.status).toBe(401);
    const bueno = await aviso(
      e.a.id,
      { type: "payment", data: { id: "9005" } },
      { "x-signature": `ts=1700000000,v1=${firmar("9005", "1700000000", "r1")}`, "x-request-id": "r1" },
      "?data.id=9005&type=payment",
    );
    expect(await bueno.json()).toEqual({ resultado: "pagado" });
  });

  it("si la banda no tiene la pasarela conectada, 409", async () => {
    await dueno.secreto.deleteMany({ where: { tenantId: e.a.id } });
    expect((await avisoDePago(e.a.id, "1")).status).toBe(409);
  });
});

describe("prueba 3: monto o moneda distintos no marcan pagado", () => {
  it("queda EN_REVISION con la observación; sin deuda ni evento", async () => {
    const { pedido } = await pedidoDeA();
    aprobar("9010", pedido.id, pedido.total - 100); // un peso menos
    expect(await (await avisoDePago(e.a.id, "9010")).json()).toEqual({ resultado: "en-revision" });
    const p = await dueno.tiendaPedido.findUniqueOrThrow({ where: { id: pedido.id } });
    expect(p.estado).toBe("EN_REVISION");
    expect(p.observacion).toMatch(/aprobó ARS \d+\.\d{2} \(cobro 9010\) y el pedido es de ARS/);
    expect(await dueno.tiendaDeuda.count()).toBe(0);
    expect(await dueno.evento.count({ where: { nombre: "pedido.pagado" } })).toBe(0);

    const otro = await pedidoDeA();
    aprobar("9011", otro.pedido.id, otro.pedido.total, TOKEN_A, { currency_id: "USD" });
    expect(await (await avisoDePago(e.a.id, "9011")).json()).toEqual({ resultado: "en-revision" });
  });
});

describe("prueba 4: deuda con el proveedor al pagarse, sin duplicar", () => {
  it("producción de sus renglones + un envío por proveedor; acumulada por proveedor; el staff la ve por banda", async () => {
    const { pedido } = await pedidoDeA();
    aprobar("9020", pedido.id, pedido.total);
    await avisoDePago(e.a.id, "9020");
    await avisoDePago(e.a.id, "9020");
    const deudas = await conTenant(e.a.id, (tx) => tx.tiendaDeuda.findMany({ orderBy: { total: "asc" } }));
    // Sur (remeras): 2 × 9.000 + envío 3.500 = 21.500. Prensa (vinilo): 20.000 + envío 5.000 = 25.000.
    expect(deudas.map((d) => [d.proveedorId, d.produccion, d.envio, d.total])).toEqual([
      [sur.id, 1800000, 350000, 2150000],
      [prensa.id, 2000000, 500000, 2500000],
    ]);
    // Los renglones guardaron su copia.
    const items = await conTenant(e.a.id, (tx) => tx.tiendaPedidoItem.findMany({ where: { pedidoId: pedido.id }, orderBy: { nombreProducto: "asc" } }));
    expect(items.map((i) => [i.nombreProducto, i.costoProduccion, i.costoEnvio, i.proveedorId])).toEqual([
      ["Remera Gira", 900000, 350000, sur.id],
      ["Vinilo", 2000000, 500000, prensa.id],
    ]);

    const otro = await pedidoDeA();
    aprobar("9021", otro.pedido.id, otro.pedido.total);
    await avisoDePago(e.a.id, "9021");
    expect((await deudaDeBanda(e.a.id)).map((d) => [d.proveedor, d.pendiente, d.pedidosPendientes])).toEqual([
      ["Prensa de Vinilos", 5000000, 2],
      ["Estampados Sur", 4300000, 2],
    ]);
    expect(await deudaDeBanda(e.b.id)).toEqual([]); // B no ve la de A

    const staff = await conStaffComo(e.staff.id, "tienda.deudas_consultadas", (tx) => deudaDeTodas(tx));
    expect(staff.map((s) => [s.banda.slug, s.proveedores.map((p) => [p.proveedor, p.pendiente])])).toEqual([
      ["banda-a", [["Prensa de Vinilos", 5000000], ["Estampados Sur", 4300000]]],
    ]);
    // Fuera de conStaff, la app no ve deudas sin banda.
    expect(await prisma.tiendaDeuda.count()).toBe(0);
  });
});

describe("envío: uno por proveedor (el mayor de sus renglones)", () => {
  it("un solo proveedor: un envío; dos proveedores: dos, desglosados", async () => {
    const { remera, vinilo } = await productos(e.a.id);
    const soloRemeras = await revisarCarrito(e.a.id, [{ productoId: remera.id, variante: { Talle: "M" }, cantidad: 3 }]);
    expect([soloRemeras.envio, soloRemeras.envios.length, soloRemeras.total]).toEqual([350000, 1, 7850000]);
    const dos = await revisarCarrito(e.a.id, [
      { productoId: remera.id, variante: { Talle: "M" }, cantidad: 2 },
      { productoId: vinilo.id, variante: {}, cantidad: 1 },
    ]);
    // 2 × 25.000 + 40.000 = 90.000; envíos: Sur 3.500 + Prensa 5.000 = 8.500; total 98.500
    expect(dos.envios.map((x) => [x.proveedorId, x.monto, x.productos])).toEqual([
      [sur.id, 350000, ["Remera Gira"]],
      [prensa.id, 500000, ["Vinilo"]],
    ]);
    expect([dos.subtotal, dos.envio, dos.total]).toEqual([9000000, 850000, 9850000]);
    const pedido = await crearPedido(tienda, e.a.id, [
      { productoId: remera.id, variante: { Talle: "M" }, cantidad: 2 },
      { productoId: vinilo.id, variante: {}, cantidad: 1 },
    ], FAN);
    expect(pedido).toMatchObject({ envio: 850000, total: 9850000 });
  });
});

/** Paga el pedido de A por el aviso y espera evento y mails. */
async function pagar(pedido: { id: string; total: number }, pagoId: string) {
  aprobar(pagoId, pedido.id, pedido.total);
  const r = await (await avisoDePago(e.a.id, pagoId)).json();
  await esperarEventos();
  await esperarCorreos();
  return r;
}

describe("mails al pagarse (pruebas 1 a 5)", () => {
  it("1 y 2: un mail al fan y una orden por proveedor, cada una con lo suyo", async () => {
    await guardarContacto(e.a.id, { nombre: "Los Satélites", email: "tienda@banda-a.com", telefono: "341 600-0000" });
    const { pedido } = await pedidoDeA();
    expect(await pagar(pedido, "9100")).toEqual({ resultado: "pagado" });
    const mails = [...bandejaDeSalida()].sort((x, y) => x.para.localeCompare(y.para));
    expect(mails.map((m) => [m.para, m.de.nombre, m.responderA])).toEqual([
      ["lucia@fan.com", "Banda A", "tienda@banda-a.com"],
      ["ordenes@sur.com", "Banda A", "tienda@banda-a.com"],
      ["pedidos@vinilos.com", "Banda A", "tienda@banda-a.com"],
    ]);
    const [fan, sur_, vinilos] = mails;
    expect(fan.asunto).toMatch(/^Tu compra en Banda A · pedido #[0-9A-F]{8}$/);
    for (const t of ["Remera Gira × 2", "Talle: M", "Vinilo × 1", "Envío de Remera Gira", "Envío de Vinilo", "$ 98.500", "Córdoba 1234", "Rosario, Santa Fe (2000)", "se produce especialmente para vos"]) {
      expect(fan.texto.replace(/\s/g, " ")).toContain(t);
    }
    // Cada orden, solo lo suyo.
    expect(sur_.asunto).toMatch(/^Orden de producción #[0-9A-F]{8} · Banda A$/);
    expect(sur_.texto).toContain("2 × Remera · Talle: M (producto de la banda: Remera Gira)");
    expect(sur_.texto).not.toContain("Vinilo");
    expect(vinilos.texto).toContain("1 × Vinilo (producto de la banda: Vinilo)");
    expect(vinilos.texto).not.toContain("Remera");
    for (const o of [sur_, vinilos]) {
      for (const t of ["Lucía Fan", "Córdoba 1234", "Tel.: 341 555-1234", "Los Satélites", "tienda@banda-a.com", "Tel.: 341 600-0000"]) expect(o.texto).toContain(t);
    }
  });

  it("3: el aviso repetido (y un reproceso del evento) no manda nada dos veces", async () => {
    const { pedido } = await pedidoDeA();
    await pagar(pedido, "9110");
    await pagar(pedido, "9110");
    await alPagarsePedido({ id: "x", nombre: "pedido.pagado", tenantId: e.a.id, usuarioId: null, fecha: new Date(), payload: { pedidoId: pedido.id } });
    await esperarCorreos();
    expect(bandejaDeSalida()).toHaveLength(3);
    expect(await dueno.correo.count()).toBe(3);
  });

  it("4: el link del archivo de impresión es el diseño de esa banda, firmado, y vence", async () => {
    const { pedido } = await pedidoDeA();
    await pagar(pedido, "9120");
    const orden = bandejaDeSalida().find((m) => m.para === "ordenes@sur.com")!;
    const href = /href="([^"]+\/descargas\/[^"]+)"/.exec(orden.html)![1].replace(/&amp;/g, "&");
    const u = new URL(href);
    const [, , tenant, archivo] = u.pathname.split("/");
    const diseno = await conTenant(e.a.id, (tx) => tx.tiendaDiseno.findFirstOrThrow());
    expect([tenant, archivo]).toEqual([e.a.id, diseno.archivoId]);
    const vence = Number(u.searchParams.get("vence"));
    expect(vence * 1000 - Date.now()).toBeGreaterThan((VALIDEZ_LINK_IMPRESION - 60) * 1000);
    expect(verificarFirma(tenant, archivo, u.searchParams.get("vence"), u.searchParams.get("firma"))).toBe("ok");
    expect(verificarFirma(tenant, archivo, u.searchParams.get("vence"), u.searchParams.get("firma"), new Date((vence + 1) * 1000))).toBe("vencido");
  });

  it("5: la orden al proveedor no tiene montos de venta ni datos de pago", async () => {
    const { pedido } = await pedidoDeA();
    await pagar(pedido, "9130");
    for (const o of bandejaDeSalida().filter((m) => m.para !== "lucia@fan.com")) {
      for (const contenido of [o.texto, o.html]) {
        expect(contenido).not.toMatch(/\$\s?\d/); // ningún monto en pesos
        expect(contenido).not.toMatch(/25\.000|40\.000|98\.500|9130|pago|mercado/i);
        expect(contenido).not.toContain("lucia@fan.com"); // tampoco el mail del fan
      }
    }
  });

  it("sin contacto cargado, responder-a es el mail de un titular de la banda", async () => {
    const { pedido } = await pedidoDeA();
    await pagar(pedido, "9140");
    const fan = bandejaDeSalida().find((m) => m.para === "lucia@fan.com")!;
    expect(["a@x.com", "multi@x.com"]).toContain(fan.responderA);
  });
});

describe("prueba 6: pago duplicado", () => {
  it("otro pago aprobado para un pedido pagado: se registra, el pedido no cambia, nada se duplica", async () => {
    const { pedido } = await pedidoDeA();
    await pagar(pedido, "9200");
    aprobar("9201", pedido.id, pedido.total);
    expect(await (await avisoDePago(e.a.id, "9201")).json()).toEqual({ resultado: "duplicado" });
    expect(await (await avisoDePago(e.a.id, "9201")).json()).toEqual({ resultado: "duplicado" }); // repetido: una fila
    await esperarEventos();
    await esperarCorreos();
    const extras = await conTenant(e.a.id, (tx) => tx.tiendaPagoExtra.findMany());
    expect(extras.map((x) => [x.pedidoId, x.cobroId, x.monto, x.moneda, x.pasarela])).toEqual([[pedido.id, "9201", pedido.total, "ARS", "mercadopago"]]);
    expect(await dueno.tiendaPedido.findUniqueOrThrow({ where: { id: pedido.id } })).toMatchObject({ estado: "PAGADO", cobroId: "9200" });
    expect(await dueno.tiendaDeuda.count()).toBe(2);
    expect(await dueno.evento.count({ where: { nombre: "pedido.pagado" } })).toBe(1);
    expect(bandejaDeSalida()).toHaveLength(3);
    // Un pago que no está aprobado, para un pedido pagado, no se registra como extra.
    expect(await registrarPago(e.a.id, "mercadopago", { cobroId: "9202", estado: "rechazado", estadoPasarela: "rejected", referencia: pedido.id, monto: 1, moneda: "ARS" })).toBe("ya-pagado");
    expect(await dueno.tiendaPagoExtra.count()).toBe(1);
  });
});
