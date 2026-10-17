import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { diaArgentino } from "@/nucleo/fechas";
import { dueno, escenarioAcceso } from "../apoyo";
import { APP, abrirNavegador, captura, cerrarContextos, cerrarNavegador, logueado } from "./navegador";

// Organizador de lanzamiento de punta a punta: armar la campaña, mover la fecha, marcar hechos,
// subir una pieza fuera de medida; el staff cambia una medida desde el back office.

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
const enDias = (n: number) => diaArgentino(new Date(Date.now() + n * 86_400_000));

beforeAll(async () => {
  e = await escenarioAcceso();
  await dueno.moduloTenant.createMany({ data: [{ tenantId: e.a.id, moduloId: "lanzamiento" }], skipDuplicates: true });
  await abrirNavegador();
});
afterEach(() => cerrarContextos());
afterAll(async () => {
  await cerrarNavegador();
  await dueno.$disconnect();
});

describe("lanzamientos", () => {
  it("la banda arma la campaña, ve lo atrasado, mueve la fecha y sube una pieza no conforme", async () => {
    const { page } = await logueado("multi@x.com");
    await page.goto(`${APP}/b/banda-a`);
    await page.locator('nav[aria-label="Panel"] a:text("Lanzamientos")').click();
    await page.waitForURL(`${APP}/b/banda-a/lanzamientos`);
    const nueva = page.locator("form[data-hidratado]", { has: page.getByRole("button", { name: "Armar la campaña" }) });
    await nueva.locator('input[name="titulo"]').fill("Nuevo single");
    await nueva.locator('input[name="fecha"]').fill(enDias(20));
    await Promise.all([page.waitForURL(/\/lanzamientos\/[0-9a-f-]{36}$/), nueva.getByRole("button", { name: "Armar la campaña" }).click()]);
    // A 20 días, lo de hace más de 20 está atrasado (y se ve).
    expect(Number(await page.locator("[data-atrasados]").getAttribute("data-atrasados"))).toBeGreaterThan(3);
    expect(await page.locator('[data-hito="master"]').getAttribute("data-estado")).toBe("atrasado");
    await captura(page, "lanzamiento");

    // Mover la fecha 30 días: el master deja de estar atrasado.
    const mover = page.locator("form[data-hidratado]", { has: page.getByRole("button", { name: "Mover" }) });
    await mover.locator('input[name="fecha"]').fill(enDias(50));
    await mover.getByRole("button", { name: "Mover" }).click();
    await mover.getByText(/Fecha movida 30 días para adelante/).waitFor();
    await page.reload();
    expect(await page.locator('[data-hito="master"]').getAttribute("data-estado")).not.toBe("atrasado");

    // Una pieza fuera de medida: se acepta, marcada.
    const tapa = page.locator('[data-pieza="tapa"]');
    await tapa.locator('input[type="file"]').setInputFiles({ name: "tapa.png", mimeType: "image/png", buffer: await sharp({ create: { width: 1000, height: 800, channels: 3, background: "#222" } }).png().toBuffer() });
    await tapa.getByRole("button", { name: "Subir" }).click();
    await tapa.getByText(/no cumple la medida/).waitFor();
    await page.reload();
    expect(await page.locator('[data-pieza="tapa"]').getAttribute("data-conforme")).toBe("false");
  });

  it("el staff cambia una medida desde el back office", async () => {
    const { page } = await logueado("staff@deocoartist.com");
    await page.goto(`${APP}/admin/m/lanzamiento`);
    const form = page.locator('[data-formato="x-encabezado"] form[data-hidratado]');
    await form.locator('input[name="alto"]').fill("600");
    await form.getByRole("button", { name: "Guardar" }).click();
    await form.getByText("Guardada: rige para las campañas nuevas.").waitFor();
    expect((await dueno.lanzamientoFormato.findUniqueOrThrow({ where: { id: "x-encabezado" } })).alto).toBe(600);
  });
});
