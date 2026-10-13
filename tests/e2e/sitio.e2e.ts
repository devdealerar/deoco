import sharp from "sharp";
import type { Page } from "playwright-core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/nucleo/db/cliente";
import { prenderModulo } from "@/nucleo/modulos/encendido";
import { dueno, escenarioAcceso } from "../apoyo";
import { APP, abrirNavegador, anonimo, cerrarContextos, cerrarNavegador, dominiosDeDesarrollo, logueado, sitio } from "./navegador";

let e: Awaited<ReturnType<typeof escenarioAcceso>>;

const jpg = (w: number, h: number, color = "#c0392b") =>
  sharp({ create: { width: w, height: h, channels: 3, background: color } }).jpeg({ quality: 95 }).toBuffer();
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
const PDF = Buffer.from("%PDF-1.4\n%rider\n");

beforeAll(async () => {
  e = await escenarioAcceso();
  await dominiosDeDesarrollo(e.a, e.b);
  await prenderModulo(e.staff.id, e.a.id, "sitio");
  await prenderModulo(e.staff.id, e.b.id, "sitio");
  await abrirNavegador();
});
afterEach(async () => {
  await dueno.tenant.updateMany({ data: { limiteAlmacenamiento: null } });
  await cerrarContextos();
});
afterAll(async () => {
  await cerrarNavegador();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

const panel = (slug: string, ruta = "") => `${APP}/b/${slug}/sitio${ruta}`;

/** Completa y envía el formulario de la tarjeta `titulo`; espera el resultado. */
async function enviar(page: Page, titulo: string, llenar: (f: ReturnType<Page["locator"]>) => Promise<void>, boton: string) {
  const tarjeta = page.locator("section", { has: page.getByRole("heading", { name: titulo }) });
  const form = tarjeta.locator("form").last();
  await llenar(form);
  await form.getByRole("button", { name: boton }).click();
  await form.locator('[role="status"], [role="alert"]').first().waitFor();
  return form;
}

async function publicar(page: Page, slug: string) {
  await page.goto(panel(slug));
  await page.getByRole("button", { name: "Publicar cambios" }).click();
  await page.getByText("Publicado. El sitio ya muestra estos cambios.").waitFor();
}

describe("pruebas 1 y 7: la banda carga desde el panel; el sitio muestra lo publicado", () => {
  it("home y press kit se cargan, quedan en borrador, y aparecen al publicar", async () => {
    const { page } = await logueado("multi@x.com");
    await page.goto(panel("banda-a", "/home"));
    await enviar(page, "Bio corta", (f) => f.locator("textarea").fill("Rock de garage desde Rosario."), "Guardar");
    await enviar(
      page,
      "Slider de imágenes",
      async (f) => {
        await f.locator('input[type="file"]').setInputFiles({ name: "show.jpg", mimeType: "image/jpeg", buffer: await jpg(3000, 2000) });
        await f.locator('input[name="textoAlt"]').fill("En vivo");
      },
      "Agregar imagen",
    );
    const futura = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
    await enviar(
      page,
      "Próximas fechas",
      async (f) => {
        await f.locator('input[name="fecha"]').fill(futura);
        await f.locator('input[name="lugar"]').fill("Club Lucero");
        await f.locator('input[name="ciudad"]').fill("Rosario");
      },
      "Agregar fecha",
    );
    await enviar(
      page,
      "Links",
      async (f) => {
        await f.locator('input[name="plataforma"]').fill("Spotify");
        await f.locator('input[name="url"]').fill("https://open.spotify.com/artist/x");
      },
      "Agregar link",
    );
    await page.goto(panel("banda-a", "/prensa"));
    await enviar(
      page,
      "Textos, rider y contacto",
      async (f) => {
        await f.locator('textarea[name="bioLarga"]').fill("Primer párrafo de la bio.\n\nSegundo párrafo.");
        await f.locator('input[name="rider"]').setInputFiles({ name: "rider.pdf", mimeType: "application/pdf", buffer: PDF });
        await f.locator('input[name="prensaEmail"]').fill("prensa@banda-a.com");
      },
      "Guardar",
    );

    // Prueba 7: todavía es borrador. El sitio no lo muestra.
    const visitante = (await anonimo()).page;
    await visitante.goto(sitio("banda-a"));
    expect(await visitante.content()).not.toContain("Rock de garage");
    await page.goto(panel("banda-a", "/vista-previa"));
    expect(await page.getByTestId("vista-previa").textContent()).toContain("Rock de garage desde Rosario.");

    await publicar(page, "banda-a");
    expect(await page.getByTestId("estado-publicacion").textContent()).toContain("El sitio está al día");

    await visitante.goto(sitio("banda-a"));
    const home = await visitante.locator("main").textContent();
    expect(home).toContain("Rock de garage desde Rosario.");
    expect(home).toContain("Club Lucero");
    expect(home).toContain("Spotify");
    // El slider usa la versión liviana (WebP, ≤1600 px), no el original de 3000 px.
    const src = await visitante.locator('section[aria-label="Imágenes"] img').first().getAttribute("src");
    expect(src).toMatch(/^\/archivos\/[0-9a-f-]{36}\/show\.jpg\?v=web$/);
    const img = await visitante.evaluate(async (u) => {
      const r = await fetch(u);
      return { tipo: r.headers.get("content-type"), bytes: (await r.arrayBuffer()).byteLength };
    }, src!);
    expect(img.tipo).toBe("image/webp");

    await visitante.goto(`${sitio("banda-a")}/prensa`);
    const prensa = await visitante.locator("main").textContent();
    expect(prensa).toContain("Segundo párrafo.");
    expect(prensa).toContain("prensa@banda-a.com");
    expect(await visitante.getByRole("link", { name: /Descargar rider/ }).getAttribute("href")).toMatch(/descargar=1$/);

    // Un cambio nuevo vuelve a ser borrador hasta publicar.
    await page.goto(panel("banda-a", "/home"));
    await enviar(page, "Bio corta", (f) => f.locator("textarea").fill("Bio nueva sin publicar."), "Guardar");
    await page.goto(panel("banda-a"));
    expect(await page.getByTestId("estado-publicacion").textContent()).toContain("Hay cambios sin publicar");
    await visitante.goto(sitio("banda-a"));
    expect(await visitante.locator("main").textContent()).toContain("Rock de garage desde Rosario.");
    expect(await visitante.content()).not.toContain("Bio nueva sin publicar");
  });
});

describe("prueba 2: el sitio público es anónimo y no filtra nada del panel", () => {
  it("responde sin sesión, sin cookies, sin links ni archivos del panel", async () => {
    const { ctx, page } = await anonimo();
    const r = await page.goto(sitio("banda-a"));
    expect(r!.status()).toBe(200);
    expect(r!.headers()["set-cookie"]).toBeUndefined();
    expect((await ctx.cookies()).length).toBe(0);
    const html = await page.content();
    expect(html).not.toMatch(/\/b\/banda-a/);
    expect(html).not.toContain("Vista previa");
    expect(html).not.toContain("Bio nueva sin publicar");
    expect((await page.goto(`${sitio("banda-a")}/sitio`))!.status()).toBe(404);
  });
});

describe("prueba 3: dos bandas, cada sitio muestra lo suyo", () => {
  it("B publica su contenido; A sigue con el suyo", async () => {
    const { page } = await logueado("multi@x.com"); // EDITOR en B
    await page.goto(panel("banda-b", "/home"));
    await enviar(page, "Bio corta", (f) => f.locator("textarea").fill("Folk de cámara desde Bariloche."), "Guardar");
    await publicar(page, "banda-b");

    const v = (await anonimo()).page;
    await v.goto(sitio("banda-b"));
    const b = await v.locator("main").textContent();
    expect(b).toContain("Folk de cámara");
    expect(b).not.toContain("Rock de garage");
    await v.goto(sitio("banda-a"));
    const a = await v.locator("main").textContent();
    expect(a).toContain("Rock de garage");
    expect(a).not.toContain("Folk de cámara");
  });
});

describe("prueba 4: sin sitio.contenido.editar se ve el panel pero no se guarda", () => {
  it("LECTURA ve los datos con todo deshabilitado, y el servidor rechaza igual", async () => {
    const { page } = await logueado("ajeno@x.com"); // LECTURA en B
    const r = await page.goto(panel("banda-b", "/home"));
    expect(r!.status()).toBe(200);
    expect(await page.getByRole("note").textContent()).toMatch(/puede ver el sitio, pero no editarlo/);
    expect(await page.locator("textarea").inputValue()).toBe("Folk de cámara desde Bariloche.");
    expect(await page.getByRole("button", { name: "Guardar" }).isDisabled()).toBe(true);
    await page.goto(panel("banda-b"));
    expect(await page.getByRole("button", { name: "Publicar cambios" }).isDisabled()).toBe(true);

    // Forzando el formulario (como haría alguien desde la consola), el servidor dice que no.
    await page.goto(panel("banda-b", "/home"));
    const form = page.locator("section", { has: page.getByRole("heading", { name: "Bio corta" }) }).locator("form");
    // Habilita todo lo deshabilitado (fieldset, campo y botón) y envía el formulario a mano.
    await form.evaluate((f: HTMLFormElement) => {
      f.querySelectorAll<HTMLElement>("[disabled]").forEach((x) => x.removeAttribute("disabled"));
      f.querySelector("textarea")!.value = "Intento de LECTURA";
      f.requestSubmit();
    });
    expect(await form.getByRole("alert").textContent()).toBe("Tu rol no puede editar el sitio.");
    const perfil = await dueno.sitioPerfil.findUniqueOrThrow({ where: { tenantId: e.b.id } });
    expect(perfil.bioCorta).toBe("Folk de cámara desde Bariloche.");
  });
});

describe("prueba 6: un archivo de la banda A no es accesible desde la B", () => {
  it("la URL de una imagen de A da 404 en el host de B y en el panel de B", async () => {
    const v = (await anonimo()).page;
    await v.goto(sitio("banda-a"));
    const src = (await v.locator('section[aria-label="Imágenes"] img').first().getAttribute("src"))!;
    expect((await v.goto(`${sitio("banda-a")}${src}`))!.status()).toBe(200);
    expect((await v.goto(`${sitio("banda-b")}${src}`))!.status()).toBe(404);

    const { page } = await logueado("multi@x.com");
    const id = src.split("/")[2];
    expect((await page.goto(`${APP}/b/banda-a/archivos/${id}/x`))!.status()).toBe(200);
    expect((await page.goto(`${APP}/b/banda-b/archivos/${id}/x`))!.status()).toBe(404);
  });
});

describe("prueba 8: un SVG subido como descargable se descarga, no se renderiza", () => {
  it("en el press kit no hay <img> del SVG, y su URL responde como descarga", async () => {
    const { page } = await logueado("multi@x.com");
    await page.goto(panel("banda-a", "/prensa"));
    await enviar(
      page,
      "Logos",
      (f) => f.locator('input[type="file"]').setInputFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: SVG }),
      "Agregar logo",
    );
    await publicar(page, "banda-a");

    const v = (await anonimo()).page;
    await v.goto(`${sitio("banda-a")}/prensa`);
    expect(await v.locator('img[src*=".svg"]').count()).toBe(0);
    const href = (await v.getByRole("link", { name: "SVG" }).getAttribute("href"))!;
    const h = await v.evaluate(async (u) => {
      const r = await fetch(u);
      return { disp: r.headers.get("content-disposition"), csp: r.headers.get("content-security-policy") };
    }, href);
    expect(h.disp).toMatch(/^attachment; filename\*=UTF-8''logo\.svg$/);
    expect(h.csp).toMatch(/sandbox/);
  });

  it("como logo del sitio no se acepta un SVG", async () => {
    const { page } = await logueado("multi@x.com");
    await page.goto(panel("banda-a", "/identidad"));
    const form = await enviar(
      page,
      "Identidad visual",
      (f) => f.locator('input[name="logo"]').setInputFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: SVG }),
      "Guardar",
    );
    expect(await form.getByRole("alert").textContent()).toBe('"logo.svg" no es un formato aceptado acá (PNG, WEBP).');
  });
});

