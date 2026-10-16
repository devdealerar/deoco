import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Page } from "playwright-core";
import { prisma } from "@/nucleo/db/cliente";
import { dueno, escenarioAcceso } from "../apoyo";
import { APP, abrirNavegador, captura, anonimo, cerrarContextos, cerrarNavegador, dominiosDeDesarrollo, logueado, sitio } from "./navegador";

beforeAll(async () => {
  const e = await escenarioAcceso();
  await dominiosDeDesarrollo(e.a, e.b);
  await abrirNavegador();
});
afterEach(async () => {
  await cerrarContextos();
});
afterAll(async () => {
  await cerrarNavegador();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("prueba 1: /admin es 404 para todo el que no sea staff", () => {
  it("sin sesión, un usuario común, y el staff desde el host de una banda", async () => {
    const anon = (await anonimo()).page;
    expect((await anon.goto(`${APP}/admin`))!.status()).toBe(404);
    expect((await anon.goto(`${APP}/admin/bandas/nueva`))!.status()).toBe(404);

    const titular = (await logueado("multi@x.com")).page; // TITULAR en A, pero no staff
    expect((await titular.goto(`${APP}/admin`))!.status()).toBe(404);
    expect((await titular.goto(`${APP}/admin/bandas/nueva`))!.status()).toBe(404);

    const staff = (await logueado("staff@deocoartist.com")).page;
    expect((await staff.goto(`${sitio("banda-a")}/admin`))!.status()).toBe(404);
    expect((await staff.goto(`${APP}/admin`))!.status()).toBe(200);
  });
});

describe("listado de bandas", () => {
  it("muestra todas las bandas con estado, módulos y espacio", async () => {
    const { page } = await logueado("staff@deocoartist.com");
    await page.goto(`${APP}/admin`);
    const filas = page.getByRole("row");
    await expect(filas.filter({ hasText: "Banda A" }).count()).resolves.toBe(1);
    const a = await filas.filter({ hasText: "Banda A" }).textContent();
    expect(a).toContain("ACTIVO");
    expect(a).toContain("banda-a.lvh.me");
    expect(a).toMatch(/de 1\.0 GB/);
    await expect(filas.filter({ hasText: "Banda B" }).count()).resolves.toBe(1);
    await captura(page, "admin-bandas");
    await page.goto(`${APP}/admin/usuarios`);
    await captura(page, "admin-usuarios");
  });
});

describe("prueba 2: el staff da de alta una banda y el titular entra sin tocar SQL", () => {
  it("alta con titular nuevo → clave temporal → el titular entra a su panel", async () => {
    const { page } = await logueado("staff@deocoartist.com");
    await page.goto(`${APP}/admin/bandas/nueva`);
    const form = page.locator("form[data-hidratado]");
    await form.waitFor();
    await form.locator('input[name="nombre"]').fill("Los Nuevos");
    await form.locator('input[name="slug"]').fill("los-nuevos");
    await form.locator('input[name="titularEmail"]').fill("titular@losnuevos.com");
    await form.locator('input[name="titularNombre"]').fill("Titular Nuevo");
    await form.getByRole("button", { name: "Crear banda" }).click();
    const mensaje = (await form.getByRole("status").textContent())!;
    expect(mensaje).toMatch(/^Banda creada \(los-nuevos\.lvh\.me\)\. El titular titular@losnuevos\.com entra en .*\/b\/los-nuevos con la clave temporal [a-z2-9-]{14} \(se muestra una sola vez\)\.$/);
    const clave = mensaje.match(/clave temporal ([a-z2-9-]{14})/)![1];

    await page.goto(`${APP}/admin`);
    expect(await page.getByRole("row").filter({ hasText: "Los Nuevos" }).textContent()).toContain("los-nuevos.lvh.me");

    // Prueba 7: el titular, en otro navegador, con la clave temporal → tiene que cambiarla primero.
    const t = (await anonimo()).page;
    await t.goto(`${APP}/ingresar?volver=/b/los-nuevos`);
    await t.fill('input[name="email"]', "titular@losnuevos.com");
    await t.fill('input[name="contrasena"]', clave);
    await Promise.all([t.waitForURL(`${APP}/clave`), t.click('button[type="submit"]')]);
    expect(await t.getByRole("heading", { name: "Elegí tu clave" }).count()).toBe(1);
    for (const ruta of ["/b/los-nuevos", "/b/los-nuevos/pago", "/"]) {
      await t.goto(`${APP}${ruta}`);
      expect(t.url(), `${ruta} sin cambiar la clave`).toBe(`${APP}/clave`);
    }
    const formClave = t.locator("form[data-hidratado]");
    await formClave.waitFor();
    await formClave.locator('input[name="actual"]').fill(clave);
    await formClave.locator('input[name="nueva"]').fill("mi-clave-definitiva");
    await formClave.locator('input[name="repetida"]').fill("mi-clave-definitiva");
    await Promise.all([t.waitForURL(`${APP}/`), formClave.getByRole("button", { name: "Guardar clave" }).click()]);
    await t.goto(`${APP}/b/los-nuevos`);
    expect(await t.getByTestId("rol").textContent()).toBe("TITULAR");
    // Y su sitio existe (todavía sin módulos prendidos: marco neutro).
    expect((await t.goto(sitio("los-nuevos")))!.status()).toBe(200);

    // Prueba 5: quedó la auditoría.
    const banda = await dueno.tenant.findUniqueOrThrow({ where: { slug: "los-nuevos" } });
    const staff = await dueno.usuario.findUniqueOrThrow({ where: { email: "staff@deocoartist.com" } });
    const filas = await dueno.auditoria.findMany({ where: { usuarioId: staff.id, accion: { in: ["banda.creada", "usuario.creado"] } } });
    expect(filas.map((f) => f.accion).sort()).toEqual(["banda.creada", "usuario.creado"]);
    expect(filas.find((f) => f.accion === "banda.creada")!.tenantId).toBe(banda.id);
  });

  it("un dato inválido devuelve el error y conserva lo escrito", async () => {
    const { page } = await logueado("staff@deocoartist.com");
    await page.goto(`${APP}/admin/bandas/nueva`);
    const form = page.locator("form[data-hidratado]");
    await form.waitFor();
    await form.locator('input[name="nombre"]').fill("Repetida");
    await form.locator('input[name="slug"]').fill("banda-a");
    await form.locator('input[name="titularEmail"]').fill("multi@x.com");
    await form.getByRole("button", { name: "Crear banda" }).click();
    expect(await form.getByRole("alert").textContent()).toBe('Ya existe una banda con el slug "banda-a".');
    expect(await form.locator('input[name="nombre"]').inputValue()).toBe("Repetida");
    expect(await form.locator('input[name="titularEmail"]').inputValue()).toBe("multi@x.com");
  });
});

describe("accesos del staff al panel de una banda", () => {
  it("quedan en la auditoría", async () => {
    const { page } = await logueado("staff@deocoartist.com");
    const staff = await dueno.usuario.findUniqueOrThrow({ where: { email: "staff@deocoartist.com" } });
    const banda = await dueno.tenant.findUniqueOrThrow({ where: { slug: "banda-b" } });
    expect((await page.goto(`${APP}/b/banda-b`))!.status()).toBe(200);
    const fila = await dueno.auditoria.findFirst({ where: { usuarioId: staff.id, tenantId: banda.id, accion: "acceso.panel" } });
    expect(fila?.detalle).toEqual({ ruta: "/b/banda-b" });
  });
});

describe("prueba 6: archivar y reactivar una banda", () => {
  it("archivada deja de responder (panel y sitio); activa de nuevo, responde", async () => {
    const { page } = await logueado("staff@deocoartist.com");
    const v = (await anonimo()).page;
    expect((await v.goto(sitio("banda-b")))!.status()).toBe(200);

    await page.goto(`${APP}/admin/bandas/banda-b`);
    // El uso de la banda (medición, no limita): archivos y lo que cuenta cada módulo.
    expect(await page.locator('[data-medida="nucleo.archivos"] dd').textContent()).toMatch(/^\d+$/);
    expect(await page.locator('[data-medida="tienda.productos"]').count()).toBe(1);
    const estado = page.locator("section", { has: page.getByRole("heading", { name: "Estado" }) }).locator("form[data-hidratado]");
    await estado.waitFor();
    await estado.locator('select[name="estado"]').selectOption("ARCHIVADO");
    await estado.getByRole("button", { name: "Cambiar estado" }).click();
    expect(await estado.getByRole("alert").textContent()).toMatch(/confirmá que el panel y el sitio/);
    expect((await v.goto(sitio("banda-b")))!.status()).toBe(200); // sin confirmar, no cambió

    await estado.getByText("Si elijo Archivado").click();
    await estado.getByRole("button", { name: "Cambiar estado" }).click();
    await estado.getByRole("status").waitFor();
    expect((await v.goto(sitio("banda-b")))!.status()).toBe(404);
    expect((await page.goto(`${APP}/b/banda-b`))!.status()).toBe(404);

    await page.goto(`${APP}/admin/bandas/banda-b`);
    const estado2 = page.locator("section", { has: page.getByRole("heading", { name: "Estado" }) }).locator("form[data-hidratado]");
    await estado2.waitFor();
    await estado2.locator('select[name="estado"]').selectOption("ACTIVO");
    await estado2.getByRole("button", { name: "Cambiar estado" }).click();
    await estado2.getByRole("status").waitFor();
    expect((await v.goto(sitio("banda-b")))!.status()).toBe(200);
    expect((await page.goto(`${APP}/b/banda-b`))!.status()).toBe(200);

    const filas = await dueno.auditoria.findMany({ where: { accion: "banda.estado_cambiado" }, orderBy: { fecha: "asc" } });
    expect(filas.map((f) => f.detalle)).toEqual([
      { de: "ACTIVO", a: "ARCHIVADO" },
      { de: "ARCHIVADO", a: "ACTIVO" },
    ]);
  });
});

describe("prueba 8 (pantalla): quitar al único titular", () => {
  it("muestra el error y no lo quita", async () => {
    const { page } = await logueado("staff@deocoartist.com");
    await page.goto(`${APP}/admin/bandas/banda-b`);
    const fila = page.getByRole("row").filter({ has: page.locator('[data-email="b@x.com"]') });
    const quitar = fila.locator("form[data-hidratado]").last();
    await quitar.waitFor();
    await quitar.getByRole("button", { name: "Quitar" }).click();
    expect(await quitar.getByRole("alert").textContent()).toMatch(/Para quitar a b@x\.com de la banda, confirmalo/);
    await quitar.getByText("Confirmo").click();
    await quitar.getByRole("button", { name: "Quitar" }).click();
    await quitar.getByRole("alert").filter({ hasText: /no puede quedar sin titular/ }).waitFor();
    expect(await dueno.membresia.count({ where: { tenant: { slug: "banda-b" }, rol: "TITULAR" } })).toBe(1);
  });
});

describe("prueba 9 (pantalla): eventos fallidos", () => {
  it("lista el fallido con su error y reprocesar lo entrega", async () => {
    const b = await dueno.tenant.findUniqueOrThrow({ where: { slug: "banda-b" } });
    await dueno.moduloTenant.create({ data: { tenantId: b.id, moduloId: "prueba" } });
    const ev = await dueno.evento.create({
      data: {
        tenantId: b.id,
        nombre: "prueba.verificada",
        payload: {},
        estado: "FALLIDO",
        intentos: 1,
        fallos: [{ intento: 1, moduloId: "prueba", error: "el servicio no respondió", fecha: new Date().toISOString() }],
      },
    });
    const { page } = await logueado("staff@deocoartist.com");
    await page.goto(`${APP}/admin/eventos`);
    const fila = page.getByRole("row").filter({ has: page.locator(`[data-evento="${ev.id}"]`) });
    expect(await fila.textContent()).toContain("prueba: el servicio no respondió");
    await captura(page, "admin-eventos");
    const form = fila.locator("form[data-hidratado]");
    await form.waitFor();
    await form.getByRole("button", { name: "Reprocesar" }).click();
    await page.waitForFunction((id) => !document.querySelector(`[data-evento="${id}"]`), ev.id, { timeout: 20_000 });
    expect(await dueno.evento.findUniqueOrThrow({ where: { id: ev.id } })).toMatchObject({ estado: "PROCESADO", intentos: 2 });
    expect(await dueno.auditoria.count({ where: { accion: "evento.reprocesado", detalle: { equals: { eventoId: ev.id } } } })).toBe(1);
  });
});

describe("listados largos: paginados en el servidor, con filtro y orden en la URL", () => {
  const LOTES = 63;
  beforeAll(async () => {
    await dueno.tenant.createMany({
      data: Array.from({ length: LOTES }, (_, i) => ({
        nombre: `Lote ${String(i + 1).padStart(2, "0")}`,
        slug: `lote-${String(i + 1).padStart(2, "0")}`,
        estado: i % 3 === 0 ? ("MOROSO" as const) : ("ACTIVO" as const),
        creadoEn: new Date(Date.UTC(2025, 0, 1, 0, i)),
      })),
    });
  });
  afterAll(async () => {
    await dueno.tenant.deleteMany({ where: { slug: { startsWith: "lote-" } } });
  });
  const slugs = (page: Page) => page.locator("[data-slug]").evaluateAll((xs) => xs.map((x) => x.getAttribute("data-slug")));

  it("bandas: 50 por página, filtro y orden en la URL; el link compartido muestra lo mismo", async () => {
    const total = await dueno.tenant.count();
    const { page } = await logueado("staff@deocoartist.com");
    await page.goto(`${APP}/admin`);
    expect(await slugs(page)).toHaveLength(50);
    await captura(page, "admin-bandas-pagina-1");
    await Promise.all([page.waitForURL(`${APP}/admin?pagina=2`), page.getByRole("link", { name: "Siguiente" }).click()]);
    expect(await slugs(page)).toHaveLength(total - 50);
    expect(await page.getByRole("link", { name: "Página 1" }).getAttribute("href")).toBe("/admin");

    // Filtrar vuelve a la página 1 y no deja parámetros vacíos.
    const filtros = page.locator("form[data-filtros]");
    await filtros.getByLabel("Buscar").fill("lote 0");
    await filtros.locator('select[name="estado"]').selectOption("MOROSO");
    await Promise.all([page.waitForURL(`${APP}/admin?q=lote+0&estado=MOROSO`), filtros.getByRole("button", { name: "Filtrar" }).click()]);
    expect(await slugs(page)).toEqual(["lote-07", "lote-04", "lote-01"]);

    // Ordenar por nombre conserva el filtro.
    await Promise.all([page.waitForURL(/orden=nombre&dir=asc/), page.getByRole("columnheader").filter({ hasText: "Banda" }).click()]);
    expect(new URL(page.url()).searchParams.get("q")).toBe("lote 0");
    expect(await slugs(page)).toEqual(["lote-01", "lote-04", "lote-07"]);
    await captura(page, "admin-bandas-filtradas");

    // Otra persona del staff abre el mismo link: ve lo mismo.
    const compartido = page.url();
    const otra = (await logueado("staff@deocoartist.com")).page;
    await otra.goto(compartido);
    expect(await slugs(otra)).toEqual(["lote-01", "lote-04", "lote-07"]);
    expect(await otra.locator("form[data-filtros]").getByLabel("Buscar").inputValue()).toBe("lote 0");

    // Limpiar: todo de nuevo, campos vacíos.
    await Promise.all([page.waitForURL(`${APP}/admin`), filtros.getByRole("link", { name: "Limpiar" }).click()]);
    expect(await slugs(page)).toHaveLength(50);
    expect(await page.locator("form[data-filtros]").getByLabel("Buscar").inputValue()).toBe("");
  });

  it("usuarios: solo staff; eventos: por banda y por nombre", async () => {
    const { page } = await logueado("staff@deocoartist.com");
    await page.goto(`${APP}/admin/usuarios`);
    const filtros = page.locator("form[data-filtros]");
    await filtros.getByText("Solo staff").click();
    await Promise.all([page.waitForURL(`${APP}/admin/usuarios?staff=on`), filtros.getByRole("button", { name: "Filtrar" }).click()]);
    expect(await page.locator("[data-email]").evaluateAll((xs) => xs.map((x) => x.getAttribute("data-email")))).toEqual(["staff@deocoartist.com"]);
    await captura(page, "admin-usuarios-staff");

    const [a, b] = await Promise.all(["banda-a", "banda-b"].map((slug) => dueno.tenant.findUniqueOrThrow({ where: { slug } })));
    const fallo = { payload: {}, estado: "FALLIDO" as const, intentos: 1, fallos: [] };
    await dueno.evento.createMany({
      data: [
        ...Array.from({ length: 52 }, () => ({ ...fallo, tenantId: a.id, nombre: "prueba.verificada" })),
        { ...fallo, tenantId: b.id, nombre: "prueba.verificada" },
        { ...fallo, tenantId: b.id, nombre: "otro.evento" },
      ],
    });
    try {
      await page.goto(`${APP}/admin/eventos`);
      expect(await page.locator("[data-evento]").count()).toBe(50);
      await page.goto(`${APP}/admin/eventos?banda=banda-b&evento=otro.evento`);
      expect(await page.locator("[data-evento]").count()).toBe(1);
      expect(await page.locator('select[name="evento"]').inputValue()).toBe("otro.evento");
      await captura(page, "admin-eventos-filtrados");
    } finally {
      await dueno.evento.deleteMany({ where: { estado: "FALLIDO" } });
    }
  });
});

describe("dominios comprados", () => {
  it("lista las compras, filtra lo que necesita atención y muestra lo que vence", async () => {
    const [a, b] = await Promise.all(["banda-a", "banda-b"].map((slug) => dueno.tenant.findUniqueOrThrow({ where: { slug } })));
    const base = { registrador: "godaddy", monto: 1500000, tipo: "alta" };
    await dueno.dominioCompra.createMany({
      data: [
        { ...base, tenantId: a.id, cobroId: "e2e-1", dominio: "sinsaldo.com", paso: "registrar", motivo: "sin-saldo", error: "Sin saldo en la cuenta" },
        { ...base, tenantId: a.id, cobroId: "e2e-2", dominio: "tranquilo.com", paso: "zona" },
        { ...base, tenantId: b.id, cobroId: "e2e-3", dominio: "listo.com", paso: "listo", estado: "listo", venceEn: new Date(Date.now() + 10 * 86400000) },
      ],
    });
    try {
      const { page } = await logueado("staff@deocoartist.com");
      await page.goto(`${APP}/admin/dominios`);
      expect(await page.locator("[data-compra]").count()).toBe(3);
      await page.goto(`${APP}/admin/dominios?estado=atencion`);
      const filas = page.locator("[data-compra]");
      expect(await filas.count()).toBe(1);
      expect(await filas.textContent()).toContain("sinsaldo.com");
      expect(await page.getByRole("row").filter({ hasText: "sinsaldo.com" }).textContent()).toContain("Sin saldo en la cuenta");
      expect(await page.locator("body").textContent()).toContain("listo.com"); // solo en "Vencen en 30 días"
      await captura(page, "admin-dominios");
      // Reintentar corre la compra ya (acá GoDaddy no responde: suma un intento) y queda auditado.
      const fila = page.getByRole("row").filter({ hasText: "sinsaldo.com" });
      await fila.locator("form[data-hidratado]").waitFor();
      await fila.getByRole("button", { name: "Reintentar" }).click();
      await expect.poll(async () => (await dueno.dominioCompra.findFirstOrThrow({ where: { cobroId: "e2e-1" } })).intentos, { timeout: 20_000 }).toBeGreaterThan(0);
      await expect.poll(() => dueno.auditoria.count({ where: { accion: "dominio.compra_reintentada" } }), { timeout: 20_000 }).toBe(1);
      await page.goto(`${APP}/admin/dominios?banda=banda-b`);
      expect(await page.locator("[data-compra]").count()).toBe(1);
    } finally {
      await dueno.dominioCompra.deleteMany({ where: { cobroId: { startsWith: "e2e-" } } });
    }
  });
});

describe("dominios: precios y pagos (aparte de la cuota)", () => {
  it("una devolución fallida se ve arriba de todo el back office hasta que el staff la resuelve", async () => {
    const a = await dueno.tenant.findUniqueOrThrow({ where: { slug: "banda-a" } });
    const cobro = await dueno.comercialDominioCobro.create({
      data: { tenantId: a.id, tipo: "alta", dominio: "sinvuelta.com", anios: 1, monto: 2500000, clave: "alta:sinvuelta.com", datos: {}, vence: new Date(), estado: "devuelto", pagoId: "e2e-pago-1" },
    });
    await dueno.comercialDominioPago.create({
      data: {
        tenantId: a.id,
        cobroId: cobro.id,
        pagoId: "e2e-pago-1",
        estado: "aprobado",
        monto: 2500000,
        entrega: "hecha",
        devolucion: "fallida",
        devolucionMotivo: "Alguien registró sinvuelta.com antes",
        devolucionIntentos: 3,
        devolucionError: "Mercado Pago respondió 400: insufficient_balance",
        devolucionProxima: new Date(Date.now() + 3_600_000),
        devolucionDesde: new Date(Date.now() - 7_200_000),
      },
    });
    try {
      const { page } = await logueado("staff@deocoartist.com");
      await page.goto(`${APP}/admin/usuarios`);
      const alerta = page.locator("[data-alertas-admin]");
      expect(await alerta.textContent()).toContain("Una devolución de un dominio no sale");
      await Promise.all([page.waitForURL(`${APP}/admin/m/comercial/dominios`), alerta.getByRole("link").first().click()]);
      const fila = page.getByRole("row").filter({ hasText: "sinvuelta.com" });
      expect(await fila.textContent()).toContain("Devolución fallida");
      expect(await fila.textContent()).toContain("insufficient_balance");
      await captura(page, "admin-dominios-pagos");
      // La cuota tiene su propia pantalla: el pago del dominio no aparece ahí.
      await page.goto(`${APP}/admin/m/comercial/cobros`);
      expect(await page.locator("body").textContent()).not.toContain("sinvuelta.com");

      await page.goto(`${APP}/admin/m/comercial/dominios`);
      const form = fila.locator("form[data-hidratado]").filter({ has: page.locator('input[name="nota"]') });
      await form.waitFor();
      await form.locator('input[name="nota"]').fill("Desde Mercado Pago, el 16/10");
      await form.getByRole("button", { name: "Marcar devuelta a mano" }).click();
      // Resuelta, sale de "necesitan atención" (y su formulario con ella).
      await fila.waitFor({ state: "detached" });
      expect(await dueno.comercialDominioPago.findUniqueOrThrow({ where: { pagoId: "e2e-pago-1" } })).toMatchObject({ devolucion: "a-mano", devolucionNota: "Desde Mercado Pago, el 16/10" });
      await page.goto(`${APP}/admin/usuarios`);
      expect(await page.locator("[data-alertas-admin]").count()).toBe(0);

      // Precio de una terminación.
      await page.goto(`${APP}/admin/m/comercial/dominios`);
      const nuevo = page.locator("form[data-hidratado]").filter({ has: page.locator('input[name="tld"]') });
      await nuevo.waitFor();
      await nuevo.locator('input[name="tld"]').fill("com");
      await nuevo.locator('input[name="precio"]').fill("25.000");
      await nuevo.getByRole("button", { name: "Agregar" }).click();
      await nuevo.getByRole("status").waitFor();
      expect(await dueno.comercialDominioPrecio.findUniqueOrThrow({ where: { tld: "com" } })).toMatchObject({ precio: 2500000, aLaVenta: true });
    } finally {
      await dueno.comercialDominioCobro.deleteMany({ where: { clave: "alta:sinvuelta.com" } });
      await dueno.comercialDominioPrecio.deleteMany();
    }
  });
});
