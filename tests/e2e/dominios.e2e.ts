import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { dueno, escenarioAcceso } from "../apoyo";
import { CloudflareFalso, NAMESERVERS } from "../cloudflare-falso";
import { APP, abrirNavegador, captura, cerrarContextos, cerrarNavegador, dominiosDeDesarrollo, logueado } from "./navegador";
import { PUERTO_CF } from "./servidor";

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
const cf = new CloudflareFalso();

beforeAll(async () => {
  e = await escenarioAcceso();
  await dominiosDeDesarrollo(e.a, e.b);
  await cf.iniciar(PUERTO_CF);
  await abrirNavegador();
});
afterEach(async () => {
  await dueno.dominio.deleteMany({ where: { dominio: { in: ["www.lossatelites.com.ar", "lossatelites.com.ar"] } } });
  await dueno.auditoria.deleteMany({ where: { accion: { startsWith: "dominio." } } });
  await dueno.dominio.updateMany({ where: { dominio: { endsWith: ".lvh.me" } }, data: { esPrincipal: true } });
  cf.limpiar();
  await cerrarContextos();
});
afterAll(async () => {
  await cerrarNavegador();
  await cf.cerrar();
  await dueno.$disconnect();
});

const DOMINIOS = `${APP}/b/banda-a/dominios`;

