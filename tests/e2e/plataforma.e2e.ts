import { request } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { guardarArchivo } from "@/nucleo/archivos";
import { urlFirmada } from "@/nucleo/archivos/firmados";
import prueba from "../../modulos/prueba";
import { dueno, escenarioAcceso } from "../apoyo";
import { APP, abrirNavegador, anonimo, cerrarContextos, cerrarNavegador, dominiosDeDesarrollo, logueado, sitio } from "./navegador";
import { PUERTO } from "./servidor";

let e: Awaited<ReturnType<typeof escenarioAcceso>>;

function bajar(host: string, path: string) {
  return new Promise<{ estado: number; cabeceras: Record<string, unknown>; cuerpo: Buffer }>((ok, mal) => {
    const r = request({ host: "127.0.0.1", port: PUERTO, path, headers: { host: `${host}:${PUERTO}` } }, (res) => {
      const partes: Buffer[] = [];
      res.on("data", (c) => partes.push(c));
      res.on("end", () => ok({ estado: res.statusCode!, cabeceras: res.headers, cuerpo: Buffer.concat(partes) }));
    });
    r.on("error", mal);
    r.end();
  });
}

beforeAll(async () => {
  e = await escenarioAcceso();
  await dominiosDeDesarrollo(e.a, e.b);
  await abrirNavegador();
});
afterEach(() => cerrarContextos());
afterAll(async () => {
  await cerrarNavegador();
  await dueno.$disconnect();
});

describe("rutasAdmin: pantallas de módulos en el back office", () => {
  it("el staff la ve en el menú, entra y lo que hace pasa por conStaff (auditado)", async () => {
    await dueno.auditoria.deleteMany();
    const { page } = await logueado("staff@deocoartist.com");
    await page.goto(`${APP}/admin`);
    await page.click('nav[aria-label="Back office"] a:text("Prueba")');
    await page.waitForURL(`${APP}/admin/m/prueba`);
    expect(await page.getByTestId("admin-prueba").getAttribute("data-usuario")).toBe(e.staff.id);
    const form = page.locator("form[data-hidratado]");
    await form.getByRole("button", { name: "Probar conStaff" }).click();
    expect(await form.getByRole("status").textContent()).toBe("La transacción corrió como staff.");
    const audit = await dueno.auditoria.findFirstOrThrow({ where: { accion: "prueba.staff_probado" } });
    expect(audit).toMatchObject({ usuarioId: e.staff.id, tenantId: null, detalle: { staff: true } });
  });

  it("cualquier otro caso es 404: sin sesión, sin ser staff, en el host de una banda", async () => {
    expect((await (await anonimo()).page.goto(`${APP}/admin/m/prueba`))!.status()).toBe(404);
    expect((await (await logueado("multi@x.com")).page.goto(`${APP}/admin/m/prueba`))!.status()).toBe(404);
    expect((await (await anonimo()).page.goto(`${sitio("banda-a")}/admin/m/prueba`))!.status()).toBe(404);
    const { page } = await logueado("staff@deocoartist.com");
    expect((await page.goto(`${APP}/admin/m/prueba/no-existe`))!.status()).toBe(404);
    expect((await page.goto(`${APP}/admin/m/nadie`))!.status()).toBe(404);
  });
});

describe("urlFirmada(): descarga sin sesión con link que vence", () => {
  const PDF = Buffer.from("%PDF-1.4\n%archivo de impresión\n");
  const pathDe = (url: string) => {
    const u = new URL(url);
    return u.pathname + u.search;
  };

  it("vigente: baja el archivo como descarga; vencido: 410; alterado o en el host de la banda: 404", async () => {
    const { id } = await guardarArchivo(e.a.id, { nombre: "remera.pdf", datos: PDF }, { moduloId: "prueba", tipos: ["pdf"] });
    const vigente = pathDe(await urlFirmada(prueba, e.a.id, id));
    const ok = await bajar("app.lvh.me", vigente);
    expect(ok.estado).toBe(200);
    expect(ok.cabeceras["content-disposition"]).toBe("attachment; filename*=UTF-8''remera.pdf");
    expect(ok.cabeceras["cache-control"]).toBe("private, no-store");
    expect(ok.cuerpo.equals(PDF)).toBe(true);

    const hace2Dias = new Date(Date.now() - 2 * 86400_000);
    const vencido = pathDe(await urlFirmada(prueba, e.a.id, id, { validoPorSegundos: 86400, ahora: hace2Dias }));
    const r410 = await bajar("app.lvh.me", vencido);
    expect([r410.estado, r410.cuerpo.toString()]).toEqual([410, "Este link venció. Pedile uno nuevo a quien te lo mandó."]);

    expect((await bajar("app.lvh.me", vigente.replace(/vence=(\d+)/, (_, v) => `vence=${Number(v) + 1}`))).estado).toBe(404);
    expect((await bajar("app.lvh.me", vigente.replace(e.a.id, e.b.id))).estado).toBe(404);
    expect((await bajar("banda-a.lvh.me", vigente)).estado).toBe(404);
  });
});
