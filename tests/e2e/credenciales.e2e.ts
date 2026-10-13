import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prenderModulo } from "@/nucleo/modulos/encendido";
import { dueno, escenarioAcceso } from "../apoyo";
import { APP, abrirNavegador, cerrarContextos, cerrarNavegador, logueado } from "./navegador";

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
const TOKEN = "APP_USR-7777777777-token-de-la-pasarela-z9y8";
const CREDENCIALES = `${APP}/b/banda-a/credenciales`;

beforeAll(async () => {
  e = await escenarioAcceso();
  await abrirNavegador();
});
afterEach(async () => {
  await dueno.secreto.deleteMany();
  await dueno.moduloTenant.deleteMany();
  await cerrarContextos();
});
afterAll(async () => {
  await cerrarNavegador();
  await dueno.$disconnect();
});

describe("credenciales de la banda (secretos por módulo)", () => {
  it("el titular la carga; la pantalla nunca la muestra completa; el módulo la lee", async () => {
    await prenderModulo(e.staff.id, e.a.id, "prueba");
    const { page } = await logueado("multi@x.com");
    await page.goto(`${APP}/b/banda-a`);
    await page.click('nav[aria-label="Panel"] a:text("Credenciales")');
    await page.waitForURL(CREDENCIALES);

    const tarjeta = page.locator('[data-secreto="prueba/token"]');
    expect(await tarjeta.textContent()).toContain("Sin cargar");
    const form = tarjeta.locator("form[data-hidratado]");
    await form.locator('input[name="valor"]').fill(TOKEN);
    expect(await form.locator('input[name="valor"]').getAttribute("type")).toBe("password");
    await form.getByRole("button", { name: "Guardar" }).click();
    await form.getByRole("status").waitFor();
    expect(await form.locator('input[name="valor"]').inputValue()).toBe(""); // no queda en el formulario

    await page.reload();
    expect(await tarjeta.textContent()).toContain("Cargada");
    expect(await tarjeta.locator("[data-pista]").textContent()).toBe("…z9y8");
    expect(await page.content()).not.toContain("7777777777");

    // El módulo dueño la usa (sin mostrarla).
    await page.goto(`${APP}/b/banda-a/prueba`);
    expect(await page.getByTestId("token").textContent()).toBe(`token cargado (${TOKEN.length} caracteres)`);
    expect(await page.content()).not.toContain("7777777777");
  });

  it("borrar pide confirmación", async () => {
    await prenderModulo(e.staff.id, e.a.id, "prueba");
    const { page } = await logueado("multi@x.com");
    await page.goto(CREDENCIALES);
    const tarjeta = page.locator('[data-secreto="prueba/token"]');
    const guardar = tarjeta.locator("form[data-hidratado]").first();
    await guardar.locator('input[name="valor"]').fill("token-corto");
    await guardar.getByRole("button", { name: "Guardar" }).click();
    const borrar = tarjeta.locator("[data-borrar] form[data-hidratado]");
    await borrar.getByRole("button", { name: "Borrar" }).click();
    expect(await borrar.getByRole("alert").textContent()).toMatch(/confirmalo/);
    await borrar.getByText("Confirmo borrarla").click();
    await borrar.getByRole("button", { name: "Borrar" }).click();
    await tarjeta.getByText("Sin cargar").waitFor();
    expect(await dueno.secreto.count()).toBe(0);
  });

  it("solo el titular: otro rol y el staff reciben 403 y no ven la entrada", async () => {
    await prenderModulo(e.staff.id, e.a.id, "prueba");
    for (const email of ["editor-a@x.com", "staff@deoco.com"]) {
      const { page } = await logueado(email);
      await page.goto(`${APP}/b/banda-a`);
      expect(await page.locator('nav[aria-label="Panel"] a:text("Credenciales")').count()).toBe(0);
      expect((await page.goto(CREDENCIALES))!.status()).toBe(403);
    }
  });

  it("sin módulos que pidan credenciales, el titular no ve la entrada", async () => {
    const { page } = await logueado("multi@x.com");
    await page.goto(`${APP}/b/banda-a`);
    expect(await page.locator('nav[aria-label="Panel"] a:text("Credenciales")').count()).toBe(0);
  });
});
