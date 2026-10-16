import { request } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { guardarArchivo } from "@/nucleo/archivos";
import { prenderModulo } from "@/nucleo/modulos/encendido";
import { guardarSecreto } from "@/nucleo/secretos/carga";
import { crearEvento, crearTipo, publicarEvento } from "../../modulos/ticketera/eventos";
import { dueno, escenarioAcceso } from "../apoyo";
import { MercadoPagoFalso } from "../mercadopago-falso";
import { APP, abrirNavegador, anonimo, cerrarContextos, cerrarNavegador, dominiosDeDesarrollo, logueado, sitio } from "./navegador";
import { PUERTO, PUERTO_MP } from "./servidor";

const mp = new MercadoPagoFalso();
const TOKEN_A = "APP_USR-ticketera-e2e";
const SITIO = sitio("banda-a");
let e: Awaited<ReturnType<typeof escenarioAcceso>>;
let showId = "";

/** POST crudo al servidor de pruebas (lo que haría Mercado Pago con el aviso). */
function postear(host: string, path: string, cuerpo: string) {
  return new Promise<string>((ok, mal) => {
    const r = request({ host: "127.0.0.1", port: PUERTO, path, method: "POST", headers: { host: `${host}:${PUERTO}`, "content-type": "application/json" } }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => ok(d));
    });
    r.on("error", mal);
    r.end(cuerpo);
  });
}