describe("dominio propio desde el panel de la banda", () => {
  it("el titular lo agrega y ve el CNAME y el TXT exactos, listos para copiar", async () => {
    const { page } = await logueado("multi@x.com");
    await page.goto(`${APP}/b/banda-a`);
    await page.click('nav[aria-label="Panel"] a:text("Dominios")');
    await page.waitForURL(DOMINIOS);
    expect(await page.locator("[data-dominio]").first().getAttribute("data-dominio")).toBe("banda-a.lvh.me");

    const alta = page.locator("form[data-hidratado]", { has: page.getByRole("button", { name: "Agregar dominio" }) });
    await alta.locator('input[name="dominio"]').fill("https://www.LosSatelites.com.ar/");
    await alta.getByRole("button", { name: "Agregar dominio" }).click();
    await alta.getByRole("status").waitFor();

    const tarjeta = page.locator('[data-dominio="www.lossatelites.com.ar"]');
    await tarjeta.waitFor();
    expect(await tarjeta.textContent()).toContain("Sin verificar");
    // Se creó el custom hostname en Cloudflare.
    expect(cf.de("www.lossatelites.com.ar")).toBeDefined();
    const { token } = await dueno.dominio.findFirstOrThrow({ where: { dominio: "www.lossatelites.com.ar" } });
    const valores = (sel: string) => tarjeta.locator(`[data-registro="${sel}"] [data-copiable]`).allTextContents();
    expect(await valores("CNAME")).toEqual(["www.lossatelites.com.ar", "customers.lvh.me"]);
    expect(await valores("TXT")).toEqual(["_deoco.www.lossatelites.com.ar", `deoco-verificacion=${token}`]);

    // En http (desarrollo) no hay API de portapapeles: copia por selección.
    const copiar = tarjeta.getByRole("button", { name: "Copiar valor del registro CNAME" });
    await copiar.click();
    expect(await copiar.textContent()).toBe("Copiado");

    // Sin los registros, verificar dice qué falta y no lo verifica.
    const verificar = tarjeta.locator("form[data-hidratado]", { has: page.getByRole("button", { name: "Verificar" }) });
    await verificar.getByRole("button", { name: "Verificar" }).click();
    expect(await verificar.getByRole("alert").textContent()).toMatch(/^Sin verificar: todavía no vemos el CNAME apuntando a customers\.lvh\.me/);
    expect((await dueno.dominio.findFirstOrThrow({ where: { dominio: "www.lossatelites.com.ar" } })).verificado).toBe(false);
    // Sin verificar no se ofrece como principal.
    expect(await tarjeta.getByRole("button", { name: "Usar como principal" }).count()).toBe(0);
    await captura(page, "dominios");
  });

  it("verificado con el certificado emitiéndose: el botón lo explica; cuando Cloudflare lo emite, pasa a principal", async () => {
    cf.hostnames.set("ch-e2e", { id: "ch-e2e", hostname: "www.lossatelites.com.ar", status: "active", ssl: { status: "pending_validation" } });
    await dueno.dominio.create({
      data: { tenantId: e.a.id, dominio: "www.lossatelites.com.ar", verificado: true, via: "cname", proveedorId: "ch-e2e", estadoProveedor: "active", certificado: "pending_validation" },
    });
    const { page } = await logueado("multi@x.com");
    await page.goto(DOMINIOS);
    const tarjeta = page.locator('[data-dominio="www.lossatelites.com.ar"]');
    expect(await tarjeta.textContent()).toContain("Emitiendo el certificado");
    const form = tarjeta.locator("form[data-hidratado]", { has: page.getByRole("button", { name: "Usar como principal" }) });
    await form.getByRole("button", { name: "Usar como principal" }).click();
    expect(await form.getByRole("alert").textContent()).toMatch(/todavía se está emitiendo \(lo hace Cloudflare solo/);
    expect((await dueno.dominio.findFirstOrThrow({ where: { tenantId: e.a.id, esPrincipal: true } })).dominio).toBe("banda-a.lvh.me");

    cf.activar("www.lossatelites.com.ar");
    await form.getByRole("button", { name: "Usar como principal" }).click();
    // Ya es el principal: la página se rehace con la insignia.
    await tarjeta.getByText("Principal", { exact: true }).waitFor();
    expect((await dueno.dominio.findFirstOrThrow({ where: { tenantId: e.a.id, esPrincipal: true } })).dominio).toBe("www.lossatelites.com.ar");
  });

  it("delegar un .com.ar: los nameservers para nic.ar, lo que trajimos de su DNS y, al activarse, verificado", async () => {
    cf.dnsAnterior.set("lossatelites.com.ar", [{ type: "MX", name: "lossatelites.com.ar", content: "aspmx.l.google.com", proxied: false }]);
    const { page } = await logueado("multi@x.com");
    await page.goto(DOMINIOS);
    const alta = page.locator('[data-agregar="zona"] form[data-hidratado]');
    await alta.locator('input[name="dominio"]').fill("lossatelites.com.ar");
    await alta.getByRole("button", { name: "Delegar dominio" }).click();
    await alta.getByRole("status").waitFor();

    const tarjeta = page.locator('[data-dominio="lossatelites.com.ar"]');
    await tarjeta.waitFor();
    expect(await tarjeta.textContent()).toContain("Esperando los nameservers");
    expect(await tarjeta.textContent()).toContain("elegí Delegar y pegá estos dos nameservers");
    expect(await tarjeta.locator("[data-delegacion] [data-copiable]").allTextContents()).toEqual(NAMESERVERS);
    await tarjeta.locator("[data-importados] summary").click();
    expect(await tarjeta.locator("[data-importados]").textContent()).toContain("MX lossatelites.com.ar → aspmx.l.google.com");
    expect(await page.locator('[data-dominio="www.lossatelites.com.ar"]').textContent()).toContain("Se activa junto con lossatelites.com.ar");

    const ya = tarjeta.locator("form[data-hidratado]", { has: page.getByRole("button", { name: "Ya cambié los nameservers" }) });
    await ya.getByRole("button", { name: "Ya cambié los nameservers" }).click();
    expect(await ya.getByRole("alert").textContent()).toMatch(/^Todavía no vemos los nameservers de Deoco/);
    await captura(page, "dominios-delegar");

    cf.activarZona("lossatelites.com.ar", "pending_validation");
    await ya.getByRole("button", { name: "Ya cambié los nameservers" }).click();
    await tarjeta.getByText("Emitiendo el certificado", { exact: true }).waitFor();
    expect(await tarjeta.textContent()).toContain("Delegado");
    expect(await dueno.dominio.count({ where: { tenantId: e.a.id, via: "zona", verificado: true } })).toBe(2);
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
    for (const email of ["editor-a@x.com", "staff@deocoartist.com"]) {
      const { page } = await logueado(email);
      await page.goto(`${APP}/b/banda-a`);
      expect(await page.locator('nav[aria-label="Panel"] a:text("Dominios")').count()).toBe(0);
      expect((await page.goto(DOMINIOS))!.status()).toBe(403);
    }
  });

  it("uno con un problema (lo marcó la revisión): el titular ve el aviso en el panel y los registros a revisar", async () => {
    await dueno.dominio.create({
      data: {
        tenantId: e.a.id,
        dominio: "www.lossatelites.com.ar",
        verificado: true,
        via: "cname",
        problemaDesde: new Date("2026-10-12T15:00:00Z"),
        problema: "El CNAME de tu dominio dejó de apuntar a Deoco.",
      },
    });
    const { page } = await logueado("multi@x.com");
    await page.goto(`${APP}/b/banda-a`);
    const aviso = page.locator("[data-dominio-problema]");
    expect(await aviso.textContent()).toContain("www.lossatelites.com.ar tiene un problema");
    expect(await aviso.textContent()).toContain("El CNAME de tu dominio dejó de apuntar a Deoco.");
    await aviso.getByRole("link", { name: "Ver dominios" }).click();
    await page.waitForURL(DOMINIOS);
    const tarjeta = page.locator('[data-dominio="www.lossatelites.com.ar"]');
    expect(await tarjeta.textContent()).toContain("Con un problema");
    expect(await tarjeta.locator('[data-registro="CNAME"] [data-copiable]').allTextContents()).toEqual(["www.lossatelites.com.ar", "customers.lvh.me"]);

    // Otro rol no lo ve (no lo puede arreglar).
    const editor = await logueado("editor-a@x.com");
    await editor.page.goto(`${APP}/b/banda-a`);
    expect(await editor.page.locator("[data-dominio-problema]").count()).toBe(0);
  });
});
