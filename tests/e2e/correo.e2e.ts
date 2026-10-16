import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { dueno, escenarioAcceso, sesionDeSoporte } from "../apoyo";
import { CloudflareFalso } from "../cloudflare-falso";
import { ResendFalso } from "../resend-falso";
import { APP, abrirNavegador, captura, cerrarContextos, cerrarNavegador, dominiosDeDesarrollo, logueado } from "./navegador";
import { PUERTO_CF, PUERTO_RESEND } from "./servidor";

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
const cf = new CloudflareFalso();
const resend = new ResendFalso();

beforeAll(async () => {
  e = await escenarioAcceso();
  await dominiosDeDesarrollo(e.a, e.b);
  await cf.iniciar(PUERTO_CF);
  await resend.iniciar(PUERTO_RESEND);
  await abrirNavegador();
});
afterEach(async () => {
  await dueno.correoDominio.deleteMany();
  await dueno.dominio.deleteMany({ where: { dominio: "lossatelites.com" } });
  cf.limpiar();
  resend.limpiar();
  await cerrarContextos();
});
afterAll(async () => {
  await cerrarNavegador();
  await cf.cerrar();
  await resend.cerrar();
  await dueno.$disconnect();
});

const CORREO = `${APP}/b/banda-a/correo`;

describe("correo desde el dominio de la banda", () => {
  it("sin dominio propio, la pantalla manda a Dominios", async () => {
    const { page } = await logueado("multi@x.com");
    await page.goto(`${APP}/b/banda-a`);
    await page.click('nav[aria-label="Panel"] a:text("Correo")');
    await page.waitForURL(CORREO);
    expect(await page.getByText("Primero, un dominio propio").count()).toBe(1);
  });

  it("delegado: guarda la dirección, Deoco carga los registros y prende el reenvío; verificada, el mail de prueba sale", async () => {
    cf.zonas.set("z-1", { id: "z-1", name: "lossatelites.com", status: "active", name_servers: [], certificado: "active", registros: [] });
    await dueno.dominio.create({ data: { tenantId: e.a.id, dominio: "lossatelites.com", verificado: true, via: "zona", proveedorId: "z-1" } });
    const { page } = await logueado("multi@x.com");
    await page.goto(CORREO);
    const form = page.locator("form[data-hidratado]", { has: page.getByRole("button", { name: "Guardar" }) });
    await form.locator('input[name="local"]').fill("merch");
    await form.locator('input[name="reenvioA"]').fill("banda@gmail.com");
    await form.getByRole("button", { name: "Guardar" }).click();
    await form.getByRole("status").waitFor();

    const tarjeta = page.locator('[data-correo="pendiente"]');
    await tarjeta.waitFor();
    expect(await tarjeta.textContent()).toContain("merch@lossatelites.com");
    expect(await tarjeta.textContent()).toContain("Ya cargamos los registros en tu dominio");
    expect(await tarjeta.locator('[data-recepcion="activa"]').textContent()).toContain("se reenvía a banda@gmail.com");
    expect(cf.kv.get("merch@lossatelites.com")).toBe("banda@gmail.com");
    await captura(page, "correo");

    resend.verificar("lossatelites.com");
    const verificar = tarjeta.locator("form[data-hidratado]", { has: page.getByRole("button", { name: "Verificar" }) });
    await verificar.getByRole("button", { name: "Verificar" }).click();
    const lista = page.locator('[data-correo="verificado"]');
    await lista.waitFor();
    const probar = lista.locator("form[data-hidratado]", { has: page.getByRole("button", { name: "Mandarme un mail de prueba" }) });
    await probar.getByRole("button", { name: "Mandarme un mail de prueba" }).click();
    await probar.getByText(/Mandamos un mail de prueba a merch@lossatelites.com: en unos minutos te tiene que llegar a banda@gmail.com/).waitFor();
  });

  it("solo el titular: otro rol y el staff reciben 403 y no ven la entrada", async () => {
    // El staff, con su sesión de soporte (D3: entra como gestor): tampoco.
    await sesionDeSoporte("staff@deocoartist.com", "banda-a");
    for (const email of ["editor-a@x.com", "staff@deocoartist.com"]) {
      const { page } = await logueado(email);
      await page.goto(`${APP}/b/banda-a`);
      expect(await page.locator('nav[aria-label="Panel"] a:text("Correo")').count()).toBe(0);
      expect((await page.goto(CORREO))!.status()).toBe(403);
    }
  });
});
