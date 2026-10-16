import { request } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { barrer } from "@/nucleo/barrido";
import { avanzarCompras, dominioPagado, esperarCompras } from "@/nucleo/dominios/compra";
import { dueno, escenarioAcceso } from "../apoyo";
import { CloudflareFalso } from "../cloudflare-falso";
import { MercadoPagoFalso } from "../mercadopago-falso";
import { RegistradorFalso } from "../registrador-falso";
import { APP, abrirNavegador, captura, cerrarContextos, cerrarNavegador, dominiosDeDesarrollo, logueado } from "./navegador";
import { PUERTO, PUERTO_CF, PUERTO_GD, PUERTO_MP } from "./servidor";
import comercial from "../../modulos/comercial";

// D10: comprar un dominio desde el panel, de punta a punta (con Mercado Pago, GoDaddy y
// Cloudflare falsos). Buscar → elegir → titular → resumen (con el costo de irse) → pagar →
// progreso (que sobrevive a cerrar la página) → corregir un dato rechazado.

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
const mp = new MercadoPagoFalso();
const cf = new CloudflareFalso();
const gd = new RegistradorFalso();
const MIN = 60_000;

function avisoDominio(id: string) {
  return new Promise<number>((ok, mal) => {
    const r = request(
      { host: "127.0.0.1", port: PUERTO, path: "/avisos/plataforma/comercial/dominio/mercadopago", method: "POST", headers: { host: `app.lvh.me:${PUERTO}`, "content-type": "application/json" } },
      (res) => {
        res.resume();
        res.on("end", () => ok(res.statusCode ?? 0));
      },
    );
    r.on("error", mal);
    r.end(JSON.stringify({ type: "payment", data: { id } }));
  });
}

beforeAll(async () => {
  e = await escenarioAcceso();
  await dominiosDeDesarrollo(e.a, e.b);
  await Promise.all([mp.iniciar(PUERTO_MP), cf.iniciar(PUERTO_CF), gd.iniciar(PUERTO_GD)]);
  // Este proceso también avanza compras (lo que haría el barrido del servidor): mismos falsos.
  cf.usar();
  gd.usar();
  process.env.DEOCO_DOMINIO_RAIZ = "lvh.me";
  await dueno.comercialDominioPrecio.create({ data: { tld: "com", precio: 2500000 } });
  await abrirNavegador();
});
afterEach(async () => {
  await esperarCompras();
  await cerrarContextos();
});
afterAll(async () => {
  await cerrarNavegador();
  await Promise.all([mp.cerrar(), cf.cerrar(), gd.cerrar()]);
  await dueno.$disconnect();
});

