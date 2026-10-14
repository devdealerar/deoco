import sharp from "sharp";
import type { Page } from "playwright-core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { conStaffComo } from "@/nucleo/acceso/staff";
import { prenderModulo } from "@/nucleo/modulos/encendido";
import { type ComoStaff, crearProductoBase, crearProveedor, leerOpciones } from "../../modulos/tienda/catalogo";
import { crearProducto, subirDiseno } from "../../modulos/tienda/productos";
import { dueno, escenarioAcceso } from "../apoyo";
import { APP, captura, abrirNavegador, cerrarContextos, cerrarNavegador, logueado } from "./navegador";

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
let remeraId = "";

const png = (ancho: number, alto: number, dpi = 300) =>
  sharp({ create: { width: ancho, height: alto, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .withMetadata({ density: dpi })
    .png()
    .toBuffer();

async function tarjeta(page: Page, titulo: string | RegExp) {
  const form = page.locator("section", { has: page.getByRole("heading", { name: titulo }) }).locator("form[data-hidratado]").last();
  await form.waitFor();
  return form;
}

beforeAll(async () => {
  e = await escenarioAcceso();
  for (const t of ["tiendaPedidoItem", "tiendaPedido", "tiendaProducto", "tiendaDiseno", "tiendaProductoBase", "tiendaProveedor"] as const) {
    await (dueno[t] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  const comoStaff: ComoStaff = (accion, fn) => conStaffComo(e.staff.id, accion, fn);
  await crearProveedor(comoStaff, { nombre: "Estampados Sur", email: "ordenes@sur.com", contacto: "", formatos: ["png", "pdf"] });
  const remera = await crearProductoBase(comoStaff, {
    nombre: "Remera",
    descripcion: "Algodón peinado",
    opciones: leerOpciones("Talle: S, M, L, XL"),
    costoProduccion: 900000,
    costoEnvio: 350000,
    proveedorId: null,
    impresionAnchoPx: 4200,
    impresionAltoPx: 4800,
    impresionDpi: 300,
    impresionFormatos: ["png"],
  });
  remeraId = remera.id;
  await prenderModulo(e.staff.id, e.a.id, "tienda");
  await prenderModulo(e.staff.id, e.b.id, "tienda");
  await abrirNavegador();
});
afterEach(() => cerrarContextos());
afterAll(async () => {
  await cerrarNavegador();
  await dueno.moduloTenant.deleteMany({ where: { moduloId: "tienda" } });
  await dueno.$disconnect();
});

describe("panel de la tienda", () => {
  it("prueba 1: un diseño que no cumple se rechaza con el motivo exacto; el que cumple dice para qué sirve", async () => {
    const { page } = await logueado("multi@x.com"); // TITULAR en A
    await page.goto(`${APP}/b/banda-a`);
    await page.click('nav[aria-label="Panel"] a:text("Tienda")');
    await page.waitForURL(`${APP}/b/banda-a/tienda`);
    await page.click('nav[aria-label="Tienda"] a:has-text("Diseños")');
    await page.waitForURL(`${APP}/b/banda-a/tienda/disenos`);
    expect(await page.locator("[data-especificaciones]").textContent()).toContain("Remera · PNG · 4200×4800 px a 300 dpi (35,6×40,6 cm)");

    let form = await tarjeta(page, "Subir diseño");
    await form.locator('input[name="nombre"]').fill("Chico");
    await form.locator("select[name=paraBaseId]").selectOption({ label: "Remera" });
    await form.locator('input[name="archivo"]').setInputFiles({ name: "chico.png", mimeType: "image/png", buffer: await png(800, 800) });
    await form.getByRole("button", { name: "Subir" }).click();
    expect(await form.getByRole("alert").textContent()).toBe("Para Remera necesita 4200×4800 px, subiste 800×800 px.");

    form = await tarjeta(page, "Subir diseño");
    await form.locator('input[name="nombre"]').fill("Logo gira");
    await form.locator('input[name="archivo"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: await png(4200, 4800) });
    await form.getByRole("button", { name: "Subir" }).click();
    expect(await form.getByRole("status").textContent()).toBe('"Logo gira" subido.');
    const diseno = page.locator('[data-diseno="Logo gira"]');
    await diseno.waitFor();
    expect(await diseno.textContent()).toContain("PNG de 4200×4800 px · 300 dpi");
    expect(await diseno.locator('[data-compatible="Remera"]').count()).toBe(1);
    await captura(page, "tienda-disenos");
  });

  it("pruebas 2, 3 y 4: crea un producto (borrador), ve el margen, lo publica; a pérdida avisa y guarda", async () => {
    const { page } = await logueado("multi@x.com");
    await page.goto(`${APP}/b/banda-a/tienda/productos/nuevo`);
    await page.click('[data-base="Remera"]');
    await page.waitForURL(/\/tienda\/productos\/nuevo\?base=/);
    const form = await tarjeta(page, /^Nuevo producto · Remera/);
    await form.locator("select[name=disenoId]").selectOption({ label: "Logo gira" });
    await form.locator('input[name="nombre"]').fill("Remera Gira 2026");
    await form.locator('input[name="precio"]').fill("25.000");
    await form.getByText("XL", { exact: true }).click(); // no ofrece XL
    await form.getByRole("button", { name: "Crear (queda en borrador)" }).click();
    await page.waitForURL(/\/tienda\/productos\/[0-9a-f-]{36}\?creado=1$/);

    expect(await page.locator("[data-estado-producto]").textContent()).toContain("Borrador: no se ve en la tienda");
    const panelMargen = page.locator("[data-margen]");
    const texto = (await panelMargen.textContent())!.replace(/\s/g, " ");
    expect(texto).toContain("Precio de venta (lo que paga el fan por el producto)$ 25.000");
    expect(texto).toContain("Costo de producción− $ 9.000");
    expect(texto).toContain("El envío ($ 3.500) lo paga el fan aparte");
    expect((await panelMargen.locator("[data-valor-margen]").textContent())!.replace(/\s/g, " ")).toBe("$ 16.000 · 64%");
    expect(texto).toContain("Deoco no se lleva nada de la venta");
    const producto = await dueno.tiendaProducto.findFirstOrThrow({ where: { nombre: "Remera Gira 2026" } });
    expect(producto.variantes).toEqual([{ nombre: "Talle", valores: ["S", "M", "L"] }]);

    const publicar = page.locator("[data-publicar] form[data-hidratado]");
    await publicar.getByRole("button", { name: "Publicar" }).click();
    await page.locator("[data-estado-producto]").getByText("Publicado").waitFor();
    expect((await dueno.tiendaProducto.findUniqueOrThrow({ where: { id: producto.id } })).publicado).toBe(true);

    // A pérdida: avisa fuerte, pero guarda.
    const datos = await tarjeta(page, "Datos");
    await datos.locator('input[name="precio"]').fill("6500");
    await datos.getByRole("button", { name: "Guardar" }).click();
    expect((await datos.getByRole("status").textContent())!.replace(/\s/g, " ")).toBe(
      "Guardado. Atención: con este precio perdés $ 2.500 por cada venta.",
    );
    await page.locator("[data-margen-negativo]").waitFor();
    expect((await page.locator("[data-valor-margen]").textContent())!.replace(/\s/g, " ")).toBe("-$ 2.500 · -38,5%");
    expect((await dueno.tiendaProducto.findUniqueOrThrow({ where: { id: producto.id } })).precio).toBe(650000);
    await captura(page, "tienda-producto-a-perdida");
    await page.goto(`${APP}/b/banda-a/tienda`);
    await captura(page, "tienda-productos");
  });

  it("prueba 6: LECTURA ve la tienda pero no guarda (ni forzando el formulario)", async () => {
    const d = await subirDiseno(e.b.id, "Logo B", { nombre: "b.png", datos: await png(4200, 4800) });
    const p = await crearProducto(e.b.id, remeraId, { disenoId: d.id, nombre: "Remera B", descripcion: "", precio: 2000000, variantes: [{ nombre: "Talle", valores: ["M"] }] });
    const { page } = await logueado("ajeno@x.com"); // LECTURA en B
    await page.goto(`${APP}/b/banda-b/tienda`);
    expect(await page.getByText("Solo lectura").count()).toBe(1);
    expect(await page.getByRole("link", { name: "Nuevo producto" }).count()).toBe(0);
    await page.goto(`${APP}/b/banda-b/tienda/productos/${p.id}`);
    expect((await page.locator("[data-valor-margen]").textContent())!.replace(/\s/g, " ")).toBe("$ 11.000 · 55%");
    const datos = await tarjeta(page, "Datos");
    expect(await datos.getByRole("button", { name: "Guardar" }).isDisabled()).toBe(true);
    await datos.evaluate((f: HTMLFormElement) => {
      f.querySelectorAll<HTMLElement>("[disabled]").forEach((x) => x.removeAttribute("disabled"));
      (f.querySelector('input[name="precio"]') as HTMLInputElement).value = "1";
      f.requestSubmit();
    });
    expect(await datos.getByRole("alert").textContent()).toBe("Tu rol no puede editar la tienda.");
    expect((await dueno.tiendaProducto.findUniqueOrThrow({ where: { id: p.id } })).precio).toBe(2000000);
  });

  it("prueba 5: un producto base desactivado no aparece para productos nuevos", async () => {
    await dueno.tiendaProductoBase.update({ where: { id: remeraId }, data: { activo: false } });
    try {
      const { page } = await logueado("multi@x.com");
      await page.goto(`${APP}/b/banda-a/tienda/productos/nuevo`);
      expect(await page.locator('[data-base="Remera"]').count()).toBe(0);
      // Ni forzando la URL con su id.
      await page.goto(`${APP}/b/banda-a/tienda/productos/nuevo?base=${remeraId}`);
      expect(await page.getByRole("heading", { name: /^Nuevo producto · Remera/ }).count()).toBe(0);
    } finally {
      await dueno.tiendaProductoBase.update({ where: { id: remeraId }, data: { activo: true } });
    }
  });
});
