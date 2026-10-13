import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { apagarModulo, prenderModulo } from "@/nucleo/modulos/encendido";
import { prisma } from "@/nucleo/db/cliente";
import { dueno, escenarioAcceso } from "../apoyo";
import {
  APP,
  abrirNavegador,
  anonimo,
  cerrarContextos,
  cerrarNavegador,
  dominiosDeDesarrollo,
  logueado,
  sitio,
} from "./navegador";

let e: Awaited<ReturnType<typeof escenarioAcceso>>;

beforeAll(async () => {
  e = await escenarioAcceso();
  await dominiosDeDesarrollo(e.a, e.b);
  await abrirNavegador();
});
afterEach(async () => {
  await dueno.moduloTenant.deleteMany();
  await cerrarContextos();
});
afterAll(async () => {
  await cerrarNavegador();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

const menu = (page: import("playwright-core").Page) =>
  page.locator('nav[aria-label="Panel"] li[data-modulo]').allTextContents();
const pestanas = (page: import("playwright-core").Page) =>
  page.locator('nav[aria-label="Sitio"] li[data-modulo]').allTextContents();

describe("prueba 1: prendido, aparece y sus rutas responden", () => {
  it("panel: entrada de menú y ruta del módulo", async () => {
    await prenderModulo(e.a.id, "prueba");
    const { page } = await logueado("multi@x.com");
    await page.goto(`${APP}/b/banda-a`);
    expect(await menu(page)).toEqual(["Prueba"]);
    await page.click('nav[aria-label="Panel"] a:text("Prueba")');
    await page.waitForURL(`${APP}/b/banda-a/prueba`);
    expect(await page.getByTestId("modulo-prueba-panel").isVisible()).toBe(true);
  });

  it("sitio público: pestaña y ruta del módulo, sin sesión", async () => {
    await prenderModulo(e.a.id, "prueba");
    const { page } = await anonimo();
    await page.goto(sitio("banda-a"));
    expect(await pestanas(page)).toEqual(["Prueba"]);
    const r = await page.goto(`${sitio("banda-a")}/prueba`);
    expect(r!.status()).toBe(200);
    expect(await page.getByTestId("modulo-prueba-publica").isVisible()).toBe(true);
  });
});

describe("prueba 2: apagado", () => {
  it("rutas 404 y sin entrada de menú ni pestaña", async () => {
    const { page } = await logueado("multi@x.com");
    await page.goto(`${APP}/b/banda-a`);
    expect(await menu(page)).toEqual([]);
    expect((await page.goto(`${APP}/b/banda-a/prueba`))!.status()).toBe(404);
    await page.goto(sitio("banda-a"));
    expect(await pestanas(page)).toEqual([]);
    expect((await page.goto(`${sitio("banda-a")}/prueba`))!.status()).toBe(404);
  });

  it("apagarlo cierra las rutas en el acto", async () => {
    await prenderModulo(e.a.id, "prueba");
    const { page } = await logueado("multi@x.com");
    expect((await page.goto(`${APP}/b/banda-a/prueba`))!.status()).toBe(200);
    await apagarModulo(e.a.id, "prueba");
    expect((await page.goto(`${APP}/b/banda-a/prueba`))!.status()).toBe(404);
  });
});

describe("prueba 3: prendido en A, apagado en B", () => {
  it("cada banda ve lo suyo, con el mismo usuario", async () => {
    await prenderModulo(e.a.id, "prueba");
    const { page } = await logueado("multi@x.com");
    await page.goto(`${APP}/b/banda-a`);
    expect(await menu(page)).toEqual(["Prueba"]);
    await page.goto(`${APP}/b/banda-b`);
    expect(await menu(page)).toEqual([]);
    expect((await page.goto(`${APP}/b/banda-a/prueba`))!.status()).toBe(200);
    expect((await page.goto(`${APP}/b/banda-b/prueba`))!.status()).toBe(404);
    expect((await page.goto(`${sitio("banda-a")}/prueba`))!.status()).toBe(200);
    expect((await page.goto(`${sitio("banda-b")}/prueba`))!.status()).toBe(404);
  });
});

describe("prueba 5: sin el permiso", () => {
  it("LECTURA no ve la entrada de menú y la ruta le da 403", async () => {
    await prenderModulo(e.b.id, "prueba");
    const { page } = await logueado("ajeno@x.com");
    await page.goto(`${APP}/b/banda-b`);
    expect(await menu(page)).toEqual([]);
    expect((await page.goto(`${APP}/b/banda-b/prueba`))!.status()).toBe(403);
  });
});

describe("rutas no declaradas", () => {
  it("404 en el panel y en el sitio público", async () => {
    const { page } = await logueado("multi@x.com");
    expect((await page.goto(`${APP}/b/banda-a/no-existe`))!.status()).toBe(404);
    expect((await page.goto(`${sitio("banda-a")}/no-existe`))!.status()).toBe(404);
    expect((await page.goto(`${APP}/no-existe`))!.status()).toBe(404);
  });
});