describe("comprar un dominio", () => {
  it("buscar, titular, resumen con el costo de irse, pagar y ver el progreso aunque se cierre la página", async () => {
    let { page } = await logueado("multi@x.com");
    await page.goto(`${APP}/b/banda-a/dominios`);
    await Promise.all([page.waitForURL(`${APP}/b/banda-a/dominios/comprar`), page.locator("[data-comprar-dominio]").getByRole("link", { name: "Buscar un dominio" }).click()]);

    const buscar = page.locator("[data-buscar-dominio] form[data-hidratado]");
    await buscar.waitFor();
    await buscar.locator('input[name="q"]').fill("Los Satelites");
    await Promise.all([page.waitForURL(/comprar\?q=Los%20Satelites$/), buscar.getByRole("button", { name: "Buscar" }).click()]);
    await page.getByText("letras, números o guiones").waitFor(); // con espacio: no es un nombre válido
    const buscar2 = page.locator("[data-buscar-dominio] form[data-hidratado]");
    await buscar2.waitFor();
    await buscar2.locator('input[name="q"]').fill("lossatelites");
    await Promise.all([page.waitForURL(`${APP}/b/banda-a/dominios/comprar?q=lossatelites`), buscar2.getByRole("button", { name: "Buscar" }).click()]);
    const fila = page.getByRole("row").filter({ has: page.locator('[data-resultado="lossatelites.com"]') });
    expect(await fila.textContent()).toContain("25.000");
    await captura(page, "dominio-buscar");
    await Promise.all([page.waitForURL(`${APP}/b/banda-a/dominios/comprar/lossatelites.com`), fila.getByRole("link", { name: "Elegir" }).click()]);

    // A nombre de quién: precargado con el titular de la banda.
    const titular = page.locator("[data-titular-dominio] form[data-hidratado]");
    await titular.waitFor();
    expect(await titular.locator('input[name="email"]').inputValue()).toBe("multi@x.com");
    for (const [campo, valor] of [
      ["nombre", "Ana"],
      ["apellido", "Pérez"],
      ["telefono", "11 4567-8900"],
      ["direccion", "Av. Corrientes 1234"],
      ["ciudad", "CABA"],
      ["provincia", "Buenos Aires"],
      ["codigoPostal", "C1043"],
    ]) await titular.locator(`input[name="${campo}"]`).fill(valor);
    await captura(page, "dominio-titular");
    await Promise.all([page.waitForURL(`${APP}/b/banda-a/dominios/comprar/lossatelites.com/resumen`), titular.getByRole("button", { name: "Seguir" }).click()]);

    // Resumen y pago: precio, vencimiento, titular y, ANTES de pagar, lo que cuesta irse.
    expect(await page.locator("[data-resumen-compra]").textContent()).toContain("Ana Pérez · multi@x.com");
    expect(await page.locator("[data-costo-salida]").textContent()).toContain("Deoco no cobra nada");
    expect(await page.locator("[data-costo-salida]").textContent()).toContain("El registrador nuevo te cobra la transferencia");
    await captura(page, "dominio-resumen");
    const pagar = page.locator("[data-pagar-dominio] form[data-hidratado]");
    await pagar.waitFor();
    await pagar.getByRole("button", { name: "Pagar con Mercado Pago" }).click();
    await pagar.getByRole("alert").waitFor(); // sin aceptar las condiciones, no
    expect(mp.preferencias).toHaveLength(0);
    await pagar.getByText("Acepto: Domain Name Registration Agreement").click();
    await Promise.all([page.waitForURL(/127\.0\.0\.1:3299\/checkout/), pagar.getByRole("button", { name: "Pagar con Mercado Pago" }).click()]);
    expect(mp.preferencias[0].cuerpo).toMatchObject({ binary_mode: true, items: [{ unit_price: 25000 }] });
    const cobro = await dueno.comercialDominioCobro.findFirstOrThrow();
    expect((cobro.datos as { contacto: { telefono: string } }).contacto.telefono).toBe("+54.1145678900");
    // Todavía nada registrado.
    expect(gd.pedidos.filter((p) => p.metodo !== "GET")).toHaveLength(0);

    // Paga; Mercado Pago avisa y lo devuelve a "Tus compras".
    const pagoId = mp.pagar(mp.preferencias[0].id);
    expect(await avisoDominio(pagoId)).toBe(200);
    await page.goto(`${APP}/b/banda-a/dominios/compras?pago=hecho`);
    const seguimiento = page.locator('[data-seguimiento="lossatelites.com"]');
    await expect(seguimiento.locator('[data-paso="Pago"]').getAttribute("data-estado")).resolves.toBe("hecho");
    expect(await seguimiento.locator('[data-paso="Registro a tu nombre"]').getAttribute("data-estado")).toBe("en-curso");
    await captura(page, "dominio-progreso");

    // Cierra la página. El registro avanza mientras tanto (el barrido).
    await cerrarContextos();
    await esperarCompras();
    gd.terminar("REGISTER");
    await avanzarCompras(e.a.id, new Date(Date.now() + 2 * MIN));
    gd.terminar();
    await avanzarCompras(e.a.id, new Date(Date.now() + 4 * MIN));

    // Vuelve otro día: Dominios le dice que hay una compra en marcha y adónde mirar.
    ({ page } = await logueado("multi@x.com"));
    await page.goto(`${APP}/b/banda-a/dominios`);
    await Promise.all([page.waitForURL(`${APP}/b/banda-a/dominios/compras`), page.locator("[data-compras-en-curso]").getByRole("link", { name: "Ver en qué va" }).click()]);
    const otraVez = page.locator('[data-seguimiento="lossatelites.com"]');
    expect(await otraVez.locator('[data-paso="Registro a tu nombre"]').getAttribute("data-estado")).toBe("hecho");
    expect(await otraVez.locator('[data-paso="Conectando el sitio"]').getAttribute("data-estado")).toBe("en-curso");
    expect(await otraVez.locator("[data-mensaje]").textContent()).toContain("lossatelites.com ya es tuyo");
  });

  it("un dato que el registrador rechazó se corrige desde el progreso y la compra sigue", async () => {
    await dominioPagado(comercial, e.a.id, {
      dominio: "nuevosatelites.com",
      anios: 1,
      contacto: { nombre: "Ana", apellido: "Pérez", email: "multi@x.com", telefono: "1145678900", direccion: "Av. Corrientes 1234", ciudad: "CABA", provincia: "Buenos Aires", codigoPostal: "C1043", pais: "AR" },
      aceptacion: { fecha: new Date(), ip: "203.0.113.7", claves: ["DNRA"] },
      hacerPrincipal: false,
      cobro: { id: "e2e-datos", monto: 2500000 },
      usuarioId: null,
    });
    await esperarCompras();
    expect((await dueno.dominioCompra.findFirstOrThrow({ where: { cobroId: "e2e-datos" } })).estado).toBe("datos");

    const { page } = await logueado("multi@x.com");
    await page.goto(`${APP}/b/banda-a/dominios/compras`);
    const tarjeta = page.locator('[data-seguimiento="nuevosatelites.com"]');
    expect(await tarjeta.textContent()).toContain("Revisá el teléfono");
    const form = tarjeta.locator("[data-corregir] form[data-hidratado]");
    await form.waitFor();
    await captura(page, "dominio-corregir-dato");
    await form.locator('input[name="telefono"]').fill("11 4567-8900");
    await form.getByRole("button", { name: "Corregir y seguir" }).click();
    await tarjeta.locator("[data-corregir]").waitFor({ state: "detached" });
    await esperarCompras();
    expect(await dueno.dominioCompra.findFirstOrThrow({ where: { cobroId: "e2e-datos" } })).toMatchObject({ estado: "en-curso", contacto: { telefono: "+54.1145678900" } });
  });
});

