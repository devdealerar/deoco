import { decode } from "next-auth/jwt";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CONTRASENA, dueno, escenarioAcceso } from "../apoyo";
import {
  captura,
  APP,
  abrirNavegador,
  anonimo,
  cerrarContextos,
  cerrarNavegador,
  dominiosDeDesarrollo,
  logueado,
  sitio,
} from "./navegador";

const SITIO_A = sitio("banda-a");
let e: Awaited<ReturnType<typeof escenarioAcceso>>;

beforeAll(async () => {
  e = await escenarioAcceso();
  await dominiosDeDesarrollo(e.a, e.b);
  await abrirNavegador();
});
afterEach(async () => {
  await dueno.tenant.updateMany({ data: { estado: "ACTIVO" } });
  await cerrarContextos();
});
afterAll(async () => {
  await cerrarNavegador();
  await dueno.$disconnect();
});

async function suspender(id: string) {
  await dueno.tenant.update({ where: { id }, data: { estado: "SUSPENDIDO" } });
}

describe("login y sesión", () => {
  it("sin sesión, el panel manda a ingresar y vuelve a donde iba", async () => {
    const { page } = await anonimo();
    await page.goto(`${APP}/b/banda-a`);
    expect(page.url()).toBe(`${APP}/ingresar?volver=%2Fb%2Fbanda-a`);
    await page.fill('input[name="email"]', "multi@x.com");
    await page.fill('input[name="contrasena"]', CONTRASENA);
    await Promise.all([page.waitForURL(`${APP}/b/banda-a`), page.click('button[type="submit"]')]);
    expect(await page.getByTestId("rol").textContent()).toBe("TITULAR");
  });

  it("contraseña incorrecta no entra", async () => {
    const { page } = await anonimo();
    await page.goto(`${APP}/ingresar`);
    await page.fill('input[name="email"]', "multi@x.com");
    await page.fill('input[name="contrasena"]', "mal");
    await page.click('button[type="submit"]');
    await page.waitForURL(/error=1/);
    expect(await page.locator("main [role=alert]").textContent()).toMatch(/incorrectos/);
  });

  it("la sesión guarda SOLO el id del usuario (y su versión)", async () => {
    const { ctx, page } = await logueado("multi@x.com");
    await page.goto(`${APP}/api/auth/session`);
    expect(JSON.parse((await page.locator("body").textContent())!)).toEqual({ user: { id: e.multi.id }, expires: expect.any(String) });

    const cookie = (await ctx.cookies()).find((c) => c.name === "deoco.sesion")!;
    const token = await decode({ token: cookie.value, secret: process.env.AUTH_SECRET!, salt: "deoco.sesion" });
    expect(Object.keys(token!).sort()).toEqual(["exp", "iat", "jti", "sub", "v"]);
    expect(token!.sub).toBe(e.multi.id);
  });

  it("selector: solo sus bandas, con su rol", async () => {
    const { page } = await logueado("multi@x.com");
    const items = await page.locator("li").allTextContents();
    expect(items).toEqual(["Banda A · TITULAR", "Banda B · EDITOR"]);
  });
});

describe("prueba 2: sin membresía en esa banda → 403", () => {
  it("ajeno (solo en B) pide /b/banda-a", async () => {
    const { page } = await logueado("ajeno@x.com");
    const r = await page.goto(`${APP}/b/banda-a`);
    expect(r!.status()).toBe(403);
    expect((await page.goto(`${APP}/b/banda-b`))!.status()).toBe(200);
  });
});

describe("prueba 4: cambiar de banda no pide re-login y cambia el rol", () => {
  it("/b/banda-a → /b/banda-b → /b/banda-a", async () => {
    const { page } = await logueado("multi@x.com");
    expect((await page.goto(`${APP}/b/banda-a`))!.status()).toBe(200);
    expect(await page.getByTestId("rol").textContent()).toBe("TITULAR");
    expect((await page.goto(`${APP}/b/banda-b`))!.status()).toBe(200);
    expect(page.url()).toBe(`${APP}/b/banda-b`);
    expect(await page.getByTestId("rol").textContent()).toBe("EDITOR");
    await page.goto(`${APP}/b/banda-a`);
    expect(await page.getByTestId("rol").textContent()).toBe("TITULAR");
  });
});

