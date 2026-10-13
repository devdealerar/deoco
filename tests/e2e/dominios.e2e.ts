import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { dueno, escenarioAcceso } from "../apoyo";
import { APP, abrirNavegador, cerrarContextos, cerrarNavegador, dominiosDeDesarrollo, logueado } from "./navegador";

let e: Awaited<ReturnType<typeof escenarioAcceso>>;

beforeAll(async () => {
  e = await escenarioAcceso();
  await dominiosDeDesarrollo(e.a, e.b);
  await abrirNavegador();
});
afterEach(async () => {
  await dueno.dominio.deleteMany({ where: { dominio: { in: ["lossatelites.com.ar", "sincert.invalid"] } } });
  await dueno.dominio.updateMany({ where: { dominio: { endsWith: ".lvh.me" } }, data: { esPrincipal: true } });
  await cerrarContextos();
});
afterAll(async () => {
  await cerrarNavegador();
  await dueno.$disconnect();
});

const DOMINIOS = `${APP}/b/banda-a/dominios`;

describe("dominio propio desde el panel de la banda", () => {
  it("el titular lo agrega y ve los dos registros exactos, listos para copiar", async () => {
    const { page } = await logueado("multi@x.com");
    await page.goto(`${APP}/b/banda-a`);
    await page.click('nav[aria-label="Panel"] a:text("Dominios")');
    await page.waitForURL(DOMINIOS);
    expect(await page.locator("[data-dominio]").first().getAttribute("data-dominio")).toBe("banda-a.lvh.me");

    const alta = page.locator("form[data-hidratado]", { has: page.getByRole("button", { name: "Agregar dominio" }) });
    await alta.locator('input[name="dominio"]').fill("https://LosSatelites.com.ar/");
    await alta.getByRole("button", { name: "Agregar dominio" }).click();
    await alta.getByRole("status").waitFor();

    const tarjeta = page.locator('[data-dominio="lossatelites.com.ar"]');
    await tarjeta.waitFor();
    expect(await tarjeta.textContent()).toContain("Sin verificar");
    const { token } = await dueno.dominio.findFirstOrThrow({ where: { dominio: "lossatelites.com.ar" } });
    const valores = (sel: string) => tarjeta.locator(`[data-registro="${sel}"] [data-copiable]`).allTextContents();
    expect(await valores("A")).toEqual(["lossatelites.com.ar", "203.0.113.10"]);
    expect(await valores("TXT")).toEqual(["_deoco.lossatelites.com.ar", `deoco-verificacion=${token}`]);

    // En http (desarrollo) no hay API de portapapeles: copia por selección.
    const copiar = tarjeta.getByRole("button", { name: "Copiar valor del registro TXT" });
    await copiar.click();
    expect(await copiar.textContent()).toBe("Copiado");

    // Sin los registros en el DNS, verificar dice qué falta y no lo verifica.
    const verificar = tarjeta.locator("form[data-hidratado]");
    await verificar.getByRole("button", { name: "Verificar" }).click();
    expect(await verificar.getByRole("alert").textContent()).toMatch(/^Sin verificar: todavía no se ve el registro A/);
    expect((await dueno.dominio.findFirstOrThrow({ where: { dominio: "lossatelites.com.ar" } })).verificado).toBe(false);
    // Sin verificar no se ofrece como principal.
    expect(await tarjeta.getByRole("button", { name: "Usar como principal" }).count()).toBe(0);
  });

  it("verificado pero sin HTTPS: el botón explica que falta el certificado y no lo marca", async () => {
    // .invalid nunca resuelve: el servidor no puede abrir https://sincert.invalid
    await dueno.dominio.create({ data: { tenantId: e.a.id, dominio: "sincert.invalid", verificado: true } });
    const { page } = await logueado("multi@x.com");
    await page.goto(DOMINIOS);
    const tarjeta = page.locator('[data-dominio="sincert.invalid"]');
    expect(await tarjeta.textContent()).toContain("Verificado");
    const form = tarjeta.locator("form[data-hidratado]", { has: page.getByRole("button", { name: "Usar como principal" }) });
    await form.getByRole("button", { name: "Usar como principal" }).click();
    expect(await form.getByRole("alert").textContent()).toMatch(/falta que Deoco lo active en el servidor \(certificado\)/);
    const principal = await dueno.dominio.findFirstOrThrow({ where: { tenantId: e.a.id, esPrincipal: true } });
    expect(principal.dominio).toBe("banda-a.lvh.me");
  });

  it("quitar pide confirmación; el principal y el subdominio no ofrecen quitar", async () => {
    await dueno.dominio.create({ data: { tenantId: e.a.id, dominio: "lossatelites.com.ar" } });
    const { page } = await logueado("multi@x.com");
    await page.goto(DOMINIOS);
    expect(await page.locator('[data-dominio="banda-a.lvh.me"] [data-quitar]').count()).toBe(0);
    const tarjeta = page.locator('[data-dominio="lossatelites.com.ar"]');
    const form = tarjeta.locator("[data-quitar] form[data-hidratado]");
    await form.getByRole("button", { name: "Quitar dominio" }).click();
    expect(await form.getByRole("alert").textContent()).toBe("Para quitar lossatelites.com.ar, confirmalo.");
    await form.getByText("Confirmo quitar lossatelites.com.ar").click();
    await form.getByRole("button", { name: "Quitar dominio" }).click();
    await tarjeta.waitFor({ state: "detached" });
    expect(await dueno.dominio.count({ where: { dominio: "lossatelites.com.ar" } })).toBe(0);
  });

  it("solo el titular: otro rol y el staff reciben 403 y no ven la entrada", async () => {
    for (const email of ["editor-a@x.com", "staff@deoco.com"]) {
      const { page } = await logueado(email);
      await page.goto(`${APP}/b/banda-a`);
      expect(await page.locator('nav[aria-label="Panel"] a:text("Dominios")').count()).toBe(0);
      expect((await page.goto(DOMINIOS))!.status()).toBe(403);
    }
  });
});
