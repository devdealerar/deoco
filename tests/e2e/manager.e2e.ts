import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CONTRASENA, dueno, escenarioAcceso } from "../apoyo";
import { APP, abrirNavegador, captura, cerrarContextos, cerrarNavegador, logueado } from "./navegador";

// D7 de punta a punta: el staff da de alta un sello; la banda invita al manager desde Equipo; el
// manager acepta y ve su roster (solo números); la banda lo saca y el acceso cesa.

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
const MANAGER = "manager@sello.com";

beforeAll(async () => {
  e = await escenarioAcceso();
  const { hashearContrasena } = await import("@/nucleo/auth/contrasena");
  await dueno.usuario.create({ data: { email: MANAGER, nombre: "Mara Manager", hashContrasena: await hashearContrasena(CONTRASENA) } });
  await dueno.moduloTenant.createMany({ data: ["tienda", "ticketera", "fans"].map((moduloId) => ({ tenantId: e.a.id, moduloId })), skipDuplicates: true });
  await abrirNavegador();
});
afterEach(() => cerrarContextos());
afterAll(async () => {
  await cerrarNavegador();
  await dueno.$disconnect();
});

describe("panel del manager", () => {
  it("el staff da el acceso, la banda lo invita, el manager acepta y ve el roster; la banda lo saca", async () => {
    // Staff: sello y acceso.
    const staff = (await logueado("staff@deocoartist.com")).page;
    await staff.goto(`${APP}/admin/m/manager`);
    const nuevo = staff.locator("form[data-hidratado]", { has: staff.getByRole("button", { name: "Crear" }) });
    await nuevo.locator('input[name="nombre"]').fill("Sello Norte");
    await nuevo.getByRole("button", { name: "Crear" }).click();
    const sello = staff.locator('[data-sello="Sello Norte"]');
    await sello.waitFor();
    await sello.locator('input[name="email"]').fill(MANAGER);
    await sello.getByRole("button", { name: "Dar acceso" }).click();
    await sello.locator(`[data-acceso="${MANAGER}"]`).waitFor();

    // La banda lo invita desde Equipo.
    const titular = (await logueado("multi@x.com")).page;
    await titular.goto(`${APP}/b/banda-a/equipo`);
    const invitar = titular.locator("form[data-hidratado]", { has: titular.getByRole("button", { name: "Invitar" }) });
    await invitar.locator('input[name="email"]').fill(MANAGER);
    await invitar.getByRole("button", { name: "Invitar" }).click();
    await titular.locator(`[data-invitacion="${MANAGER}"]`).waitFor();

    // El manager acepta en el selector y entra a su panel.
    const { page } = await logueado(MANAGER);
    const inv = page.locator('[data-invitacion="Banda A"]');
    await inv.getByRole("button", { name: "Aceptar" }).click();
    await page.locator('[data-slug="banda-a"]').waitFor();
    await page.goto(`${APP}/portal/manager`);
    await page.locator('[data-banda="banda-a"]').waitFor();
    await captura(page, "manager-roster");
    // Solo números: ningún email de fans en la vista.
    expect(await page.locator("main").textContent()).not.toMatch(/@fan/);
    expect((await page.goto(`${APP}/portal/manager/comparar`))!.status()).toBe(200);
    expect(await page.locator('[data-comparar="banda-a"]').count()).toBe(1);
    expect((await page.goto(`${APP}/portal/manager/calendario`))!.status()).toBe(200);
    // Acceso directo a la banda, con el rol que le dieron.
    expect((await page.goto(`${APP}/b/banda-a`))!.status()).toBe(200);

    // La banda lo saca: cesa ya.
    await titular.goto(`${APP}/b/banda-a/equipo`);
    const fila = titular.locator("tr", { has: titular.locator(`[data-miembro="${MANAGER}"]`) });
    const sacar = fila.locator("form[data-hidratado]").filter({ has: titular.getByRole("button", { name: "Sacar de la banda" }) });
    await sacar.getByText("Confirmo: pierde el acceso").click();
    await sacar.getByRole("button", { name: "Sacar de la banda" }).click();
    await titular.locator(`[data-miembro="${MANAGER}"]`).waitFor({ state: "detached" });
    expect((await page.goto(`${APP}/b/banda-a`))!.status()).toBe(403);
    await page.goto(`${APP}/portal/manager`);
    expect(await page.locator('[data-banda="banda-a"]').count()).toBe(0);
  });
});
