import { request } from "node:http";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { conStaffComo } from "@/nucleo/acceso/staff";
import { esperarCorreos } from "@/nucleo/correo";
import { esperarEventos } from "@/nucleo/eventos/bus";
import { prenderModulo } from "@/nucleo/modulos/encendido";
import { guardarSecreto } from "@/nucleo/secretos/carga";
import tienda from "../../modulos/tienda";
import { type ComoStaff, crearProductoBase, crearProveedor, leerOpciones } from "../../modulos/tienda/catalogo";
import { registrarPago } from "../../modulos/tienda/pagos";
import { crearPedido } from "../../modulos/tienda/pedidos";
import { crearProducto, publicarProducto, subirDiseno } from "../../modulos/tienda/productos";
import { dueno, escenarioAcceso } from "../apoyo";
import { APP, abrirNavegador, anonimo, cerrarContextos, cerrarNavegador, dominiosDeDesarrollo, logueado } from "./navegador";

/** GET al servidor de pruebas por 127.0.0.1, con el Host del link (lvh.me no resuelve sin DNS). */
function estadoDe(link: string) {
  const u = new URL(link);
  return new Promise<number>((ok, mal) => {
    const r = request({ host: "127.0.0.1", port: u.port, path: u.pathname + u.search, headers: { host: u.host } }, (res) => {
      res.resume();
      ok(res.statusCode!);
    });
    r.on("error", mal);
    r.end();
  });
}

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
let pedidoId = "";
const png = (a: number, h: number) =>
  sharp({ create: { width: a, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).withMetadata({ density: 300 }).png().toBuffer();

beforeAll(async () => {
  e = await escenarioAcceso();
  await dominiosDeDesarrollo(e.a, e.b);
  await dueno.correo.deleteMany();
  for (const t of ["tiendaPagoExtra", "tiendaOrden", "tiendaDeuda", "tiendaPedidoItem", "tiendaPedido", "tiendaProducto", "tiendaDiseno", "tiendaProductoBase", "tiendaProveedor"] as const) {
    await (dueno[t] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await dueno.cuentaExterna.deleteMany();
  await dueno.usuario.deleteMany({ where: { email: "taller@sur.com" } });
  const comoStaff: ComoStaff = (accion, fn) => conStaffComo(e.staff.id, accion, fn);
  await crearProveedor(comoStaff, { nombre: "Estampados Sur", email: "ordenes@sur.com", contacto: "", formatos: ["png", "pdf"] });
  const remeraBase = await crearProductoBase(comoStaff, {
    descripcion: "", proveedorId: null, impresionDpi: 300, impresionFormatos: ["png"], nombre: "Remera", opciones: leerOpciones("Talle: S, M"),
    costoProduccion: 900000, costoEnvio: 350000, impresionAnchoPx: 4200, impresionAltoPx: 4800,
  });
  await prenderModulo(e.staff.id, e.a.id, "tienda");
  await guardarSecreto(e.multi.id, e.a.id, "tienda", "mercadopago_access_token", "APP_USR-e2e");
  const d = await subirDiseno(e.a.id, "Logo", { nombre: "logo.png", datos: await png(4200, 5000) });
  const remera = await crearProducto(e.a.id, remeraBase.id, { disenoId: d.id, nombre: "Remera Gira", descripcion: "", precio: 2500000, variantes: [{ nombre: "Talle", valores: ["M"] }] });
  await publicarProducto(e.a.id, remera.id, true);
  const pedido = await crearPedido(tienda, e.a.id, [{ productoId: remera.id, variante: { Talle: "M" }, cantidad: 2 }], {
    nombre: "Lucía Fan", email: "lucia@fan.com", telefono: "341 555-1234", calle: "Córdoba", numero: "1234", piso: "", ciudad: "Rosario", provincia: "Santa Fe", codigoPostal: "2000",
  });
  pedidoId = pedido.id;
  await registrarPago(e.a.id, "mercadopago", { cobroId: "e2e-1", estado: "aprobado", estadoPasarela: "approved", pedidoId: pedido.id, monto: pedido.total, moneda: "ARS" });
  await esperarEventos();
  await esperarCorreos();
  await abrirNavegador();
});
afterEach(() => cerrarContextos());
afterAll(async () => {
  await cerrarNavegador();
  await dueno.moduloTenant.deleteMany({ where: { moduloId: "tienda" } });
  await dueno.$disconnect();
});

describe("panel del proveedor", () => {
  it("el staff da acceso → el proveedor cambia la clave, ve su orden, la despacha y marca lo cobrado", async () => {
    // Staff: Proveedores → Accesos al panel → Dar acceso.
    const staff = (await logueado("staff@deoco.com")).page;
    await staff.goto(`${APP}/admin/m/tienda/proveedores`);
    await staff.locator("form[data-hidratado]").first().waitFor(); // un click antes de hidratar se pierde
    await staff.getByRole("link", { name: "Accesos al panel" }).click();
    await staff.waitForURL(/\/proveedores\/[0-9a-f-]+$/);
    const alta = staff.locator("form[data-hidratado]", { has: staff.getByRole("button", { name: "Dar acceso" }) });
    await alta.waitFor();
    await alta.locator('input[name="email"]').fill("taller@sur.com");
    await alta.locator('input[name="nombre"]').fill("Taller Sur");
    await alta.getByRole("button", { name: "Dar acceso" }).click();
    const mensaje = (await alta.getByRole("status").textContent())!;
    const clave = mensaje.match(/clave temporal ([a-z2-9-]{14})/)![1];
    expect(mensaje).toContain("/portal/tienda");
    await staff.reload();
    expect(await staff.locator('[data-acceso="taller@sur.com"]').textContent()).toContain("Clave temporal");

    // Proveedor: entra, cambia la clave y cae en su panel (no tiene bandas).
    const p = (await anonimo()).page;
    await p.goto(`${APP}/ingresar`);
    await p.fill('input[name="email"]', "taller@sur.com");
    await p.fill('input[name="contrasena"]', clave);
    await Promise.all([p.waitForURL(`${APP}/clave`), p.click('button[type="submit"]')]);
    const formClave = p.locator("form[data-hidratado]");
    await formClave.waitFor();
    await formClave.locator('input[name="actual"]').fill(clave);
    await formClave.locator('input[name="nueva"]').fill("clave-del-taller");
    await formClave.locator('input[name="repetida"]').fill("clave-del-taller");
    await Promise.all([p.waitForURL(`${APP}/portal/tienda`), formClave.getByRole("button", { name: "Guardar clave" }).click()]);
    const numero = pedidoId.slice(0, 8).toUpperCase();
    expect(await p.locator(`[data-orden="${numero}"]`).count()).toBe(1);
    // Nunca un panel de banda.
    expect((await p.goto(`${APP}/b/banda-a`))!.status()).toBe(403);
    expect((await p.goto(`${APP}/admin`))!.status()).toBe(404);

    // Detalle: lo que hay que producir, el archivo (link firmado) y adónde mandarlo.
    await p.goto(`${APP}/portal/tienda/ordenes/${(await dueno.tiendaOrden.findFirstOrThrow({ where: { pedidoId } })).id}`);
    expect(await p.locator('[data-renglon="Remera"]').textContent()).toContain("2 × Remera · Talle: M");
    expect(await p.locator("[data-envio]").textContent()).toContain("Córdoba 1234");
    const link = (await p.locator("[data-link-impresion]").getAttribute("href"))!;
    expect(link).toMatch(/\/descargas\/.*\?vence=\d+&firma=/);
    expect(await estadoDe(link)).toBe(200);
    expect(await p.locator("main").textContent()).not.toContain("25.000");

    // Despacha con seguimiento → el fan recibe el mail (lo manda el servidor).
    const despachar = p.locator("form[data-hidratado]", { has: p.getByRole("button", { name: "Marcar despachada" }) });
    await despachar.locator('input[name="seguimiento"]').fill("AR123456789");
    await despachar.getByRole("button", { name: "Marcar despachada" }).click();
    // Al guardar, la página se rehace: en lugar del formulario queda el despacho.
    expect(await p.locator("[data-despachada]").textContent()).toContain("Seguimiento: AR123456789.");
    expect((await dueno.tiendaPedido.findUniqueOrThrow({ where: { id: pedidoId } })).estado).toBe("DESPACHADO");
    for (let i = 0; i < 40 && !(await dueno.correo.findFirst({ where: { claveUnica: { startsWith: "orden:" } } })); i++) await new Promise((r) => setTimeout(r, 250));
    const mail = await dueno.correo.findFirstOrThrow({ where: { claveUnica: { startsWith: "orden:" } } });
    expect([mail.para, mail.texto.includes("AR123456789")]).toEqual(["lucia@fan.com", true]);

    // Cuenta corriente: marca saldado; la banda lo ve.
    await p.goto(`${APP}/portal/tienda/cuenta`);
    const cuenta = p.locator('[data-cuenta="Banda A"]');
    expect(await cuenta.locator("[data-pendiente]").textContent()).toMatch(/21\.500/);
    const saldar = cuenta.locator("form[data-hidratado]");
    await saldar.getByText(`Orden #${numero}`).click();
    await saldar.locator('input[name="nota"]').fill("transferencia");
    await saldar.getByRole("button", { name: "Marcar saldadas" }).click();
    // Era la única: el formulario se va y queda en "Saldadas".
    await cuenta.locator(`[data-saldada="${numero}"]`).waitFor({ state: "attached" });
    expect(await cuenta.locator("[data-pendiente]").textContent()).toMatch(/\$\s0/);
    const banda = (await logueado("multi@x.com")).page;
    await banda.goto(`${APP}/b/banda-a/tienda/deuda`);
    expect(await banda.locator('[data-deuda="Estampados Sur"]').textContent()).toMatch(/0 pedido\(s\) sin saldar.*21\.500.*saldado/);
    await banda.goto(`${APP}/b/banda-a/tienda/pedidos`);
    expect(await banda.locator(`[data-pedido="${pedidoId}"]`).locator("..").locator("..").textContent()).toContain("Seguimiento: AR123456789");
  });

  it("sin cuenta externa, el portal es 404; en un host de banda también", async () => {
    const { page } = await logueado("multi@x.com");
    expect((await page.goto(`${APP}/portal/tienda`))!.status()).toBe(404);
    expect((await page.goto(`http://banda-a.lvh.me:3200/portal/tienda`))!.status()).toBe(404);
  });
});
