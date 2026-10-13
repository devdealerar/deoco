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
import { deudaDeBanda, deudaDeTodas, iniciarCobro, saldarDeudas } from "../modulos/tienda/pagos";
import { crearPedido, type DatosFan } from "../modulos/tienda/pedidos";
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
  for (const t of ["tiendaDeuda", "tiendaPedidoItem", "tiendaPedido", "tiendaProducto", "tiendaDiseno", "tiendaProductoBase", "tiendaProveedor"] as const) {
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
  for (const t of ["tiendaDeuda", "tiendaPedidoItem", "tiendaPedido", "tiendaProducto", "tiendaDiseno"] as const) {
    await (dueno[t] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await dueno.evento.deleteMany();
  await dueno.secreto.deleteMany();
  await dueno.moduloTenant.deleteMany({ where: { moduloId: "tienda" } });
  await dueno.moduloTenant.createMany({ data: [{ tenantId: e.a.id, moduloId: "tienda" }, { tenantId: e.b.id, moduloId: "tienda" }] });
  await guardarSecreto(e.multi.id, e.a.id, "tienda", "mercadopago_access_token", TOKEN_A);
  await guardarSecreto(titularB, e.b.id, "tienda", "mercadopago_access_token", TOKEN_B);
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
        { title: "Envío", quantity: 1, unit_price: 5000, currency_id: "ARS" }, // un envío: el mayor
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
    await guardarSecreto(e.multi.id, e.a.id, "tienda", "mercadopago_secreto_avisos", "secreto-de-webhooks-de-la-banda");
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

  it("saldar: quién y cuándo, solo una vez", async () => {
    const { pedido } = await pedidoDeA();
    aprobar("9030", pedido.id, pedido.total);
    await avisoDePago(e.a.id, "9030");
    const [sur1] = await conTenant(e.a.id, (tx) => tx.tiendaDeuda.findMany({ where: { proveedorId: sur.id } }));
    expect(await saldarDeudas(e.a.id, [sur1.id], e.multi.id, "Transferencia del 3/11")).toBe(1);
    expect(await saldarDeudas(e.a.id, [sur1.id], e.editorA.id, "otra")).toBe(0); // no se pisa
    const saldada = await dueno.tiendaDeuda.findUniqueOrThrow({ where: { id: sur1.id } });
    expect(saldada).toMatchObject({ saldadaPor: e.multi.id, notaSaldo: "Transferencia del 3/11" });
    expect(saldada.saldadaEn).toBeInstanceOf(Date);
    expect((await deudaDeBanda(e.a.id)).find((d) => d.proveedor === "Estampados Sur")).toMatchObject({ pendiente: 0, saldado: 2150000 });
  });
});
