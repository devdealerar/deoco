import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { conStaffComo } from "@/nucleo/acceso/staff";
import { prenderModulo } from "@/nucleo/modulos/encendido";
import { guardarSecreto } from "@/nucleo/secretos/carga";
import { type ComoStaff, crearProductoBase, crearProveedor, leerOpciones } from "../../modulos/tienda/catalogo";
import { actualizarProducto, crearProducto, publicarProducto, subirDiseno } from "../../modulos/tienda/productos";
import { dueno, escenarioAcceso } from "../apoyo";
import { APP, abrirNavegador, anonimo, cerrarContextos, cerrarNavegador, dominiosDeDesarrollo, logueado, sitio } from "./navegador";

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
const SITIO = sitio("banda-a");
let remera: Awaited<ReturnType<typeof crearProducto>>;
let poster: Awaited<ReturnType<typeof crearProducto>>;
let borrador: Awaited<ReturnType<typeof crearProducto>>;
const TALLES = [{ nombre: "Talle", valores: ["S", "M", "L"] }];
const TOKEN = () => guardarSecreto(e.multi.id, e.a.id, "tienda", "mercadopago_access_token", "APP_USR-1234567890-token-de-prueba");

const png = (a: number, h: number) =>
  sharp({ create: { width: a, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).withMetadata({ density: 300 }).png().toBuffer();
const plano = async (l: import("playwright-core").Locator) => ((await l.textContent()) ?? "").replace(/\s/g, " ");

beforeAll(async () => {
  e = await escenarioAcceso();
  await dominiosDeDesarrollo(e.a, e.b);
  for (const t of ["tiendaPedidoItem", "tiendaPedido", "tiendaProducto", "tiendaDiseno", "tiendaProductoBase", "tiendaProveedor"] as const) {
    await (dueno[t] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  const comoStaff: ComoStaff = (accion, fn) => conStaffComo(e.staff.id, accion, fn);
  await crearProveedor(comoStaff, { nombre: "Sur", email: "o@sur.com", contacto: "", formatos: ["png", "pdf"] });
  const comun = { descripcion: "", proveedorId: null, impresionDpi: 300, impresionFormatos: ["png"] };
  const remeraBase = await crearProductoBase(comoStaff, {
    ...comun, nombre: "Remera", opciones: leerOpciones("Talle: S, M, L, XL"), costoProduccion: 900000, costoEnvio: 350000, impresionAnchoPx: 4200, impresionAltoPx: 4800,
  });
  const posterBase = await crearProductoBase(comoStaff, {
    ...comun, nombre: "Poster", opciones: [], costoProduccion: 450000, costoEnvio: 300000, impresionAnchoPx: 3508, impresionAltoPx: 4961,
  });
  for (const m of ["sitio", "tienda"]) await prenderModulo(e.staff.id, e.a.id, m);
  await prenderModulo(e.staff.id, e.b.id, "tienda");
  const d = await subirDiseno(e.a.id, "Logo", { nombre: "logo.png", datos: await png(4200, 5000) });
  remera = await crearProducto(e.a.id, remeraBase.id, { disenoId: d.id, nombre: "Remera Gira", descripcion: "Algodón", precio: 2500000, variantes: TALLES });
  poster = await crearProducto(e.a.id, posterBase.id, { disenoId: d.id, nombre: "Poster Gira", descripcion: "", precio: 1500000, variantes: [] });
  borrador = await crearProducto(e.a.id, posterBase.id, { disenoId: d.id, nombre: "Poster Secreto", descripcion: "", precio: 1000000, variantes: [] });
  await publicarProducto(e.a.id, remera.id, true);
  await publicarProducto(e.a.id, poster.id, true);
  await TOKEN();
  await abrirNavegador();
});
afterEach(() => cerrarContextos());
afterAll(async () => {
  await cerrarNavegador();
  await dueno.moduloTenant.deleteMany({ where: { moduloId: { in: ["tienda", "sitio"] } } });
  await dueno.$disconnect();
});

describe("tienda pública", () => {
  it("pruebas 1 y 6: pestaña Tienda en el marco de la banda; solo publicados; carrito en la cabecera; total con envíos", async () => {
    const { page } = await anonimo();
    await page.goto(SITIO);
    await page.click('nav[aria-label="Sitio"] a:text("Tienda")');
    await page.waitForURL(`${SITIO}/tienda`);
    expect(await page.locator("nav[aria-label=Sitio] a[aria-current=page]").textContent()).toBe("Tienda");
    expect((await page.locator("[data-producto]").allTextContents()).map((t) => t.replace(/\s/g, " "))).toEqual([
      "Poster Gira$ 15.000",
      "Remera Gira$ 25.000",
    ]);
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
    // 2 × 25.000 + 15.000 = 65.000; envíos 2 × 3.500 + 3.000 = 10.000; total 75.000
    expect(await plano(page.locator("[data-subtotal]"))).toBe("$ 65.000");
    expect(await plano(page.locator("[data-envio]"))).toBe("$ 10.000");
    expect(await plano(page.locator("[data-total]"))).toBe("$ 75.000");

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
    await f.getByRole("button", { name: "Confirmar pedido" }).click();
    await page.waitForURL(new RegExp(`${SITIO}/tienda/pedido/[0-9a-f-]{36}$`));
    expect(await page.locator("[data-estado-pedido]").getAttribute("data-estado-pedido")).toBe("PENDIENTE");
    await page.locator("header [data-carrito='0']").waitFor(); // se vació

    const pedido = await dueno.tiendaPedido.findFirstOrThrow({ include: { items: { orderBy: { nombreProducto: "asc" } } } });
    expect(pedido).toMatchObject({ tenantId: e.a.id, estado: "PENDIENTE", subtotal: 6500000, envio: 1000000, total: 7500000, nombre: "Lucía Fan" });
    expect(pedido.items.map((i) => [i.nombreProducto, i.cantidad, i.precioUnitario, i.envioUnitario, i.variante])).toEqual([
      ["Poster Gira", 1, 1500000, 300000, {}],
      ["Remera Gira", 2, 2500000, 350000, { Talle: "M" }],
    ]);

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
      expect(await page.getByRole("button", { name: "Confirmar pedido" }).isDisabled()).toBe(true);
      await page.goto(`${SITIO}/tienda/carrito`);
      await page.locator("[data-problemas]").waitFor();
      expect(await page.getByText("Ir a pagar").count()).toBe(0);
    } finally {
      await publicarProducto(e.a.id, poster.id, true);
    }
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
    } finally {
      await TOKEN();
    }
  });
});
