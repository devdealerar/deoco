import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { dueno, escenarioAcceso } from "../apoyo";
import { APP, abrirNavegador, anonimo, captura, cerrarContextos, cerrarNavegador, logueado, sitio } from "./navegador";

// Alta sola, de punta a punta: registro → link del mail → ingresar → crear la banda → panel,
// con el sitio en línea en su subdominio. El staff la ve en el back office.

const CLAVE = "clave-de-la-banda-nueva";

beforeAll(async () => {
  await escenarioAcceso();
  await abrirNavegador();
});
afterEach(() => cerrarContextos());
afterAll(async () => {
  await cerrarNavegador();
  await dueno.$disconnect();
});

describe("autogestión del alta", () => {
  it("se registra, confirma el email, crea su banda y queda en su panel con el sitio en línea", async () => {
    const { page } = await anonimo();
    await page.goto(`${APP}/ingresar`);
    await page.click("text=Creá tu banda");
    await page.waitForURL(`${APP}/registro`);
    const f = page.locator("form[data-hidratado]");
    await f.waitFor();
    await f.locator('input[name="nombre"]').fill("Vera Nueva");
    await f.locator('input[name="email"]').fill("vera@nueva.com");
    await f.locator('input[name="contrasena"]').fill(CLAVE);
    await f.locator('input[name="repetida"]').fill(CLAVE);
    await captura(page, "registro");
    await f.getByRole("button", { name: "Crear cuenta" }).click();
    await page.locator("text=Te mandamos un mail a vera@nueva.com").waitFor();
    expect(await dueno.usuario.findUnique({ where: { email: "vera@nueva.com" } })).toBeNull();

    // El mail salió en el proceso del servidor: la prueba pone un token conocido (solo se guarda su hash).
    const token = "ab".repeat(32);
    await dueno.registroPendiente.update({ where: { email: "vera@nueva.com" }, data: { tokenHash: createHash("sha256").update(token).digest("hex") } });
    await page.goto(`${APP}/registro/verificar#${token}`);
    await page.locator('[data-testid="email-confirmado"]').waitFor();
    expect(page.url()).not.toContain(token); // sale de la barra de direcciones
    await page.click("text=Ingresar");
    await page.waitForURL(/\/ingresar\?volver=/);
    await page.fill('input[name="email"]', "vera@nueva.com");
    await page.fill('input[name="contrasena"]', CLAVE);
    await Promise.all([page.waitForURL(`${APP}/registro/banda`), page.click('button[type="submit"]')]);

    const b = page.locator("form[data-hidratado]");
    await b.waitFor();
    await b.locator('input[name="nombre"]').fill("Vera y los Nuevos");
    await b.locator('input[name="subdominio"]').fill("admin");
    await b.getByRole("button", { name: "Crear banda" }).click();
    await page.locator("text=está reservado").waitFor();
    await b.locator('input[name="subdominio"]').fill("vera-nuevos");
    await captura(page, "registro-banda");
    await Promise.all([page.waitForURL(`${APP}/b/vera-nuevos`), b.getByRole("button", { name: "Crear banda" }).click()]);
    expect(await page.locator('nav a:text("Sitio")').count()).toBeGreaterThan(0);
    await captura(page, "registro-panel");

    // El sitio público ya responde en su subdominio.
    const publico = await anonimo();
    expect((await publico.page.goto(sitio("vera-nuevos")))?.status()).toBe(200);
  });

  it("el staff ve el alta nueva marcada como autogestión", async () => {
    const { page } = await logueado("staff@deoco.com");
    await page.goto(`${APP}/admin?origen=autogestion`);
    await page.locator('[data-slug="vera-nuevos"]').waitFor();
    expect(await page.locator('[data-origen="autogestion"]').count()).toBe(1);
  });

  it("/registro no existe en el host de una banda", async () => {
    const { page } = await anonimo();
    expect((await page.goto(`${sitio("vera-nuevos")}/registro`))?.status()).toBe(404);
  });
});
