import { mkdirSync } from "node:fs";
import path from "node:path";
import { type Browser, type BrowserContext, type Page, chromium } from "playwright-core";
import { CONTRASENA, dueno } from "../apoyo";
import { PUERTO } from "./servidor";

export const APP = `http://app.lvh.me:${PUERTO}`;
export const sitio = (slug: string) => `http://${slug}.lvh.me:${PUERTO}`;

let navegador: Browser | undefined;
const contextos: BrowserContext[] = [];

export async function abrirNavegador() {
  navegador = await chromium.launch({
    executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium",
    // *.lvh.me → 127.0.0.1 sin depender del DNS público.
    args: ["--host-resolver-rules=MAP *.lvh.me 127.0.0.1", "--no-proxy-server"],
  });
}

export async function cerrarContextos() {
  while (contextos.length) await contextos.pop()!.close();
}

export async function cerrarNavegador() {
  await navegador?.close();
}

/** Navegador nuevo, sin cookies. */
export async function anonimo() {
  const ctx = await navegador!.newContext();
  contextos.push(ctx);
  return { ctx, page: await ctx.newPage() };
}

/** Navegador nuevo (sin cookies) con el usuario logueado. */
export async function logueado(email: string) {
  const { ctx, page } = await anonimo();
  await page.goto(`${APP}/ingresar`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="contrasena"]', CONTRASENA);
  await Promise.all([page.waitForURL(`${APP}/`), page.click('button[type="submit"]')]);
  return { ctx, page };
}

/**
 * Captura de pantalla completa en `$CAPTURAS/<nombre>.png`, solo si la variable está
 * definida (`CAPTURAS=dir npm run test:e2e`). Sirve para comparar la UI antes y después
 * de un cambio: las pruebas dejan cada pantalla en el estado que importa.
 */
export async function captura(page: Page, nombre: string) {
  const dir = process.env.CAPTURAS;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  // caret "initial": por defecto Playwright oculta el cursor de texto poniendo un style en
  // cada campo; si la página todavía no hidrató, React lo ve como un error de hidratación.
  await page.screenshot({ path: path.join(dir, `${nombre}.png`), fullPage: true, caret: "initial" });
}

/**
 * dosBandas() crea banda-x.deocoartist.com como principal; en e2e se navega por los hosts de
 * desarrollo, que pasan a ser los principales (si no, redirigirían a deocoartist.com).
 */
export async function dominiosDeDesarrollo(a: { id: string }, b: { id: string }) {
  await dueno.dominio.updateMany({ where: { tenantId: { in: [a.id, b.id] } }, data: { esPrincipal: false } });
  await dueno.dominio.createMany({
    data: [
      { tenantId: a.id, dominio: "banda-a.lvh.me", verificado: true, esPrincipal: true },
      { tenantId: b.id, dominio: "banda-b.lvh.me", verificado: true, esPrincipal: true },
    ],
  });
}
