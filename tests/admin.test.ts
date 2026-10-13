import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { altaBanda } from "@/app/admin/_servidor/bandas";
import { dbAdmin } from "@/app/admin/_servidor/db";
import { registrarAccesoStaff } from "@/nucleo/acceso/registro-staff";
import { verificarCredenciales } from "@/nucleo/auth/credenciales";
import { prisma } from "@/nucleo/db/cliente";
import { conTenant } from "@/nucleo/db/con-tenant";
import { dueno, escenarioAcceso } from "./apoyo";

let e: Awaited<ReturnType<typeof escenarioAcceso>>;

beforeAll(async () => {
  e = await escenarioAcceso();
  // El alta arma el subdominio con DEOCO_DOMINIO_RAIZ (lvh.me en pruebas).
  await dueno.dominio.create({ data: { tenantId: e.b.id, dominio: "banda-b.lvh.me" } });
});
beforeEach(async () => {
  await dueno.auditoria.deleteMany();
});
afterAll(async () => {
  await prisma.$disconnect();
  await dbAdmin().$disconnect();
  await dueno.$disconnect();
});

describe("prueba 4: la conexión de administración solo se usa desde /admin", () => {
  function archivos(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? archivos(p) : [p];
    });
  }
  const IMPORTA_ADMIN = /from\s+["'][^"']*admin\/_servidor\/db["']|from\s+["']\.\/db["']/;

  it("ningún archivo fuera de src/app/admin importa admin/_servidor/db", () => {
    const fuentes = [...archivos("src"), ...archivos("modulos"), ...archivos("scripts"), ...archivos("prisma")]
      .filter((f) => /\.(ts|tsx|mjs)$/.test(f))
      .filter((f) => !f.startsWith(path.join("src", "app", "admin") + path.sep))
      .filter((f) => !f.startsWith(path.join("src", "generated") + path.sep));
    const culpables = fuentes.filter((f) => /admin\/_servidor\/db/.test(readFileSync(f, "utf8")));
    expect(culpables).toEqual([]);
  });

  it("dentro de /admin, solo _servidor/ la importa directo (las rutas pasan por sus funciones)", () => {
    const enAdmin = archivos(path.join("src", "app", "admin")).filter((f) => /\.(ts|tsx)$/.test(f));
    const directos = enAdmin.filter((f) => IMPORTA_ADMIN.test(readFileSync(f, "utf8")));
    expect(directos.every((f) => f.includes(`${path.sep}_servidor${path.sep}`))).toBe(true);
  });

  it("la prueba detecta una violación", () => {
    expect(/admin\/_servidor\/db/.test('import { dbAdmin } from "@/app/admin/_servidor/db";')).toBe(true);
  });
});

describe("rol deoco_admin", () => {
  it("saltea RLS pero no es superusuario ni dueño de las tablas", async () => {
    const [r] = await dbAdmin().$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(r).toEqual({ rolsuper: false, rolbypassrls: true });
    await expect(dbAdmin().$executeRawUnsafe(`ALTER TABLE "tenant" ADD COLUMN x int`)).rejects.toThrow(/must be owner/);
    await expect(dbAdmin().$queryRawUnsafe(`SELECT * FROM "_prisma_migrations"`)).rejects.toThrow(/permission denied/);
  });

  it("ve todas las bandas sin fijar tenant (la app no ve ninguna)", async () => {
    expect(await dbAdmin().tenant.count()).toBe(2);
    expect(await prisma.tenant.count()).toBe(0);
  });
});

