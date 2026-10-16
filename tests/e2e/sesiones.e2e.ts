import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { hashearContrasena } from "@/nucleo/auth/contrasena";
import { CONTRASENA, dueno, escenarioAcceso } from "../apoyo";
import { APP, abrirNavegador, cerrarContextos, cerrarNavegador, logueado } from "./navegador";

// 3.2 núcleo d6: "se revoca un usuario con sesión abierta → la sesión se invalida en el siguiente
// movimiento, no al vencimiento". Cambiar la clave cierra las otras sesiones; el staff también.

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
beforeAll(async () => {
  e = await escenarioAcceso();
  await abrirNavegador();
});
afterEach(() => cerrarContextos());
afterAll(async () => {
  await cerrarNavegador();
  await dueno.$disconnect();
});

const enPanel = async (page: Awaited<ReturnType<typeof logueado>>["page"]) => {
  const r = await page.goto(`${APP}/b/banda-a`);
  return { status: r!.status(), url: page.url() };
};

describe("sesiones que se cierran de verdad", () => {
  it("cambiar la clave en un navegador saca al otro en su próximo pedido", async () => {
    const uno = (await logueado("multi@x.com")).page;
    const otro = (await logueado("multi@x.com")).page;
    expect((await enPanel(otro)).status).toBe(200);
    // Cambia la clave desde "uno" (como /clave: el disparador sube la versión).
    await dueno.usuario.update({ where: { id: e.multi.id }, data: { hashContrasena: await hashearContrasena(CONTRASENA) } });
    // Un "update" pedido desde el navegador no la revive (la prueba de renovación la arma solo el servidor).
    await otro.evaluate(async () => {
      const { csrfToken } = await (await fetch("/api/auth/csrf")).json();
      await fetch("/api/auth/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csrfToken, data: { renovar: "inventada" } }) });
    });
    const r = await enPanel(otro);
    expect(r.url).toContain("/ingresar");
    expect((await enPanel(uno)).url).toContain("/ingresar"); // también la del que cambió (vuelve a entrar con la nueva)
  });

  it("el staff cierra todas las sesiones de una persona desde /admin/usuarios", async () => {
    await dueno.usuario.update({ where: { id: e.multi.id }, data: { versionSesion: 0 } });
    const titular = (await logueado("multi@x.com")).page;
    expect((await enPanel(titular)).status).toBe(200);
    const staff = (await logueado("staff@deocoartist.com")).page;
    await staff.goto(`${APP}/admin/usuarios?q=multi`);
    const celda = staff.locator('[data-sesiones="multi@x.com"]');
    await celda.locator("form[data-hidratado]").waitFor();
    await celda.getByRole("button", { name: "Cerrar sesiones" }).click();
    const antes = 0;
    for (let i = 0; i < 50 && (await dueno.usuario.findUniqueOrThrow({ where: { id: e.multi.id } })).versionSesion === antes; i++) await new Promise((r) => setTimeout(r, 100));
    expect((await enPanel(titular)).url).toContain("/ingresar");
    expect(await dueno.auditoria.count({ where: { accion: "usuario.sesiones_cerradas", usuarioId: e.staff.id } })).toBe(1);
  });

  it("el titular saca a alguien desde Equipo: el panel abierto de esa persona deja de entrar en su próximo clic", async () => {
    await dueno.usuario.update({ where: { id: e.multi.id }, data: { versionSesion: 0 } });
    const editora = (await logueado("editor-a@x.com")).page;
    expect((await editora.goto(`${APP}/b/banda-a/equipo`))!.status()).toBe(200);
    expect(await editora.getByRole("button", { name: "Sacar de la banda" }).count()).toBe(0); // no es titular

    const titular = (await logueado("multi@x.com")).page;
    await titular.goto(`${APP}/b/banda-a/equipo`);
    const fila = titular.locator('[data-miembro="editor-a@x.com"]').locator("xpath=ancestor::tr");
    const form = fila.locator("form[data-hidratado]").filter({ has: titular.getByRole("button", { name: "Sacar de la banda" }) });
    await form.waitFor();
    await form.getByText("Confirmo: pierde el acceso").click();
    await form.getByRole("button", { name: "Sacar de la banda" }).click();
    for (let i = 0; i < 50 && (await dueno.membresia.count({ where: { tenantId: e.a.id, usuarioId: e.editorA.id } })) > 0; i++) await new Promise((r) => setTimeout(r, 100));
    expect((await editora.goto(`${APP}/b/banda-a`))!.status()).toBe(403);
    expect(await dueno.auditoria.count({ where: { accion: "membresia.quitada", tenantId: e.a.id, usuarioId: e.multi.id } })).toBe(1);
  });
});