describe("prueba 9: pasada la cuota, la subida se rechaza con un mensaje claro", () => {
  it("muestra cuánto usa la banda y qué hacer", async () => {
    await dueno.tenant.update({ where: { id: e.a.id }, data: { limiteAlmacenamiento: BigInt(1000) } });
    const { page } = await logueado("multi@x.com");
    await page.goto(panel("banda-a", "/prensa"));
    const f2 = await enviar(
      page,
      "Fotos en alta",
      async (f) => f.locator('input[type="file"]').setInputFiles({ name: "foto.jpg", mimeType: "image/jpeg", buffer: await jpg(1200, 800) }),
      "Agregar foto",
    );
    expect(await f2.getByRole("alert").textContent()).toMatch(
      /^No hay espacio para "foto\.jpg" \(.+\): la banda usa .+ de 1 KB\. Borrá archivos que no uses o ampliá el espacio\.$/,
    );
  });
});

describe("casilla oficial (Checkbox) en un formulario de server action", () => {
  it("marcar 'Quitar el rider' lo quita del borrador", async () => {
    expect((await dueno.sitioPerfil.findUniqueOrThrow({ where: { tenantId: e.a.id } })).riderArchivoId).not.toBeNull();
    const { page } = await logueado("multi@x.com");
    await page.goto(panel("banda-a", "/prensa"));
    const tarjeta = page.locator("section", { has: page.getByRole("heading", { name: "Textos, rider y contacto" }) });
    await tarjeta.getByText("Quitar el rider").click();
    await tarjeta.getByRole("button", { name: "Guardar" }).click();
    await tarjeta.getByRole("status").waitFor();
    expect((await dueno.sitioPerfil.findUniqueOrThrow({ where: { tenantId: e.a.id } })).riderArchivoId).toBeNull();
  });
});
