import { request } from "node:http";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { conStaffComo } from "@/nucleo/acceso/staff";
import { prenderModulo } from "@/nucleo/modulos/encendido";
import { guardarSecreto } from "@/nucleo/secretos/carga";
import { type ComoStaff, crearProductoBase, crearProveedor, leerOpciones } from "../../modulos/tienda/catalogo";
import { actualizarProducto, crearProducto, publicarProducto, subirDiseno } from "../../modulos/tienda/productos";
import { dueno, escenarioAcceso } from "../apoyo";
import { MercadoPagoFalso } from "../mercadopago-falso";
import { APP, abrirNavegador, captura, anonimo, cerrarContextos, cerrarNavegador, dominiosDeDesarrollo, logueado, sitio } from "./navegador";
import { PUERTO, PUERTO_MP } from "./servidor";

const mp = new MercadoPagoFalso();
const TOKEN_A = "APP_USR-1234567890-token-de-prueba";

/** GET crudo al servidor de pruebas, con el Host que elijamos. */
function bajar(host: string, path: string) {
  return new Promise<{ estado: number; tipo: string }>((ok, mal) => {
    const r = request({ host: "127.0.0.1", port: PUERTO, path, headers: { host: `${host}:${PUERTO}` } }, (res) => {
      res.resume();
      res.on("end", () => ok({ estado: res.statusCode!, tipo: String(res.headers["content-type"]) }));
    });
    r.on("error", mal);
    r.end();
  });
}

/** POST crudo al servidor de pruebas (lo que haría Mercado Pago con el aviso). */
function postear(host: string, path: string, cuerpo: string) {
  return new Promise<{ estado: number; cuerpo: string }>((ok, mal) => {
    const r = request({ host: "127.0.0.1", port: PUERTO, path, method: "POST", headers: { host: `${host}:${PUERTO}`, "content-type": "application/json" } }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => ok({ estado: res.statusCode!, cuerpo: d }));
    });
    r.on("error", mal);
    r.end(cuerpo);
  });
}

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
const SITIO = sitio("banda-a");
let remera: Awaited<ReturnType<typeof crearProducto>>;
let poster: Awaited<ReturnType<typeof crearProducto>>;
let borrador: Awaited<ReturnType<typeof crearProducto>>;
let vinilo: Awaited<ReturnType<typeof crearProducto>>;
const TALLES = [{ nombre: "Talle", valores: ["S", "M", "L"] }];
const TOKEN = () => guardarSecreto(e.multi.id, e.a.id, "pagos", "mercadopago_access_token", TOKEN_A);