beforeAll(async () => {
  await mp.iniciar(PUERTO_MP);
  e = await escenarioAcceso();
  await dominiosDeDesarrollo(e.a, e.b);
  for (const t of ["ticketeraEntrada", "ticketeraCompra", "ticketeraTipo", "ticketeraEvento"] as const) {
    await (dueno[t] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await dueno.correo.deleteMany();
  await dueno.secreto.deleteMany();
  await prenderModulo(e.staff.id, e.a.id, "ticketera");
  await prenderModulo(e.staff.id, e.a.id, "sitio");
  await guardarSecreto(e.multi.id, e.a.id, "pagos", "mercadopago_access_token", TOKEN_A);
  // El rol PUERTA: solo valida.
  const puerta = await dueno.usuario.findUniqueOrThrow({ where: { email: "ajeno@x.com" } });
  await dueno.membresia.create({ data: { tenantId: e.a.id, usuarioId: puerta.id, rol: "PUERTA" } });
  showId = await crearEvento(e.a.id, {
    nombre: "Gira Satélite", fecha: new Date(Date.now() + 20 * 86400_000), lugar: "La Trastienda", ciudad: "CABA", direccion: "Balcarce 460", descripcion: "Presentación del disco.",
  });
  await crearTipo(e.a.id, showId, { nombre: "General", precio: 1500000, cupo: 100, ventaDesde: null, ventaHasta: null });
  await publicarEvento(e.a.id, showId, true);
  await abrirNavegador();
});
afterEach(() => cerrarContextos());
afterAll(async () => {
  await cerrarNavegador();
  await mp.cerrar();
  await dueno.membresia.deleteMany({ where: { rol: "PUERTA" } });
  await dueno.moduloTenant.deleteMany({ where: { moduloId: { in: ["ticketera", "sitio"] } } });
  await dueno.$disconnect();
});

describe("ticketera", () => {
  it("el fan compra dos entradas nominadas, paga, ve sus QR; en la puerta entra una vez", async () => {
    const { page } = await anonimo();
    await page.goto(`${SITIO}/fechas`);
    expect(await page.locator('nav a:text("Fechas")').count()).toBeGreaterThan(0);
    const fila = page.locator('[data-fecha="Gira Satélite"]');
    expect((await fila.textContent())!.replace(/\s/g, " ")).toContain("Entradas desde $ 15.000");
    await page.goto(`${SITIO}/fechas/${showId}`);
    const f = page.locator("form[data-comprar]");
    await f.waitFor();
    await page.waitForFunction(() => document.querySelector("form[data-comprar] select[name=cantidad]") !== null);
    await f.locator("select[name=cantidad]").selectOption("2");
    await f.locator("input[name=nombre]").fill("Lucía Fan");
    await f.locator("input[name=email]").fill("lucia@fan.com");
    await f.locator('input[name="asistente-0-nombre"]').fill("Lucía Fan");
    await f.locator('input[name="asistente-0-documento"]').fill("30111222");
    await f.locator('input[name="asistente-1-nombre"]').fill("Tomás Amigo");
    await f.locator('input[name="asistente-1-documento"]').fill("31222333");
    await f.getByRole("button", { name: "Ir a pagar" }).click();
    await page.waitForURL(new RegExp(`^${mp.base}/checkout\\?pref=`));
    expect(mp.preferencias.map((p) => p.token)).toEqual([TOKEN_A]);

    const compra = await dueno.ticketeraCompra.findFirstOrThrow();
    expect(compra).toMatchObject({ estado: "RESERVADA", cantidad: 2, total: 3000000, email: "lucia@fan.com" });
    // La pasarela no recibió el token de las entradas.
    expect(JSON.stringify(mp.preferencias[0].cuerpo)).not.toContain(compra.token);
    // Vuelve antes del aviso (como lo devuelve la pasarela, sin token): "confirmando".
    await page.goto(`${SITIO}/fechas/compra/${compra.id}?resultado=exito`);
    expect(await page.locator("[data-estado-compra]").textContent()).toContain("Estamos confirmando tu pago");

    mp.pagos.set("901", { status: "approved", external_reference: compra.id, transaction_amount: 30000, currency_id: "ARS", token: TOKEN_A });
    const r = await postear("app.lvh.me", `/avisos/${e.a.id}/ticketera/pago/mercadopago`, JSON.stringify({ type: "payment", data: { id: "901" } }));
    expect(JSON.parse(r)).toEqual({ resultado: "pagada" });
    // Este navegador compró: la cookie le da acceso, sin token en la URL.
    await page.goto(`${SITIO}/fechas/compra/${compra.id}?resultado=exito`);
    const entradas = page.locator("[data-entrada]");
    expect(await entradas.count()).toBe(2);
    expect(await entradas.first().locator("svg").count()).toBe(1);
    expect(await page.locator("main").textContent()).toContain("Tomás Amigo");

    // El mail con un QR por entrada (lo manda el servidor).
    for (let i = 0; i < 40 && !(await dueno.correo.findFirst({ where: { moduloId: "ticketera" } })); i++) await new Promise((r) => setTimeout(r, 250));
    const mail = await dueno.correo.findFirstOrThrow({ where: { moduloId: "ticketera" } });
    expect([mail.para, (mail.adjuntos as unknown[]).length]).toEqual(["lucia@fan.com", 2]);

    // Otro navegador: sin acceso solo ve el estado; con el link del mail (#token) ve las entradas
    // y el token desaparece de la barra de direcciones.
    const otro = (await anonimo()).page;
    await otro.goto(`${SITIO}/fechas/compra/${compra.id}`);
    expect(await otro.locator("[data-estado-compra]").textContent()).toContain("abrí el link de ese mail");
    expect(await otro.locator("[data-entrada]").count()).toBe(0);
    const link = mail.texto.match(/https?:\/\/\S+#[0-9a-f]+/)![0];
    expect(link).toBe(`${SITIO}/fechas/compra/${compra.id}#${compra.token}`);
    const delMail = (await anonimo()).page; // el link del mail abre una pestaña nueva
    await delMail.goto(link);
    await delMail.locator("[data-entrada]").first().waitFor();
    expect(await delMail.locator("[data-entrada]").count()).toBe(2);
    expect(delMail.url()).toBe(`${SITIO}/fechas/compra/${compra.id}`);
    // Un token falso no da acceso.
    const intruso = (await anonimo()).page;
    await intruso.goto(`${SITIO}/fechas/compra/${compra.id}#${"0".repeat(32)}`);
    await intruso.waitForTimeout(1500);
    expect(await intruso.locator("[data-entrada]").count()).toBe(0);

    // Puerta, en el celular, con el rol PUERTA.
    const [primera] = await dueno.ticketeraEntrada.findMany({ orderBy: { nombre: "asc" } });
    const p = (await logueado("ajeno@x.com")).page;
    await p.setViewportSize({ width: 390, height: 844 });
    await p.goto(`${APP}/b/banda-a/puerta`);
    // Solo ve la puerta (no las ventas).
    const menu = await p.locator('nav[aria-label="Panel"]').textContent();
    expect(menu).not.toContain("Entradas");
    expect(menu).not.toContain("Sitio");
    expect(menu).not.toContain("Tienda");
    await p.locator('[data-puerta-evento="Gira Satélite"]').click();
    await p.waitForURL(/\/puerta\/[0-9a-f-]+$/);
    await p.locator("[data-puerta][data-hidratado]").waitFor(); // antes de hidratar, el formulario no valida
    expect(await p.locator("[data-faltan]").textContent()).toBe("2");
    const tipear = async (codigo: string) => {
      await p.locator("[data-puerta] input[name=codigo]").fill(codigo);
      await p.locator("[data-puerta] button[type=submit]").click();
    };
    await tipear(primera.codigo.toLowerCase());
    const res = p.locator("[data-resultado]");
    expect(await res.getAttribute("data-resultado")).toBe("valida");
    expect(await res.textContent()).toContain("PASA");
    expect(await res.textContent()).toContain(primera.nombre);
    await res.click();
    await tipear(primera.codigo);
    expect(await p.locator("[data-resultado]").getAttribute("data-resultado")).toBe("ya-validada");
    expect(await p.locator("[data-resultado]").textContent()).toMatch(/YA ENTRÓ.*Validada a las \d{2}:\d{2}/);
    await p.locator("[data-resultado]").click();
    await tipear("NOEXISTE22");
    expect(await p.locator("[data-resultado]").getAttribute("data-resultado")).toBe("invalida");
    expect(await p.locator("[data-entraron]").textContent()).toBe("1");
    expect(await p.locator("[data-faltan]").textContent()).toBe("1");

    // El panel de la banda: vendidas y disponibles.
    const banda = (await logueado("multi@x.com")).page;
    await banda.goto(`${APP}/b/banda-a/entradas/${showId}`);
    const tipo = banda.locator('tr:has([data-tipo="General"])');
    expect([await tipo.locator("[data-vendidas]").textContent(), await tipo.locator("[data-disponibles]").textContent()]).toEqual(["2", "98"]);
  });

  it("con la banda suspendida o archivada la puerta sigue para el show vendido; el resto del panel, cerrado", async () => {
    const [pendiente] = await dueno.ticketeraEntrada.findMany({ where: { eventoId: showId, validadaEn: null } });
    try {
      await dueno.tenant.update({ where: { id: e.a.id }, data: { estado: "SUSPENDIDO" } });
      const p = (await logueado("ajeno@x.com")).page;
      await p.goto(`${APP}/b/banda-a/puerta`);
      expect(await p.locator('nav[aria-label="Panel"]').textContent()).toContain("Puerta");
      await p.locator('[data-puerta-evento="Gira Satélite"]').click();
      await p.waitForURL(/\/puerta\/[0-9a-f-]+$/);
      await p.locator("[data-puerta][data-hidratado]").waitFor();
      await p.locator("[data-puerta] input[name=codigo]").fill(pendiente.codigo);
      await p.locator("[data-puerta] button[type=submit]").click();
      expect(await p.locator("[data-resultado]").getAttribute("data-resultado")).toBe("valida");

      // El titular no usa el resto del panel: va al inicio, que explica la suspensión (403).
      const banda = (await logueado("multi@x.com")).page;
      for (const ruta of ["/sitio", "/entradas"]) {
        expect((await banda.goto(`${APP}/b/banda-a${ruta}`))!.status()).toBe(403);
      }

      // Archivada: la puerta del show vendido sigue; lo demás, 404.
      await dueno.tenant.update({ where: { id: e.a.id }, data: { estado: "ARCHIVADO" } });
      expect((await p.goto(`${APP}/b/banda-a/puerta/${showId}`))!.status()).toBe(200);
      expect(await p.locator("[data-entraron]").textContent()).toBe("2");
      expect((await banda.goto(`${APP}/b/banda-a/sitio`))!.status()).toBe(404);
    } finally {
      await dueno.tenant.update({ where: { id: e.a.id }, data: { estado: "ACTIVO" } });
    }
  });

  it("PUERTA, con el id exacto de un archivo de la tienda, recibe 403; el titular lo recibe", async () => {
    await prenderModulo(e.staff.id, e.a.id, "tienda");
    const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c636000010000050001a5f645400000000049454e44ae426082", "hex");
    const { id } = await guardarArchivo(e.a.id, { nombre: "diseno.png", datos: PNG }, { moduloId: "tienda", recurso: "diseno", tipos: ["png"] });
    try {
      const p = (await logueado("ajeno@x.com")).page;
      expect((await p.goto(`${APP}/b/banda-a/archivos/${id}/diseno.png`))!.status()).toBe(403);
      const banda = (await logueado("multi@x.com")).page;
      expect((await banda.goto(`${APP}/b/banda-a/archivos/${id}/diseno.png`))!.status()).toBe(200);
    } finally {
      await dueno.archivo.deleteMany({ where: { id } });
      await dueno.moduloTenant.deleteMany({ where: { tenantId: e.a.id, moduloId: "tienda" } });
    }
  });

  it("la vista previa del sitio muestra lo mismo que el público: pestañas de los módulos y fechas de la ticketera", async () => {
    await dueno.sitioFecha.create({ data: { tenantId: e.a.id, fecha: new Date("2030-01-01"), lugar: "Cargada a mano", ciudad: "Rosario" } });
    const { page } = await logueado("multi@x.com");
    await page.goto(`${APP}/b/banda-a/sitio/vista-previa`);
    const previa = page.getByTestId("vista-previa");
    const pestanas = await previa.locator('nav[aria-label="Sitio"] a').evaluateAll((as) => as.map((a) => [a.textContent, (a as HTMLAnchorElement).getAttribute("href")]));
    expect(pestanas).toEqual([
      ["Home", "/b/banda-a/sitio/vista-previa"],
      ["Fechas", `${SITIO}/fechas`],
      ["Press kit", "/b/banda-a/sitio/vista-previa/prensa"],
    ]);
    // Con la ticketera prendida, sus shows y los cargados a mano (como en el sitio).
    const texto = (await previa.textContent()) ?? "";
    expect(texto).toContain("La Trastienda");
    expect(texto).toContain("Cargada a mano");
    expect(await previa.getByRole("link", { name: "Entradas" }).getAttribute("href")).toBe(`${SITIO}/fechas/${showId}`);
    await dueno.sitioFecha.deleteMany({ where: { tenantId: e.a.id } });
  });

  it("comprar las últimas entradas lleva a pagar (la página se rehace como agotada, pero el fan va a la pasarela)", async () => {
    const ultimo = await crearEvento(e.a.id, {
      nombre: "Último lugar", fecha: new Date(Date.now() + 25 * 86400_000), lugar: "Club", ciudad: "Rosario", direccion: "", descripcion: "",
    });
    await crearTipo(e.a.id, ultimo, { nombre: "Única", precio: 800000, cupo: 1, ventaDesde: null, ventaHasta: null });
    await publicarEvento(e.a.id, ultimo, true);
    const { page } = await anonimo();
    await page.goto(`${SITIO}/fechas/${ultimo}`);
    const f = page.locator("form[data-comprar]");
    await page.waitForFunction(() => document.querySelector("form[data-comprar] select[name=cantidad]") !== null);
    await page.waitForLoadState("networkidle"); // hidratado: si no, el formulario se envía sin JavaScript
    await f.locator("input[name=nombre]").fill("Última Fan");
    await f.locator("input[name=email]").fill("ultima@fan.com");
    await f.locator('input[name="asistente-0-nombre"]').fill("Última Fan");
    await f.locator('input[name="asistente-0-documento"]').fill("32000111");
    await f.getByRole("button", { name: "Ir a pagar" }).click();
    await page.waitForURL(new RegExp(`^${mp.base}/checkout\\?pref=`));
    expect(await page.locator("[data-pasarela]").textContent()).toBe("Pagá con Mercado Pago");
  });
});
