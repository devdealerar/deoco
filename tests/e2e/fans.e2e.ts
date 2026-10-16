import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { dueno, escenarioAcceso } from "../apoyo";
import { APP, abrirNavegador, anonimo, captura, cerrarContextos, cerrarNavegador, dominiosDeDesarrollo, logueado, sitio } from "./navegador";

// D4 de punta a punta: el fan se suscribe desde el sitio y confirma por mail; la banda ve su base
// y manda un newsletter; el fan se da de baja con un clic.

let e: Awaited<ReturnType<typeof escenarioAcceso>>;

/** El link (después de "#") del último mail a `para` que lleva `ruta`. Espera a que exista. */
async function linkDelMail(para: string, ruta: string): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const c = await dueno.correo.findFirst({ where: { para, texto: { contains: ruta } }, orderBy: { creadoEn: "desc" } });
    const m = c?.texto.match(new RegExp(`(https?://\\S+${ruta}(\\?e=[0-9a-f-]+)?#[0-9a-f]{64})`));
    if (m) return m[1];
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`no llegó el mail a ${para} con ${ruta}`);
}

beforeAll(async () => {
  e = await escenarioAcceso();
  await dominiosDeDesarrollo(e.a, e.b);
  await dueno.moduloTenant.createMany({ data: [{ tenantId: e.a.id, moduloId: "fans" }], skipDuplicates: true });
  await abrirNavegador();
});
afterEach(() => cerrarContextos());
afterAll(async () => {
  await cerrarNavegador();
  await dueno.$disconnect();
});

describe("newsletter", () => {
  it("suscribirse (casilla sin marcar), confirmar por mail, recibir un envío y darse de baja con un clic", async () => {
    const { page } = await anonimo();
    await page.goto(`${sitio("banda-a")}/novedades`);
    const form = page.locator("form[data-novedades]");
    await form.locator('input[name="email"]').fill("lucia@fan.com");
    // Sin la casilla, no.
    await form.getByRole("button", { name: "Suscribirme" }).click();
    await form.getByRole("alert").waitFor();
    expect(await form.getByRole("alert").textContent()).toContain("marcá la casilla");
    await form.locator('input[name="acepto"]').check();
    await form.getByRole("button", { name: "Suscribirme" }).click();
    await page.locator("[data-novedades-pedido]").waitFor();
    await captura(page, "novedades-pedido");
    expect((await dueno.fansContacto.findFirstOrThrow({ where: { email: "lucia@fan.com" } })).newsletter).toBe("pendiente");

    await page.goto(await linkDelMail("lucia@fan.com", "/novedades/confirmar"));
    await page.locator('[data-canje="confirmar"][data-resultado="bien"]').waitFor();
    expect(page.url()).toBe(`${sitio("banda-a")}/novedades/confirmar`); // el token ya no está en la barra
    expect((await dueno.fansContacto.findFirstOrThrow({ where: { email: "lucia@fan.com" } })).newsletter).toBe("confirmado");

    // La banda ve su base y manda un envío.
    const titular = (await logueado("multi@x.com")).page;
    await titular.goto(`${APP}/b/banda-a/fans`);
    expect(await titular.locator('[data-metrica="suscriptos"] dd').textContent()).toBe("1");
    expect(await titular.locator('[data-contacto="lucia@fan.com"]').count()).toBe(1);
    await titular.goto(`${APP}/b/banda-a/fans/envios`);
    const nuevo = titular.locator("form[data-hidratado]", { has: titular.getByRole("button", { name: "Guardar borrador" }) });
    await nuevo.locator('input[name="asunto"]').fill("Gira de verano");
    await nuevo.locator('textarea[name="cuerpo"]').fill("Hola!\n\nSalimos de gira.");
    await Promise.all([titular.waitForURL(/\/fans\/envios\/[0-9a-f-]{36}$/), nuevo.getByRole("button", { name: "Guardar borrador" }).click()]);
    const mandar = titular.locator("form[data-hidratado]", { has: titular.getByRole("button", { name: "Mandar" }) });
    await mandar.getByText("Sí, mandarlo").click();
    await mandar.getByRole("button", { name: "Mandar" }).click();
    // Mandado, la pantalla pasa a sus números.
    await titular.locator('[data-estadistica="destinatarios"] dd').waitFor();
    expect(await titular.locator('[data-estadistica="destinatarios"] dd').textContent()).toBe("1");
    await captura(titular, "newsletter-envio");

    // El fan se da de baja desde el link del mail.
    await page.goto(await linkDelMail("lucia@fan.com", "/novedades/baja"));
    await page.locator('[data-canje="baja"][data-resultado="bien"]').waitFor();
    expect((await dueno.fansContacto.findFirstOrThrow({ where: { email: "lucia@fan.com" } })).newsletter).toBe("baja");
    // Y queda contado en el envío.
    await titular.reload();
    expect(await titular.locator('[data-estadistica="bajas"] dd').textContent()).toBe("1");
  });

  it("la base es del titular: un editor ve los envíos pero no la base", async () => {
    const { page } = await logueado("editor-a@x.com");
    await page.goto(`${APP}/b/banda-a`);
    expect(await page.locator('nav[aria-label="Panel"] a:text("Newsletter")').count()).toBe(1);
    expect(await page.locator('nav[aria-label="Panel"] a:text-is("Fans")').count()).toBe(0);
    expect((await page.goto(`${APP}/b/banda-a/fans`))!.status()).toBe(403);
  });
});
