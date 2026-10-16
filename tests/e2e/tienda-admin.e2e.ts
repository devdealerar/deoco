import sharp from "sharp";
import type { Page } from "playwright-core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { conTenant } from "@/nucleo/db/con-tenant";
import { dueno, escenarioAcceso } from "../apoyo";
import { APP, abrirNavegador, cerrarContextos, cerrarNavegador, logueado } from "./navegador";

let e: Awaited<ReturnType<typeof escenarioAcceso>>;

beforeAll(async () => {
  e = await escenarioAcceso();
  await dueno.tiendaPedidoItem.deleteMany();
  await dueno.tiendaPedido.deleteMany();
  await dueno.tiendaProducto.deleteMany();
  await dueno.tiendaDiseno.deleteMany();
  await dueno.tiendaOferta.deleteMany();
  await dueno.tiendaProductoBase.deleteMany();
  await dueno.tiendaProveedor.deleteMany();
  await abrirNavegador();
});
afterEach(() => cerrarContextos());
afterAll(async () => {
  await cerrarNavegador();
  await dueno.$disconnect();
});

/** Tarjeta con su formulario (ya hidratado). */
async function formulario(page: Page, titulo: string) {
  const form = page.locator("section", { has: page.getByRole("heading", { name: titulo }) }).locator("form[data-hidratado]").last();
  await form.waitFor();
  return form;
}

describe("back office de la tienda: proveedores y catálogo base", () => {
  it("el staff carga un proveedor y un producto base con foto; queda auditado", async () => {
    const { page } = await logueado("staff@deocoartist.com");
    await page.goto(`${APP}/admin`);
    await page.click('nav[aria-label="Back office"] a:text("Proveedores")');
    await page.waitForURL(`${APP}/admin/m/tienda/proveedores`);

    let form = await formulario(page, "Nuevo proveedor");
    await form.locator('input[name="nombre"]').fill("Estampados Sur");
    await form.locator('input[name="email"]').fill("ordenes@estampadossur.com");
    await form.locator('input[name="contacto"]').fill("Ana");
    await form.getByRole("button", { name: "Cargar proveedor" }).click();
    expect(await form.getByRole("status").textContent()).toBe("Estampados Sur cargado (es el proveedor por defecto).");
    expect(await page.locator('[data-proveedor="Estampados Sur"]').locator("xpath=ancestor::tr").textContent()).toContain("Por defecto");

    await page.click('nav[aria-label="Back office"] a:text("Catálogo base")');
    await page.waitForURL(`${APP}/admin/m/tienda`);
    form = await formulario(page, "Nuevo producto base");
    await form.locator('input[name="nombre"]').fill("Remera");
    await form.locator('textarea[name="opciones"]').fill("Talle: S, M, L, XL\nColor: Negro, Blanco");
    await form.locator('input[name="costoProduccion"]').fill("9.000");
    await form.locator('input[name="costoEnvio"]').fill("3500");
    await form.locator('input[name="impresionAnchoPx"]').fill("4200");
    await form.locator('input[name="impresionAltoPx"]').fill("4800");
    await form.locator('input[name="foto"]').setInputFiles({
      name: "remera.png",
      mimeType: "image/png",
      buffer: await sharp({ create: { width: 800, height: 800, channels: 3, background: "#333" } }).png().toBuffer(),
    });
    await form.getByRole("button", { name: "Agregar al catálogo" }).click();
    expect(await form.getByRole("status").textContent()).toBe('"Remera" agregado al catálogo.');

    const fila = page.locator('[data-producto-base="Remera"]').locator("xpath=ancestor::tr");
    const texto = (await fila.textContent())!.replace(/\s/g, " ");
    expect(texto).toContain("$ 9.000 · $ 3.500");
    expect(texto).toContain("Estampados Sur");
    expect(texto).toContain("4200×4800 px · 300 dpi · PNG");
    // La foto es un archivo de la plataforma, servido como imagen liviana.
    const src = (await fila.locator("img").getAttribute("src"))!;
    expect(src).toMatch(/^\/archivos\/plataforma\/[0-9a-f-]{36}\/remera\.png\?v=web$/);
    const img = await page.evaluate(async (u) => (await fetch(u)).headers.get("content-type"), src);
    expect(img).toBe("image/webp");

    const acciones = (await dueno.auditoria.findMany({ where: { usuarioId: e.staff.id }, orderBy: { fecha: "asc" } })).map((a) => a.accion);
    expect(acciones).toEqual(expect.arrayContaining(["tienda.proveedor_creado", "tienda.producto_base_creado"]));
  });

  it("en uso no se borra (el mensaje lo dice) y se desactiva; el costo nuevo queda guardado", async () => {
    const base = await dueno.tiendaProductoBase.findFirstOrThrow({ where: { nombre: "Remera" } });
    const oferta = await dueno.tiendaOferta.findFirstOrThrow({ where: { productoBaseId: base.id } });
    await conTenant(e.a.id, async (tx) => {
      const diseno = await tx.tiendaDiseno.create({
        data: { tenantId: e.a.id, nombre: "Logo", archivoId: crypto.randomUUID(), archivoNombre: "logo.png", formato: "png", anchoPx: 4200, altoPx: 4800, dpi: 300 },
      });
      await tx.tiendaProducto.create({ data: { tenantId: e.a.id, productoBaseId: base.id, proveedorId: oferta.proveedorId, disenoId: diseno.id, nombre: "Remera A", precio: 2500000 } });
    });
    const { page } = await logueado("staff@deocoartist.com");
    await page.goto(`${APP}/admin/m/tienda`);
    await formulario(page, "Nuevo producto base"); // hidratada: el clic lo toma el router
    await page.click('[data-producto-base="Remera"]');
    await page.waitForURL(`${APP}/admin/m/tienda/productos/${base.id}`);

    const borrar = await formulario(page, "Borrar");
    await borrar.getByText("Confirmo borrarlo").click();
    await borrar.getByRole("button", { name: "Borrar" }).click();
    expect(await borrar.getByRole("alert").textContent()).toMatch(/^Hay bandas que lo usan: no se puede borrar\. Desactivalo/);

    // El costo es de la oferta de cada proveedor.
    const deSur = await formulario(page, "Estampados Sur");
    await deSur.locator('input[name="costoProduccion"]').fill("12000");
    await deSur.getByRole("button", { name: "Guardar oferta" }).click();
    expect(await deSur.getByRole("status").textContent()).toMatch(/^Oferta guardada\. Lo ya cobrado conserva sus costos/);
    expect(await dueno.tiendaOferta.findUniqueOrThrow({ where: { id: oferta.id } })).toMatchObject({ costoProduccion: 1200000, activa: true });

    const datos = await formulario(page, "Datos");
    await datos.getByText("Activo (se puede usar en productos nuevos)").click(); // destildar
    await datos.getByRole("button", { name: "Guardar" }).click();
    expect(await datos.getByRole("status").textContent()).toBe("Guardado.");
    expect(await dueno.tiendaProductoBase.findUniqueOrThrow({ where: { id: base.id } })).toMatchObject({ activo: false });
  });

  it("nadie más entra: una banda (aun titular) recibe 404", async () => {
    const { page } = await logueado("multi@x.com");
    expect((await page.goto(`${APP}/admin/m/tienda`))!.status()).toBe(404);
    expect((await page.goto(`${APP}/admin/m/tienda/proveedores`))!.status()).toBe(404);
  });
});