const png = (a: number, h: number) =>
  sharp({ create: { width: a, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).withMetadata({ density: 300 }).png().toBuffer();
const plano = async (l: import("playwright-core").Locator) => ((await l.textContent()) ?? "").replace(/\s/g, " ");

beforeAll(async () => {
  await mp.iniciar(PUERTO_MP);
  mp.cuentas.set(TOKEN_A, { nickname: "LOSSATELITES", email: "cobros@banda-a.com" });
  e = await escenarioAcceso();
  await dominiosDeDesarrollo(e.a, e.b);
  await dueno.correo.deleteMany();
  for (const t of ["tiendaDeuda", "tiendaPedidoItem", "tiendaPedido", "tiendaProducto", "tiendaDiseno", "tiendaProductoBase", "tiendaProveedor"] as const) {
    await (dueno[t] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  const comoStaff: ComoStaff = (accion, fn) => conStaffComo(e.staff.id, accion, fn);
  await crearProveedor(comoStaff, { nombre: "Sur", email: "o@sur.com", contacto: "", formatos: ["png", "pdf"] });
  const prensa = await crearProveedor(comoStaff, { nombre: "Prensa", email: "o@prensa.com", contacto: "", formatos: ["png", "pdf"] });
  const comun = { descripcion: "", proveedorId: null, impresionDpi: 300, impresionFormatos: ["png"] };
  const remeraBase = await crearProductoBase(comoStaff, {
    ...comun, nombre: "Remera", opciones: leerOpciones("Talle: S, M, L, XL"), costoProduccion: 900000, costoEnvio: 350000, impresionAnchoPx: 4200, impresionAltoPx: 4800,
  });
  const posterBase = await crearProductoBase(comoStaff, {
    ...comun, nombre: "Poster", opciones: [], costoProduccion: 450000, costoEnvio: 300000, impresionAnchoPx: 3508, impresionAltoPx: 4961,
  });
  const viniloBase = await crearProductoBase(comoStaff, {
    ...comun, nombre: "Vinilo", opciones: [], costoProduccion: 2000000, costoEnvio: 500000, impresionAnchoPx: 3508, impresionAltoPx: 3508, proveedorId: prensa.id,
  });
  for (const m of ["sitio", "tienda"]) await prenderModulo(e.staff.id, e.a.id, m);
  await prenderModulo(e.staff.id, e.b.id, "tienda");
  const d = await subirDiseno(e.a.id, "Logo", { nombre: "logo.png", datos: await png(4200, 5000) });
  remera = await crearProducto(e.a.id, remeraBase.id, { disenoId: d.id, nombre: "Remera Gira", descripcion: "Algodón", precio: 2500000, variantes: TALLES });
  poster = await crearProducto(e.a.id, posterBase.id, { disenoId: d.id, nombre: "Poster Gira", descripcion: "", precio: 1500000, variantes: [] });
  borrador = await crearProducto(e.a.id, posterBase.id, { disenoId: d.id, nombre: "Poster Secreto", descripcion: "", precio: 1000000, variantes: [] });
  vinilo = await crearProducto(e.a.id, viniloBase.id, { disenoId: d.id, nombre: "Vinilo Gira", descripcion: "", precio: 4000000, variantes: [] });
  await publicarProducto(e.a.id, remera.id, true);
  await publicarProducto(e.a.id, poster.id, true);
  await TOKEN();
  await abrirNavegador();
});
afterEach(() => cerrarContextos());
afterAll(async () => {
  await cerrarNavegador();
  await mp.cerrar();
  await dueno.moduloTenant.deleteMany({ where: { moduloId: { in: ["tienda", "sitio"] } } });
  await dueno.$disconnect();
});

describe("tienda pública", () => {
  it("del catálogo a la pasarela de la banda, el aviso y la deuda: solo publicados, total con un envío, PAGADO una vez", async () => {
    const { page } = await anonimo();
    await page.goto(SITIO);
    await page.click('nav[aria-label="Sitio"] a:text("Tienda")');
    await page.waitForURL(`${SITIO}/tienda`);
    expect(await page.locator("nav[aria-label=Sitio] a[aria-current=page]").textContent()).toBe("Tienda");
    expect((await page.locator("[data-producto]").allTextContents()).map((t) => t.replace(/\s/g, " "))).toEqual([
      "Poster Gira$ 15.000",
      "Remera Gira$ 25.000",
    ]); // el vinilo está en borrador (se publica en su prueba)
    expect(await page.title()).toBe("Tienda · Banda A");

    // Ficha: sin talle elegido, no agrega.
    await page.click('[data-producto="Remera Gira"] a');
    await page.waitForURL(`${SITIO}/tienda/${remera.id}`);
    const agregar = page.getByRole("button", { name: "Agregar al carrito" });
    expect(await agregar.isDisabled()).toBe(true);
    expect(await page.locator("[data-falta]").textContent()).toBe("Elegí talle.");
    await page.getByRole("button", { name: "M", exact: true }).click();
    await page.locator("select[name=cantidad]").selectOption("2");
    await agregar.click();
    await page.locator("header [data-carrito='2']").waitFor();

    await page.goto(`${SITIO}/tienda/${poster.id}`);
    await page.getByRole("button", { name: "Agregar al carrito" }).click();
    await page.locator("header [data-carrito='3']").waitFor();
    expect(await page.locator("header [data-cabecera] a").textContent()).toBe("Carrito (3)");

    await page.goto(`${SITIO}/tienda/carrito`);
    await page.locator("[data-total]").waitFor();
    // Prueba 6: 2 × 25.000 + 15.000 = 65.000; un envío, el mayor: 3.500; total 68.500
    expect(await plano(page.locator("[data-subtotal]"))).toBe("$ 65.000");
    expect(await plano(page.locator("[data-envio]"))).toBe("$ 3.500");
    expect(await plano(page.locator("[data-total]"))).toBe("$ 68.500");

    // Checkout → pedido PENDIENTE con su copia de precios.
    await page.click("text=Ir a pagar");
    await page.waitForURL(`${SITIO}/tienda/checkout`);
    const f = page.locator("form[data-checkout]");
    await f.locator("[data-total]").waitFor();
    await f.locator("input[name=nombre]").fill("Lucía Fan");
    await f.locator("input[name=email]").fill("lucia@fan.com");
    await f.locator("input[name=telefono]").fill("341 555-1234");
    await f.locator("input[name=calle]").fill("Córdoba");
    await f.locator("input[name=numero]").fill("1234");
    await f.locator("input[name=ciudad]").fill("Rosario");
    await f.locator("select[name=provincia]").selectOption("Santa Fe");
    await f.locator("input[name=codigoPostal]").fill("2000");
    await f.getByRole("button", { name: "Confirmar y pagar" }).click();
    // Prueba 1 (pago): el fan va a la pasarela de la banda, con el cobro creado con SU token.
    await page.waitForURL(new RegExp(`^${mp.base}/checkout\\?pref=pref-1$`));
    expect(await page.locator("[data-pasarela]").textContent()).toBe("Pagá con Mercado Pago");
    expect(mp.preferencias.map((p) => p.token)).toEqual([TOKEN_A]);

    const pedido = await dueno.tiendaPedido.findFirstOrThrow({ include: { items: { orderBy: { nombreProducto: "asc" } } } });
    expect(pedido).toMatchObject({ tenantId: e.a.id, estado: "PENDIENTE", subtotal: 6500000, envio: 350000, total: 6850000, nombre: "Lucía Fan" });
    expect(pedido.items.map((i) => [i.nombreProducto, i.cantidad, i.precioUnitario, i.variante])).toEqual([
      ["Poster Gira", 1, 1500000, {}],
      ["Remera Gira", 2, 2500000, { Talle: "M" }],
    ]);
    expect(mp.preferencias[0].cuerpo).toMatchObject({ external_reference: pedido.id });

    // Vuelve de la pasarela antes de que llegue el aviso: "estamos confirmando".
    await page.goto(`${SITIO}/tienda/pedido/${pedido.id}?resultado=exito`);
    expect(await page.locator("[data-titulo-estado]").textContent()).toBe("Estamos confirmando tu pago");
    await page.locator("header [data-carrito='0']").waitFor(); // el carrito se vació
    // La pasarela no recibió el token del pedido; otro navegador sin el link del mail solo ve el estado.
    expect(JSON.stringify(mp.preferencias[0].cuerpo)).not.toContain(pedido.token);
    const ajeno = (await anonimo()).page;
    await ajeno.goto(`${SITIO}/tienda/pedido/${pedido.id}`);
    await ajeno.locator("[data-sin-acceso]").waitFor();
    expect(await ajeno.locator("[data-total]").count()).toBe(0);

    // Prueba 2 (pago): llega el aviso de Mercado Pago (a la plataforma) → PAGADO; repetido, nada.
    mp.pagos.set("777", { status: "approved", external_reference: pedido.id, transaction_amount: 68500, currency_id: "ARS", token: TOKEN_A });
    const avisoPath = `/avisos/${e.a.id}/tienda/pago/mercadopago`;
    const cuerpo = JSON.stringify({ type: "payment", data: { id: "777" } });
    expect(JSON.parse((await postear("app.lvh.me", avisoPath, cuerpo)).cuerpo)).toEqual({ resultado: "pagado" });
    expect(JSON.parse((await postear("app.lvh.me", avisoPath, cuerpo)).cuerpo)).toEqual({ resultado: "ya-pagado" });
    // La página se actualiza sola mientras confirma.
    await page.locator("[data-titulo-estado]", { hasText: "¡Pago recibido!" }).waitFor({ timeout: 15000 });

    // La banda lo ve en su panel: pedido pagado y deuda con el proveedor (un paquete: un envío).
    const { page: panel } = await logueado("multi@x.com");
    await panel.goto(`${APP}/b/banda-a/tienda/pedidos`);
    expect(await panel.locator(`[data-estado="PAGADO"]`).count()).toBe(1);
    expect(await plano(panel.locator("[data-estado=PAGADO]"))).toContain("Pagado · en producción");
    await panel.goto(`${APP}/b/banda-a/tienda/deuda`);
    // Sur: 2 × 9.000 + 4.500 de producción + 3.500 de envío = 26.000
    expect(await plano(panel.locator('[data-deuda="Sur"] [data-pendiente]'))).toBe("$ 26.000");
    await captura(panel, "tienda-deuda");
    // Y el titular prueba la conexión: a nombre de quién cobra.
    await panel.goto(`${APP}/b/banda-a/tienda`);
    const probar = panel.locator("section", { has: panel.getByRole("heading", { name: "Cobro con Mercado Pago" }) }).locator("form[data-hidratado]");
    await probar.getByRole("button", { name: "Probar conexión" }).click();
    expect(await probar.getByRole("status").textContent()).toBe(
      "Conectada: los pagos entran a la cuenta de Mercado Pago LOSSATELITES · cobros@banda-a.com.",
    );

    // Los mails salieron (en desarrollo, transporte en memoria): al fan y la orden a Sur.
    const correos = await dueno.correo.findMany({ where: { tenantId: e.a.id }, orderBy: { para: "asc" } });
    expect(correos.map((c) => [c.para, c.estado])).toEqual([
      ["lucia@fan.com", "ENVIADO"],
      ["o@sur.com", "ENVIADO"],
    ]);
    // El link del archivo de impresión de la orden funciona sin sesión (y no está en el sitio de la banda).
    const href = /href="([^"]+\/descargas\/[^"]+)"/.exec(correos[1].html)![1].replace(/&amp;/g, "&");
    const archivo = await bajar("app.lvh.me", new URL(href).pathname + new URL(href).search);
    expect([archivo.estado, archivo.tipo]).toEqual([200, "image/png"]);
    expect((await bajar("banda-a.lvh.me", new URL(href).pathname + new URL(href).search)).estado).toBe(404);

    // Prueba 6 (mails): el fan pagó dos veces → el segundo pago queda registrado y la banda lo ve.
    mp.pagos.set("778", { status: "approved", external_reference: pedido.id, transaction_amount: 68500, currency_id: "ARS", token: TOKEN_A });
    expect(JSON.parse((await postear("app.lvh.me", avisoPath, JSON.stringify({ type: "payment", data: { id: "778" } }))).cuerpo)).toEqual({
      resultado: "duplicado",
    });
    await panel.goto(`${APP}/b/banda-a/tienda/pedidos`);
    expect(await plano(panel.locator("[data-aviso-duplicados]"))).toContain("Un fan pagó dos veces el mismo pedido");
    expect(await plano(panel.locator('[data-pago-duplicado="778"]'))).toContain("Pago duplicado: $ 68.500 (pago 778 en Mercado Pago)");
    await captura(panel, "tienda-pedidos-duplicado");
    expect(await dueno.correo.count()).toBe(2); // ni mails ni deuda de más

    // El staff la ve en el back office, por banda y por proveedor.
    const { page: staff } = await logueado("staff@deoco.com");
    await staff.goto(`${APP}/admin/m/tienda/deudas`);
    expect(await plano(staff.locator('[data-banda="banda-a"] [data-deuda="Sur"] [data-pendiente]'))).toBe("$ 26.000");

    // El borrador no existe en la tienda, ni por URL.
    expect((await page.goto(`${SITIO}/tienda/${borrador.id}`))!.status()).toBe(404);
  });

  it("prueba 3: precio cambiado en el panel → el carrito viejo toma el nuevo", async () => {
    const { page } = await anonimo();
    await page.goto(`${SITIO}/tienda/${remera.id}`);
    await page.getByRole("button", { name: "S", exact: true }).click();
    await page.getByRole("button", { name: "Agregar al carrito" }).click();
    await page.locator("header [data-carrito='1']").waitFor();

    await actualizarProducto(e.a.id, remera.id, { disenoId: remera.disenoId, nombre: "Remera Gira", descripcion: "", precio: 2800000, variantes: TALLES });
    try {
      await page.goto(`${SITIO}/tienda/checkout`);
      await page.locator("[data-total]").waitFor();
      expect(await plano(page.locator("[data-problemas]").first())).toBe('El precio de "Remera Gira" cambió: ahora es $ 28.000.');
      expect(await plano(page.locator("[data-subtotal]"))).toBe("$ 28.000");
      expect(await plano(page.locator("[data-total]"))).toBe("$ 31.500");
    } finally {
      await actualizarProducto(e.a.id, remera.id, { disenoId: remera.disenoId, nombre: "Remera Gira", descripcion: "Algodón", precio: 2500000, variantes: TALLES });
    }
  });

  it("prueba 4: despublicado mientras estaba en el carrito → aviso y no deja seguir", async () => {
    const { page } = await anonimo();
    await page.goto(`${SITIO}/tienda/${poster.id}`);
    await page.getByRole("button", { name: "Agregar al carrito" }).click();
    await page.locator("header [data-carrito='1']").waitFor();
    await publicarProducto(e.a.id, poster.id, false);
    try {
      await page.goto(`${SITIO}/tienda/checkout`);
      const problemas = page.locator("[data-problemas]");
      await problemas.waitFor();
      expect(await plano(problemas)).toBe('"Poster Gira" ya no está a la venta: sacalo del carrito para seguir.');
      expect(await page.getByRole("button", { name: "Confirmar y pagar" }).isDisabled()).toBe(true);
      await page.goto(`${SITIO}/tienda/carrito`);
      await page.locator("[data-problemas]").waitFor();
      expect(await page.getByText("Ir a pagar").count()).toBe(0);
    } finally {
      await publicarProducto(e.a.id, poster.id, true);
    }
  });

  it("envío por proveedor: con dos proveedores, el checkout lo desglosa", async () => {
    await publicarProducto(e.a.id, vinilo.id, true);
    const { page } = await anonimo();
    await page.goto(`${SITIO}/tienda/${remera.id}`);
    await page.getByRole("button", { name: "L", exact: true }).click();
    await page.getByRole("button", { name: "Agregar al carrito" }).click();
    await page.locator("header [data-carrito='1']").waitFor();
    await page.goto(`${SITIO}/tienda/${vinilo.id}`);
    await page.getByRole("button", { name: "Agregar al carrito" }).click();
    await page.locator("header [data-carrito='2']").waitFor();
    await page.goto(`${SITIO}/tienda/checkout`);
    await page.locator("[data-total]").waitFor();
    expect((await page.locator("[data-envio-proveedor]").allTextContents()).map((t) => t.replace(/\s/g, " "))).toEqual([
      "Envío de Remera Gira$ 3.500",
      "Envío de Vinilo Gira$ 5.000",
    ]);
    expect(await plano(page.locator("[data-envio]"))).toBe("$ 8.500");
    // 25.000 + 40.000 + 8.500
    expect(await plano(page.locator("[data-total]"))).toBe("$ 73.500");
    await publicarProducto(e.a.id, vinilo.id, false);
  });

  it("prueba 2: el producto de A no existe en la tienda de B", async () => {
    const { page } = await anonimo();
    expect((await page.goto(`${sitio("banda-b")}/tienda/${remera.id}`))!.status()).toBe(404);
    await page.goto(`${sitio("banda-b")}/tienda`);
    expect(await page.locator("[data-producto]").count()).toBe(0);
  });

  it("prueba 5: sin credenciales, el fan ve que no se puede comprar y la banda lo ve en su panel", async () => {
    await dueno.secreto.deleteMany({ where: { tenantId: e.a.id } });
    try {
      const { page } = await anonimo();
      await page.goto(`${SITIO}/tienda`);
      expect(await page.locator("[data-tienda-no-disponible]").textContent()).toContain("La tienda no está recibiendo pedidos");
      await page.goto(`${SITIO}/tienda/${poster.id}`);
      expect(await page.getByRole("button", { name: "Agregar al carrito" }).isDisabled()).toBe(true);

      const { page: panel } = await logueado("multi@x.com");
      await panel.goto(`${APP}/b/banda-a/tienda`);
      const aviso = panel.locator("[data-tienda-sin-pasarela]");
      expect(await plano(aviso)).toContain("Tu tienda no puede vender todavía.");
      expect(await plano(aviso)).toContain("Falta cargar Mercado Pago · Access token en Credenciales");
      expect(await aviso.getByRole("link", { name: "Credenciales" }).getAttribute("href")).toBe("/b/banda-a/credenciales");
      await captura(panel, "tienda-sin-pasarela");
    } finally {
      await TOKEN();
    }
  });
});