describe("un dominio comprado: renovar, llevárselo, cambiar el titular, vencer", () => {
  it("todo desde la tarjeta del dominio, sin staff", async () => {
    await dominioPagado(comercial, e.a.id, {
      dominio: "comprado.com",
      anios: 1,
      contacto: { nombre: "Ana", apellido: "Pérez", email: "multi@x.com", telefono: "+54.1145678900", direccion: "Av. Corrientes 1234", ciudad: "CABA", provincia: "Buenos Aires", codigoPostal: "C1043", pais: "AR" },
      aceptacion: { fecha: new Date(), ip: "203.0.113.7", claves: ["DNRA"] },
      hacerPrincipal: false,
      cobro: { id: "e2e-comprado", monto: 2500000 },
      usuarioId: null,
    });
    await esperarCompras();
    gd.terminar("REGISTER");
    await avanzarCompras(e.a.id, new Date(Date.now() + 2 * MIN));
    gd.terminar();
    await avanzarCompras(e.a.id, new Date(Date.now() + 4 * MIN));
    cf.activarZona("comprado.com");
    await barrer({ ahora: new Date(Date.now() + 20 * MIN) });
    await avanzarCompras(e.a.id, new Date(Date.now() + 40 * MIN));
    await esperarCompras();
    // Vence en 10 días; registrado hace más de 60 (se puede llevar).
    await dueno.dominio.updateMany({ where: { dominio: "comprado.com" }, data: { venceEn: new Date(Date.now() + 10 * 86_400_000) } });
    await dueno.dominioCompra.updateMany({ where: { cobroId: "e2e-comprado" }, data: { terminadoEn: new Date(Date.now() - 61 * 86_400_000) } });

    const { page } = await logueado("multi@x.com");
    await page.goto(`${APP}/b/banda-a/dominios`);
    expect(await page.locator("[data-dominio-vence]").textContent()).toContain("comprado.com vence en 10 días");
    const tarjeta = page.locator('[data-dominio="comprado.com"]');
    expect(await tarjeta.locator("[data-renglones]").textContent()).toContain("En Deoco (GoDaddy), a nombre de Ana Pérez");
    await captura(page, "dominio-comprado");

    // Llevárselo: el código se muestra en el panel.
    await tarjeta.locator("[data-como-me-lo-llevo] summary").click();
    const codigo = tarjeta.locator("[data-pedir-codigo] form[data-hidratado]");
    await codigo.waitFor();
    await codigo.getByRole("button", { name: "Pedir el código de transferencia" }).click();
    expect(await codigo.getByRole("status").textContent()).toContain("AUTH-comprado.com");
    expect(gd.dominios.get("comprado.com")!.locked).toBe(false);

    // Cambiar el titular.
    await tarjeta.locator("[data-cambiar-titular] summary").click();
    const titular = tarjeta.locator("[data-cambiar-titular] form[data-hidratado]");
    await titular.waitFor();
    await titular.locator('input[name="nombre"]').fill("Juan");
    await titular.locator('input[name="apellido"]').fill("Gómez");
    await titular.getByRole("button", { name: "Cambiar el titular" }).click();
    await titular.getByRole("status").waitFor();
    expect(await dueno.dominioCompra.count({ where: { tipo: "titular", dominio: "comprado.com" } })).toBe(1);

    // Renovar: va a pagar a Mercado Pago (cuenta de Deoco).
    await page.goto(`${APP}/b/banda-a/dominios`);
    const renovar = page.locator('[data-dominio="comprado.com"] [data-renovar] form[data-hidratado]');
    await renovar.waitFor();
    await Promise.all([page.waitForURL(/127\.0\.0\.1:3299\/checkout/), renovar.getByRole("button", { name: /^Renovar un año por/ }).click()]);
    expect(mp.preferencias.at(-1)!.cuerpo).toMatchObject({ items: [{ title: "Renovación de comprado.com · 1 año" }] });

    // Vencido: el aviso y la gracia en la tarjeta.
    await dueno.dominio.updateMany({ where: { dominio: "comprado.com" }, data: { vencidoEn: new Date(), venceEn: new Date(Date.now() - 86_400_000) } });
    await page.goto(`${APP}/b/banda-a/dominios`);
    expect(await page.locator('[data-dominio="comprado.com"] [data-vencido]').textContent()).toContain("al precio de siempre");
    expect(await page.locator("[data-dominio-vence]").textContent()).toContain("comprado.com venció");
    await captura(page, "dominio-vencido");
  });
});