describe("prueba 6: staff", () => {
  it("entra a cualquier banda, marcado como acceso de staff", async () => {
    const { page } = await logueado("staff@deocoartist.com");
    const items = await page.locator("li").allTextContents();
    expect(items).toEqual(["Banda A · — · acceso de staff", "Banda B · — · acceso de staff"]);
    for (const slug of ["banda-a", "banda-b"]) {
      expect((await page.goto(`${APP}/b/${slug}`))!.status()).toBe(200);
      await expect(page.getByTestId("acceso-staff").isVisible()).resolves.toBe(true);
    }
  });

  it("no entra al pago: es solo del titular", async () => {
    const { page } = await logueado("staff@deocoartist.com");
    expect((await page.goto(`${APP}/b/banda-a/pago`))!.status()).toBe(403);
  });
});

describe("prueba 7: banda SUSPENDIDO", () => {
  it("el titular entra a /pago y a /dominios (editor y staff, 403); el resto del panel, en solo lectura", async () => {
    await suspender(e.a.id);
    const titular = (await logueado("multi@x.com")).page;
    expect((await titular.goto(`${APP}/b/banda-a/pago`))!.status()).toBe(200);
    expect(await titular.getByTestId("estado").textContent()).toBe("SUSPENDIDO");
    expect((await titular.goto(`${APP}/b/banda-a`))!.status()).toBe(200);
    expect(await titular.getByTestId("aviso-solo-lectura").textContent()).toContain("el sitio dejó de estar publicado");
    // Dominios también: la cuota impaga no le impide llevarse sus dominios.
    expect((await titular.goto(`${APP}/b/banda-a/dominios`))!.status()).toBe(200);

    const editor = (await logueado("editor-a@x.com")).page;
    expect((await editor.goto(`${APP}/b/banda-a/pago`))!.status()).toBe(403);
    expect((await editor.goto(`${APP}/b/banda-a/dominios`))!.status()).toBe(403);
    expect((await editor.goto(`${APP}/b/banda-a`))!.status()).toBe(200);

    const staff = (await logueado("staff@deocoartist.com")).page;
    expect((await staff.goto(`${APP}/b/banda-a/pago`))!.status()).toBe(403);
  });

  it("ARCHIVADO: el titular entra solo a Dominios (para llevárselos) y a Plan y pago (darse de baja o volver); el resto, 404; otro rol tampoco", async () => {
    const editor = (await logueado("editor-a@x.com")).page;
    await dueno.tenant.update({ where: { id: e.a.id }, data: { estado: "ARCHIVADO" } });
    try {
      const titular = (await logueado("multi@x.com")).page;
      // El selector la muestra archivada, con el camino a sus dominios.
      const enSelector = titular.locator('[data-slug="banda-a"]');
      expect(await enSelector.textContent()).toContain("archivada");
      await enSelector.getByRole("link", { name: "Tus dominios" }).click();
      await titular.waitForURL(`${APP}/b/banda-a/dominios`);
      expect(await titular.getByTestId("aviso-archivada").textContent()).toContain("Tus dominios siguen siendo tuyos");
      expect(await titular.getByRole("button", { name: "Delegar dominio" }).count()).toBe(0);
      expect((await titular.goto(`${APP}/b/banda-a`))!.status()).toBe(404);
      expect((await titular.goto(`${APP}/b/banda-a/pago`))!.status()).toBe(200);
      expect((await titular.goto(`${APP}/b/banda-a/credenciales`))!.status()).toBe(404);
      expect((await editor.goto(`${APP}/b/banda-a/dominios`))!.status()).toBe(403);
      expect((await editor.goto(`${APP}/b/banda-a/pago`))!.status()).toBe(403);
    } finally {
      await dueno.tenant.update({ where: { id: e.a.id }, data: { estado: "ACTIVO" } });
    }
  });

  it("MOROSO: el titular ve el aviso y puede pagar; el editor no ve el aviso", async () => {
    await dueno.tenant.update({ where: { id: e.a.id }, data: { estado: "MOROSO" } });
    const titular = (await logueado("multi@x.com")).page;
    await titular.goto(`${APP}/b/banda-a`);
    expect(await titular.getByTestId("aviso-mora").textContent()).toMatch(/cuota pendiente/);
    await captura(titular, "panel-mora");
    expect((await titular.goto(`${APP}/b/banda-a/pago`))!.status()).toBe(200);

    const editor = (await logueado("editor-a@x.com")).page;
    await editor.goto(`${APP}/b/banda-a`);
    expect(await editor.getByTestId("rol").textContent()).toBe("EDITOR");
    expect(await editor.getByTestId("aviso-mora").count()).toBe(0);
    // Día 15 (MOROSO_GRAVE): el aviso es permanente y lo ve todo el equipo; todo sigue funcionando.
    await dueno.tenant.update({ where: { id: e.a.id }, data: { estado: "MOROSO_GRAVE" } });
    await editor.goto(`${APP}/b/banda-a`);
    expect(await editor.getByTestId("aviso-mora-grave").textContent()).toContain("Todo sigue funcionando");
    expect(await editor.locator("form fieldset[disabled]").count()).toBe(0);
  });
});

