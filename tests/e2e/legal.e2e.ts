import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { dueno, escenarioAcceso } from "../apoyo";
import { APP, abrirNavegador, anonimo, captura, cerrarContextos, cerrarNavegador, dominiosDeDesarrollo, logueado, sitio } from "./navegador";

// D2 de punta a punta: el aviso de cookies y el pie legal en el sitio de la banda, el canal del
// fan para sus datos, y la aceptación de los documentos de Deoco en el panel.

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
beforeAll(async () => {
  e = await escenarioAcceso();
  await dominiosDeDesarrollo(e.a, e.b);
  await abrirNavegador();
});
afterEach(() => cerrarContextos());
afterAll(async () => {
  await cerrarNavegador();
  await dueno.$disconnect();
});

describe("sitio de la banda", () => {
  it("aviso de cookies: rechazar es tan fácil como aceptar, queda registrado y se puede cambiar desde el pie", async () => {
    const { page } = await anonimo();
    await page.goto(sitio("banda-a"));
    const aviso = page.locator("[data-aviso-cookies]");
    await aviso.waitFor();
    await captura(page, "aviso-cookies");
    await aviso.getByRole("button", { name: "Solo las necesarias" }).click();
    await aviso.waitFor({ state: "detached" });
    for (let i = 0; i < 50 && (await dueno.consentimientoCookies.count({ where: { tenantId: e.a.id } })) === 0; i++) await new Promise((r) => setTimeout(r, 100));
    expect(await dueno.consentimientoCookies.findFirstOrThrow({ where: { tenantId: e.a.id } })).toMatchObject({ analitica: false, marketing: false });
    await page.reload();
    expect(await page.locator("[data-aviso-cookies]").count()).toBe(0);
    // Preferencias desde el pie: lo reabre para cambiar o revocar.
    await page.locator("[data-preferencias-cookies]").click();
    await page.locator("[data-aviso-cookies]").locator('input[name="analitica"]').check();
    await page.locator("[data-aviso-cookies]").getByRole("button", { name: "Guardar mi elección" }).click();
    for (let i = 0; i < 50 && (await dueno.consentimientoCookies.count({ where: { tenantId: e.a.id } })) < 2; i++) await new Promise((r) => setTimeout(r, 100));
    expect(await dueno.consentimientoCookies.findFirstOrThrow({ where: { tenantId: e.a.id }, orderBy: { creadoEn: "desc" } })).toMatchObject({ analitica: true, marketing: false });
  });

  it("el pie lleva a la política, los términos y el canal de datos; el fan pide y recibe el mail de confirmación", async () => {
    const { page } = await anonimo();
    await page.goto(sitio("banda-a"));
    await page.locator("[data-pie-legal]").getByRole("link", { name: "Privacidad" }).click();
    await page.waitForURL(`${sitio("banda-a")}/privacidad`);
    expect(await page.locator("[data-texto-legal] h1").textContent()).toBe("Política de privacidad de Banda A");
    expect(await page.locator("[data-texto-legal]").textContent()).toContain("Órgano de Control de la Ley N° 25.326");
    expect((await page.goto(`${sitio("banda-a")}/terminos`))!.status()).toBe(200);
    await page.goto(`${sitio("banda-a")}/datos-personales`);
    const form = page.locator("[data-formulario-datos]");
    await form.getByText("Borrar mis datos").click();
    await form.locator('input[name="email"]').fill("fan@x.com");
    await form.getByRole("button", { name: "Enviar" }).click();
    await page.locator("[data-pedido-enviado]").waitFor();
    expect(await dueno.pedidoDatos.findFirstOrThrow({ where: { tenantId: e.a.id, email: "fan@x.com" } })).toMatchObject({ tipo: "supresion", estado: "sin-verificar" });
  });

  it("con el sitio suspendido, lo legal sigue abierto (la home no)", async () => {
    await dueno.tenant.update({ where: { id: e.a.id }, data: { estado: "SUSPENDIDO" } });
    try {
      const { page } = await anonimo();
      expect((await page.goto(sitio("banda-a")))!.status()).toBe(404);
      expect((await page.goto(`${sitio("banda-a")}/datos-personales`))!.status()).toBe(200);
      expect((await page.goto(`${sitio("banda-a")}/privacidad`))!.status()).toBe(200);
    } finally {
      await dueno.tenant.update({ where: { id: e.a.id }, data: { estado: "ACTIVO" } });
    }
  });
});

describe("panel", () => {
  it("el titular ve arriba que falta aceptar los documentos de Deoco, los acepta y queda registrado", async () => {
    await dueno.aceptacionLegal.deleteMany({ where: { tenantId: e.a.id } }).catch(() => undefined);
    const { page } = await logueado("multi@x.com");
    await page.goto(`${APP}/b/banda-a`);
    await page.getByTestId("aviso-aceptar").getByRole("link", { name: "Leer y aceptar" }).click();
    await page.waitForURL(`${APP}/b/banda-a/legal`);
    const form = page.getByTestId("aceptacion").locator("form[data-hidratado]");
    await form.waitFor();
    await form.getByText("Leí y acepto").click();
    await form.getByRole("button", { name: "Aceptar" }).click();
    for (let i = 0; i < 50 && (await dueno.aceptacionLegal.count({ where: { tenantId: e.a.id } })) < 2; i++) await new Promise((r) => setTimeout(r, 100));
    expect(await dueno.aceptacionLegal.count({ where: { tenantId: e.a.id, usuarioId: e.multi.id } })).toBe(2);
    await page.goto(`${APP}/b/banda-a`);
    expect(await page.getByTestId("aviso-aceptar").count()).toBe(0);
    // El editor no ve Legal.
    const editor = (await logueado("editor-a@x.com")).page;
    expect((await editor.goto(`${APP}/b/banda-a/legal`))!.status()).toBe(403);
  });
});