describe("comprado: llevarse solo el DNS", () => {
  it("la lista y los nameservers de su proveedor nuevo, que pone Deoco", async () => {
    await dominioPagado(comercial, e.a.id, {
      dominio: "solodns.com",
      anios: 1,
      contacto: { nombre: "Ana", apellido: "Pérez", email: "multi@x.com", telefono: "+54.1145678900", direccion: "Av. Corrientes 1234", ciudad: "CABA", provincia: "Buenos Aires", codigoPostal: "C1043", pais: "AR" },
      aceptacion: { fecha: new Date(), ip: "203.0.113.7", claves: ["DNRA"] },
      hacerPrincipal: false,
      cobro: { id: "e2e-solodns", monto: 2500000 },
      usuarioId: null,
    });
    await esperarCompras();
    gd.terminar("REGISTER");
    await avanzarCompras(e.a.id, new Date(Date.now() + 2 * MIN));
    gd.terminar();
    await avanzarCompras(e.a.id, new Date(Date.now() + 4 * MIN));
    cf.activarZona("solodns.com");
    await barrer({ ahora: new Date(Date.now() + 20 * MIN) });
    await avanzarCompras(e.a.id, new Date(Date.now() + 40 * MIN));
    await esperarCompras();

    const { page } = await logueado("multi@x.com");
    await page.goto(`${APP}/b/banda-a/dominios`);
    const tarjeta = page.locator('[data-dominio="solodns.com"]');
    await tarjeta.locator("[data-como-me-lo-llevo] summary").click();
    const solo = tarjeta.locator("[data-solo-dns] form[data-hidratado]");
    await solo.waitFor();
    await solo.getByRole("button", { name: "Llevarme solo el DNS" }).click();
    const ns = tarjeta.locator("[data-nameservers-comprado] form[data-hidratado]");
    await ns.waitFor();
    await captura(page, "dominio-solo-dns");
    await ns.locator('input[name="ns1"]').fill("ns1.otro.com");
    await ns.locator('input[name="ns2"]').fill("ns2.otro.com");
    await ns.getByRole("button", { name: "Poner estos nameservers" }).click();
    await tarjeta.locator("[data-nameservers-comprado]").getByText("ns1.otro.com, ns2.otro.com").waitFor();
    await esperarCompras();
    expect(await dueno.dominioCompra.findFirstOrThrow({ where: { tipo: "dns", dominio: "solodns.com" } })).toMatchObject({ operacion: { nameservers: ["ns1.otro.com", "ns2.otro.com"] } });
  });
});
