import { request } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { alCrearBanda } from "../../modulos/comercial/cuenta";
import { dueno, escenarioAcceso } from "../apoyo";
import { MercadoPagoFalso } from "../mercadopago-falso";
import { APP, abrirNavegador, anonimo, captura, cerrarContextos, cerrarNavegador, dominiosDeDesarrollo, logueado, sitio } from "./navegador";
import { PUERTO, PUERTO_MP, TOKEN_CUOTA } from "./servidor";

// Plan y pago de punta a punta: el titular elige un plan, carga la tarjeta en la pasarela de
// DEOCO (falsa), vuelve y ve el plan aplicado; un cobro rechazado y la suspensión; el back office.

const mp = new MercadoPagoFalso();
let e: Awaited<ReturnType<typeof escenarioAcceso>>;

/** POST crudo al servidor de pruebas (lo que haría Mercado Pago con el aviso de la cuota). */
function avisoCuota(tipo: string, id: string) {
  return new Promise<number>((ok, mal) => {
    const r = request(
      { host: "127.0.0.1", port: PUERTO, path: "/avisos/plataforma/comercial/cuota/mercadopago", method: "POST", headers: { host: `app.lvh.me:${PUERTO}`, "content-type": "application/json" } },
      (res) => {
        res.resume();
        res.on("end", () => ok(res.statusCode ?? 0));
      },
    );
    r.on("error", mal);
    r.end(JSON.stringify({ type: tipo, data: { id } }));
  });
}

beforeAll(async () => {
  await mp.iniciar(PUERTO_MP);
  e = await escenarioAcceso();
  await dominiosDeDesarrollo(e.a, e.b);
  for (const [id, precio] of [["esencial", 800000], ["medium", 2000000], ["premium", 4500000]] as const) {
    await dueno.comercialPlan.update({ where: { id }, data: { precio } });
  }
  // La banda A se dio de alta hoy: prueba de 14 días con Medium.
  process.env.DEOCO_MERCADOPAGO_API = mp.base;
  process.env.DEOCO_CUOTA_MP_TOKEN = TOKEN_CUOTA;
  await alCrearBanda(e.a.id);
  await abrirNavegador();
});
afterEach(() => cerrarContextos());
afterAll(async () => {
  await cerrarNavegador();
  await mp.cerrar();
  await dueno.$disconnect();
});

describe("plan y pago", () => {
  it("el titular ve su prueba, elige Premium, carga la tarjeta en la pasarela de Deoco y vuelve con el plan aplicado", async () => {
    const { page } = await logueado("multi@x.com");
    await page.goto(`${APP}/b/banda-a/pago`);
    const actual = page.locator('[data-testid="plan-actual"]');
    expect(await actual.getAttribute("data-plan")).toBe("medium");
    expect(await actual.textContent()).toContain("Prueba gratis hasta el");
    await captura(page, "pago-prueba");

    const premium = page.locator('[data-plan-opcion="premium"]');
    await premium.locator("form[data-hidratado]").waitFor();
    await premium.getByRole("button", { name: "Elegir Premium" }).click();
    await page.waitForURL(new RegExp(`^${mp.base}/suscribir\\?id=`));
    const id = new URL(page.url()).searchParams.get("id")!;
    expect(mp.suscripciones.get(id)).toMatchObject({ token: TOKEN_CUOTA, external_reference: e.a.id, monto: 45000 });

    // "Carga la tarjeta" y vuelve: al volver, la pantalla consulta la suscripción.
    mp.autorizar(id);
    await page.click("text=Volver");
    await page.waitForURL(`${APP}/b/banda-a/pago?suscripcion=volvio`);
    expect(await page.locator('[data-testid="plan-actual"]').getAttribute("data-plan")).toBe("premium");
    expect(await page.locator('[data-testid="forma-de-pago"]').textContent()).toContain("Mercado Pago · Visa");
    await captura(page, "pago-premium");
    // La ticketera ya está en el menú.
    expect(await page.locator('nav a:text("Entradas")').count()).toBeGreaterThan(0);
  });

  it("un cobro rechazado: aviso de mora en el panel; suspendida: solo Plan y pago, el sitio sigue online", async () => {
    const cuenta = await dueno.comercialCuenta.findUniqueOrThrow({ where: { tenantId: e.a.id } });
    expect(await avisoCuota("subscription_authorized_payment", mp.cobrar(cuenta.suscripcionId!, false))).toBe(200);
    expect((await dueno.tenant.findUniqueOrThrow({ where: { id: e.a.id } })).estado).toBe("MOROSO");

    const { page } = await logueado("multi@x.com");
    await page.goto(`${APP}/b/banda-a`);
    expect(await page.locator('[data-testid="aviso-mora"]').textContent()).toContain("Pagar");

    // 10 días después (lo hace el barrido): SUSPENDIDO.
    await dueno.comercialCuenta.update({ where: { tenantId: e.a.id }, data: { moraDesde: new Date(Date.now() - 11 * 86_400_000) } });
    const { revisarVencimientos } = await import("../../modulos/comercial/cuenta");
    await revisarVencimientos();
    expect((await dueno.tenant.findUniqueOrThrow({ where: { id: e.a.id } })).estado).toBe("SUSPENDIDO");

    const r = await page.goto(`${APP}/b/banda-a/sitio`);
    expect(r?.status()).toBe(403);
    await page.goto(`${APP}/b/banda-a/pago`);
    expect(await page.locator('[data-testid="estado"]').getAttribute("data-estado")).toBe("SUSPENDIDO");
    await captura(page, "pago-suspendida");
    const publico = await anonimo();
    expect((await publico.page.goto(sitio("banda-a")))?.status()).toBe(200);

    // Paga: vuelve a ACTIVO al instante.
    expect(await avisoCuota("subscription_authorized_payment", mp.cobrar(cuenta.suscripcionId!, true))).toBe(200);
    expect((await dueno.tenant.findUniqueOrThrow({ where: { id: e.a.id } })).estado).toBe("ACTIVO");
    expect((await page.goto(`${APP}/b/banda-a/sitio`))?.status()).toBe(200);
  });

  it("otro rol no entra a Plan y pago", async () => {
    const { page } = await logueado("editor-a@x.com");
    const r = await page.goto(`${APP}/b/banda-a/pago`);
    expect(r?.status()).toBe(403);
  });

  it("el staff ve las cuentas y edita los planes", async () => {
    const { page } = await logueado("staff@deoco.com");
    await page.goto(`${APP}/admin/m/comercial`);
    const fila = page.locator('[data-cuenta="banda-a"]');
    await fila.waitFor();
    expect(await page.locator('[data-plan="premium"]').count()).toBeGreaterThan(0);
    await captura(page, "admin-cuentas");
    await page.goto(`${APP}/admin/m/comercial/planes`);
    const esencial = page.locator('section[data-plan="esencial"]');
    await esencial.locator("form[data-hidratado]").waitFor();
    await esencial.locator('input[name="precio"]').fill("9.500");
    await esencial.getByRole("button", { name: "Guardar" }).click();
    await esencial.locator("text=Plan guardado.").waitFor();
    expect((await dueno.comercialPlan.findUniqueOrThrow({ where: { id: "esencial" } })).precio).toBe(950000);
    await captura(page, "admin-planes");
  });
});
