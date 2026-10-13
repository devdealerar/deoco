import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/nucleo/db/cliente";
import { dueno, escenarioAcceso } from "../apoyo";
import { APP, abrirNavegador, anonimo, cerrarContextos, cerrarNavegador, dominiosDeDesarrollo, logueado, sitio } from "./navegador";

beforeAll(async () => {
  const e = await escenarioAcceso();
  await dominiosDeDesarrollo(e.a, e.b);
  await abrirNavegador();
});
afterEach(async () => {
  await cerrarContextos();
});
afterAll(async () => {
  await cerrarNavegador();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("prueba 1: /admin es 404 para todo el que no sea staff", () => {
  it("sin sesión, un usuario común, y el staff desde el host de una banda", async () => {
    const anon = (await anonimo()).page;
    expect((await anon.goto(`${APP}/admin`))!.status()).toBe(404);
    expect((await anon.goto(`${APP}/admin/bandas/nueva`))!.status()).toBe(404);

    const titular = (await logueado("multi@x.com")).page; // TITULAR en A, pero no staff
    expect((await titular.goto(`${APP}/admin`))!.status()).toBe(404);
    expect((await titular.goto(`${APP}/admin/bandas/nueva`))!.status()).toBe(404);

    const staff = (await logueado("staff@deoco.com")).page;
    expect((await staff.goto(`${sitio("banda-a")}/admin`))!.status()).toBe(404);
    expect((await staff.goto(`${APP}/admin`))!.status()).toBe(200);
  });
});

describe("listado de bandas", () => {
  it("muestra todas las bandas con estado, módulos y espacio", async () => {
    const { page } = await logueado("staff@deoco.com");
    await page.goto(`${APP}/admin`);
    const filas = page.getByRole("row");
    await expect(filas.filter({ hasText: "Banda A" }).count()).resolves.toBe(1);
    const a = await filas.filter({ hasText: "Banda A" }).textContent();
    expect(a).toContain("ACTIVO");
    expect(a).toContain("banda-a.deoco.com");
    expect(a).toMatch(/de 1\.0 GB/);
    await expect(filas.filter({ hasText: "Banda B" }).count()).resolves.toBe(1);
  });
});

describe("prueba 2: el staff da de alta una banda y el titular entra sin tocar SQL", () => {
  it("alta con titular nuevo → clave temporal → el titular entra a su panel", async () => {
    const { page } = await logueado("staff@deoco.com");
    await page.goto(`${APP}/admin/bandas/nueva`);
    const form = page.locator("form[data-hidratado]");
    await form.waitFor();
    await form.locator('input[name="nombre"]').fill("Los Nuevos");
    await form.locator('input[name="slug"]').fill("los-nuevos");
    await form.locator('input[name="titularEmail"]').fill("titular@losnuevos.com");
    await form.locator('input[name="titularNombre"]').fill("Titular Nuevo");
    await form.getByRole("button", { name: "Crear banda" }).click();
    const mensaje = (await form.getByRole("status").textContent())!;
    expect(mensaje).toMatch(/^Banda creada \(los-nuevos\.lvh\.me\)\. El titular titular@losnuevos\.com entra en .*\/b\/los-nuevos con la clave temporal [a-z2-9-]{14} \(se muestra una sola vez\)\.$/);
    const clave = mensaje.match(/clave temporal ([a-z2-9-]{14})/)![1];

    await page.goto(`${APP}/admin`);
    expect(await page.getByRole("row").filter({ hasText: "Los Nuevos" }).textContent()).toContain("los-nuevos.lvh.me");

    // El titular, en otro navegador, con la clave temporal.
    const t = (await anonimo()).page;
    await t.goto(`${APP}/ingresar?volver=/b/los-nuevos`);
    await t.fill('input[name="email"]', "titular@losnuevos.com");
    await t.fill('input[name="contrasena"]', clave);
    await Promise.all([t.waitForURL(`${APP}/b/los-nuevos`), t.click('button[type="submit"]')]);
    expect(await t.getByTestId("rol").textContent()).toBe("TITULAR");
    // Y su sitio existe (todavía sin módulos prendidos: marco neutro).
    expect((await t.goto(sitio("los-nuevos")))!.status()).toBe(200);

    // Prueba 5: quedó la auditoría.
    const banda = await dueno.tenant.findUniqueOrThrow({ where: { slug: "los-nuevos" } });
    const staff = await dueno.usuario.findUniqueOrThrow({ where: { email: "staff@deoco.com" } });
    const filas = await dueno.auditoria.findMany({ where: { usuarioId: staff.id, accion: { in: ["banda.creada", "usuario.creado"] } } });
    expect(filas.map((f) => f.accion).sort()).toEqual(["banda.creada", "usuario.creado"]);
    expect(filas.find((f) => f.accion === "banda.creada")!.tenantId).toBe(banda.id);
  });

  it("un dato inválido devuelve el error y conserva lo escrito", async () => {
    const { page } = await logueado("staff@deoco.com");
    await page.goto(`${APP}/admin/bandas/nueva`);
    const form = page.locator("form[data-hidratado]");
    await form.waitFor();
    await form.locator('input[name="nombre"]').fill("Repetida");
    await form.locator('input[name="slug"]').fill("banda-a");
    await form.locator('input[name="titularEmail"]').fill("multi@x.com");
    await form.getByRole("button", { name: "Crear banda" }).click();
    expect(await form.getByRole("alert").textContent()).toBe('Ya existe una banda con el slug "banda-a".');
    expect(await form.locator('input[name="nombre"]').inputValue()).toBe("Repetida");
    expect(await form.locator('input[name="titularEmail"]').inputValue()).toBe("multi@x.com");
  });
});

describe("accesos del staff al panel de una banda", () => {
  it("quedan en la auditoría", async () => {
    const { page } = await logueado("staff@deoco.com");
    const staff = await dueno.usuario.findUniqueOrThrow({ where: { email: "staff@deoco.com" } });
    const banda = await dueno.tenant.findUniqueOrThrow({ where: { slug: "banda-b" } });
    expect((await page.goto(`${APP}/b/banda-b`))!.status()).toBe(200);
    const fila = await dueno.auditoria.findFirst({ where: { usuarioId: staff.id, tenantId: banda.id, accion: "acceso.panel" } });
    expect(fila?.detalle).toEqual({ ruta: "/b/banda-b" });
  });
});