describe("prueba 8: la cookie de sesión no viaja al sitio público", () => {
  it("cookie acotada a app.lvh.me y ausente en banda-a.lvh.me", async () => {
    const { ctx, page } = await logueado("multi@x.com");
    const cookie = (await ctx.cookies()).find((c) => c.name === "deoco.sesion")!;
    expect(cookie.domain).toBe("app.lvh.me"); // host-only, sin ".lvh.me"
    expect(cookie.httpOnly).toBe(true);

    const pedido = page.waitForRequest(`${SITIO_A}/`);
    const r = await page.goto(`${SITIO_A}/`);
    expect(r!.status()).toBe(200);
    expect(await page.locator("h1").textContent()).toBe("Banda A");
    expect((await pedido).headers()["cookie"]).toBeUndefined();
  });

  it("el sitio público no expone login ni sesión", async () => {
    const { page } = await logueado("multi@x.com");
    expect((await page.goto(`${SITIO_A}/ingresar`))!.status()).toBe(404);
    expect((await page.goto(`${SITIO_A}/api/auth/session`))!.status()).toBe(404);
  });
});

describe("pagos para devolver (C1.4)", () => {
  it("el titular ve el aviso y la lista; lo marca resuelto con una nota; el editor no entra", async () => {
    await dueno.cobroDuplicado.deleteMany({ where: { tenantId: e.a.id } });
    await dueno.cobroDuplicado.create({
      data: { tenantId: e.a.id, moduloId: "tienda", referencia: "11111111-1111-4111-8111-111111111111", pasarela: "mercadopago", cobroId: "555", monto: 2500000, moneda: "ARS", motivo: "duplicado" },
    });
    try {
      const titular = (await logueado("multi@x.com")).page;
      await titular.goto(`${APP}/b/banda-a`);
      expect(await titular.getByTestId("aviso-devoluciones").textContent()).toContain("un pago para devolver");
      await titular.getByRole("link", { name: "Ver y devolver" }).click();
      await titular.waitForURL(`${APP}/b/banda-a/devoluciones`);
      const fila = titular.locator('[data-devolucion="555"]').locator("xpath=ancestor::tr");
      expect(await fila.textContent()).toContain("Pagó dos veces");
      const form = fila.locator("form[data-hidratado]").last();
      await form.waitFor();
      await form.locator('input[name="nota"]').fill("Devuelto desde Mercado Pago");
      await form.getByRole("button", { name: "Ya lo resolví" }).click();
      await titular.locator('[data-devolucion="555"]').locator("xpath=ancestor::tr").getByText("Resuelto").waitFor();
      expect((await dueno.cobroDuplicado.findFirstOrThrow({ where: { cobroId: "555" } })).nota).toBe("Devuelto desde Mercado Pago");
      const editor = (await logueado("editor-a@x.com")).page;
      expect((await editor.goto(`${APP}/b/banda-a/devoluciones`))!.status()).toBe(403);
    } finally {
      await dueno.cobroDuplicado.deleteMany({ where: { tenantId: e.a.id } });
    }
  });
});