describe("alta de banda (y prueba 5: deja su auditoría)", () => {
  it("con titular nuevo: crea usuario con clave temporal, banda, subdominio y membresía", async () => {
    const r = await altaBanda(e.staff.id, {
      nombre: "Los Nuevos",
      slug: "los-nuevos",
      subdominio: "",
      titularEmail: "Nuevo@Banda.com",
      titularNombre: "Titular Nuevo",
    });
    expect(r).toMatchObject({ slug: "los-nuevos", dominio: "los-nuevos.lvh.me", titular: "nuevo@banda.com" });
    expect(r.claveTemporal).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);

    const usuario = await verificarCredenciales("nuevo@banda.com", r.claveTemporal!);
    expect(usuario).not.toBeNull();
    const m = await dueno.membresia.findFirstOrThrow({ where: { usuarioId: usuario!.id } });
    expect(m).toMatchObject({ tenantId: r.tenantId, rol: "TITULAR" });
    expect(await dueno.dominio.findFirstOrThrow({ where: { dominio: "los-nuevos.lvh.me" } })).toMatchObject({
      tenantId: r.tenantId,
      esPrincipal: true,
    });

    const auditoria = await dueno.auditoria.findMany({ orderBy: { fecha: "asc" } });
    expect(auditoria.map((a) => [a.accion, a.usuarioId, a.tenantId])).toEqual([
      ["usuario.creado", e.staff.id, null],
      ["banda.creada", e.staff.id, r.tenantId],
    ]);
    expect(auditoria[1].detalle).toMatchObject({ slug: "los-nuevos", titular: "nuevo@banda.com", titularNuevo: true });
    expect(JSON.stringify(auditoria)).not.toContain(r.claveTemporal); // la clave no queda en ningún lado
  });

  it("con titular existente: lo reutiliza, sin clave nueva", async () => {
    const r = await altaBanda(e.staff.id, {
      nombre: "Otra",
      slug: "otra",
      subdominio: "otra-banda",
      titularEmail: "multi@x.com",
      titularNombre: "",
    });
    expect(r.claveTemporal).toBeNull();
    expect(r.dominio).toBe("otra-banda.lvh.me");
    expect(await dueno.membresia.count({ where: { usuarioId: e.multi.id } })).toBe(3);
    expect((await dueno.auditoria.findMany()).map((a) => a.accion)).toEqual(["banda.creada"]);
  });

  it.each([
    [{ slug: "Mal Slug" }, /El slug "mal slug" no es válido/],
    [{ slug: "app" }, /está reservado/],
    [{ subdominio: "www" }, /El subdominio "www" está reservado/],
    [{ slug: "banda-a" }, /Ya existe una banda con el slug "banda-a"/],
    [{ subdominio: "banda-b" }, /banda-b\.lvh\.me ya está en uso/],
    [{ titularEmail: "nadie@x.com", titularNombre: "" }, /completá su nombre para crearlo/],
  ])("rechaza %o sin dejar nada a medias", async (cambio, error) => {
    const antes = await dueno.tenant.count();
    await expect(
      altaBanda(e.staff.id, {
        nombre: "Prueba",
        slug: "prueba-x",
        subdominio: "",
        titularEmail: "multi@x.com",
        titularNombre: "",
        ...cambio,
      }),
    ).rejects.toThrow(error);
    expect(await dueno.tenant.count()).toBe(antes);
    expect(await dueno.auditoria.count()).toBe(0);
  });
});

describe("accesos del staff a una banda", () => {
  it("quedan en auditoría, uno por ventana de 10 minutos", async () => {
    const fecha = new Date();
    await registrarAccesoStaff({ usuarioId: e.staff.id, tenantId: e.a.id, ruta: "/b/banda-a", fecha });
    await registrarAccesoStaff({ usuarioId: e.staff.id, tenantId: e.a.id, ruta: "/b/banda-a/sitio", fecha });
    await registrarAccesoStaff({ usuarioId: e.staff.id, tenantId: e.b.id, ruta: "/b/banda-b", fecha });
    await registrarAccesoStaff({
      usuarioId: e.staff.id,
      tenantId: e.a.id,
      ruta: "/b/banda-a",
      fecha: new Date(fecha.getTime() + 11 * 60 * 1000),
    });
    const filas = await dueno.auditoria.findMany({ where: { accion: "acceso.panel" }, orderBy: { fecha: "asc" } });
    expect(filas.map((f) => [f.tenantId, (f.detalle as { ruta: string }).ruta])).toEqual([
      [e.a.id, "/b/banda-a"],
      [e.b.id, "/b/banda-b"],
      [e.a.id, "/b/banda-a"],
    ]);
  });

  it("la auditoría de una banda no la ve otra (RLS); las filas de plataforma, ninguna", async () => {
    await registrarAccesoStaff({ usuarioId: e.staff.id, tenantId: e.a.id, ruta: "/b/banda-a", fecha: new Date() });
    await dueno.auditoria.create({ data: { usuarioId: e.staff.id, accion: "usuario.creado" } });
    expect(await conTenant(e.a.id, (tx) => tx.auditoria.count())).toBe(1);
    expect(await conTenant(e.b.id, (tx) => tx.auditoria.count())).toBe(0);
    expect(await dbAdmin().auditoria.count()).toBe(2);
  });
});
