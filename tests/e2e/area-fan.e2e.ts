import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prenderModulo } from "@/nucleo/modulos/encendido";
import { crearEvento, crearTipo, publicarEvento } from "../../modulos/ticketera/eventos";
import { dueno, escenarioAcceso } from "../apoyo";
import { abrirNavegador, anonimo, captura, cerrarContextos, cerrarNavegador, dominiosDeDesarrollo, sitio } from "./navegador";

// D5 de punta a punta: el fan pide su link, ve sus entradas con el QR, transfiere una (confirma
// desde su mail) y quien la recibe la acepta desde el suyo.

const SITIO = sitio("banda-a");
let e: Awaited<ReturnType<typeof escenarioAcceso>>;
let codigos: string[] = [];

/** El link (después de "#") del último mail a `para` que lleva `ruta`. */
async function linkDelMail(para: string, ruta: string): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const c = await dueno.correo.findFirst({ where: { para, texto: { contains: ruta } }, orderBy: { creadoEn: "desc" } });
    const m = c?.texto.match(new RegExp(`(https?://\\S+${ruta}#[0-9a-f]{64})`));
    if (m) return m[1];
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`no llegó el mail a ${para} con ${ruta}`);
}

beforeAll(async () => {
  e = await escenarioAcceso();
  await dominiosDeDesarrollo(e.a, e.b);
  for (const t of ["ticketeraEntrada", "ticketeraCompra", "ticketeraTipo", "ticketeraEvento", "accesoFan"] as const) {
    await (dueno[t] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await prenderModulo(e.staff.id, e.a.id, "ticketera");
  const eventoId = await crearEvento(e.a.id, { nombre: "Gira Satélite", fecha: new Date(Date.now() + 30 * 86400_000), lugar: "La Trastienda", ciudad: "CABA", direccion: "", descripcion: "" });
  await crearTipo(e.a.id, eventoId, { nombre: "General", precio: 1500000, cupo: 10, ventaDesde: null, ventaHasta: null });
  await publicarEvento(e.a.id, eventoId, true);
  const tipo = await dueno.ticketeraTipo.findFirstOrThrow({ where: { eventoId } });
  // Una compra pagada de dos entradas (como la deja el pago).
  const compra = await dueno.ticketeraCompra.create({
    data: {
      tenantId: e.a.id, eventoId, tipoId: tipo.id, cantidad: 2, precioUnitario: tipo.precio, total: tipo.precio * 2, nombre: "Lucía Fan", email: "lucia@fan.com",
      asistentes: [], venceEn: new Date(), estado: "PAGADA", pagadaEn: new Date(), tokenHash: "h".repeat(64),
    },
  });
  codigos = ["AAAAABBBBBCCCCCDDDDD", "EEEEEFFFFFGGGGGHHHHH"];
  await dueno.ticketeraEntrada.createMany({
    data: codigos.map((codigo, i) => ({ tenantId: e.a.id, compraId: compra.id, eventoId, tipoId: tipo.id, nombre: `Fan ${i}`, documento: `3000000${i}`, codigo })),
  });
  await abrirNavegador();
});
afterEach(() => cerrarContextos());
afterAll(async () => {
  await cerrarNavegador();
  await dueno.$disconnect();
});

describe("Mis compras", () => {
  it("link al mail, entradas con su QR, transferir y aceptar", async () => {
    const { page } = await anonimo();
    await page.goto(SITIO);
    await page.locator("[data-mis-compras]").click();
    await page.waitForURL(`${SITIO}/mis-compras`);
    await page.locator('form[data-pedir-link] input[name="email"]').fill("lucia@fan.com");
    await page.locator("form[data-pedir-link]").getByRole("button", { name: "Mandame el link" }).click();
    await page.locator("[data-link-pedido]").waitFor();

    await page.goto(await linkDelMail("lucia@fan.com", "/mis-compras"));
    await page.locator('[data-fan="lucia@fan.com"]').waitFor();
    expect(page.url()).toBe(`${SITIO}/mis-compras`);
    expect(await page.locator("[data-entrada-fan]").count()).toBe(2);
    await captura(page, "mis-compras");

    // Transferir la primera.
    const entrada = page.locator(`[data-entrada-fan="${codigos[0]}"]`);
    await entrada.getByText("Transferir esta entrada").click();
    const form = entrada.locator('form[data-form-fan="transferir"]');
    await form.locator('input[name="nombre"]').fill("Ana Otra");
    await form.locator('input[name="documento"]').fill("40111222");
    await form.locator('input[name="email"]').fill("ana@fan.com");
    await form.getByRole("button", { name: "Transferir" }).click();
    await entrada.locator('[data-accion-fan="transferir"]').waitFor();

    // Confirma desde su mail; acepta quien la recibe (en otro navegador).
    await page.goto(await linkDelMail("lucia@fan.com", "/fechas/transferencia/confirmar"));
    await page.locator('[data-transferencia="confirmar"][data-resultado="bien"]').waitFor();
    const otra = (await anonimo()).page;
    await otra.goto(await linkDelMail("ana@fan.com", "/fechas/transferencia/aceptar"));
    await otra.locator('[data-transferencia="aceptar"][data-resultado="bien"]').waitFor();

    const despues = await dueno.ticketeraEntrada.findFirstOrThrow({ where: { emailTitular: "ana@fan.com" } });
    expect(despues.codigo).not.toBe(codigos[0]);
    // En el área de quien compró, queda una sola.
    await page.goto(`${SITIO}/mis-compras`);
    expect(await page.locator("[data-entrada-fan]").count()).toBe(1);
    expect(await page.locator(`[data-entrada-fan="${codigos[1]}"]`).count()).toBe(1);
  });

  it("un link vencido o usado lo dice y deja pedir otro", async () => {
    const { page } = await anonimo();
    await page.goto(`${SITIO}/mis-compras#${"a".repeat(64)}`);
    await page.locator("[data-link-vencido]").waitFor();
    expect(await page.locator("form[data-pedir-link]").count()).toBe(1);
  });
});
