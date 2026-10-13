import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/nucleo/db/cliente";
import { conTenant } from "@/nucleo/db/con-tenant";
import { dosBandas, dueno } from "./apoyo";

let a: { id: string };
let b: { id: string };

beforeAll(async () => {
  ({ a, b } = await dosBandas());
});
afterAll(async () => {
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("rol de la aplicación", () => {
  it("no es superusuario ni puede saltear RLS", async () => {
    const [r] = await prisma.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(r).toEqual({ rolsuper: false, rolbypassrls: false });
  });
});

describe("prueba 1: el tenant A jamás ve filas del B", () => {
  it("cada tabla devuelve solo lo del tenant activo", async () => {
    await conTenant(a.id, async (tx) => {
      for (const filas of [
        await tx.tenant.findMany(),
        await tx.membresia.findMany(),
        await tx.dominio.findMany(),
        await tx.evento.findMany(),
      ]) {
        expect(filas.length).toBeGreaterThan(0);
        for (const f of filas) expect("tenantId" in f ? f.tenantId : f.id).toBe(a.id);
      }
    });
  });

  it("pedir explícitamente datos del B desde A devuelve vacío", async () => {
    const filas = await conTenant(a.id, (tx) => tx.dominio.findMany({ where: { tenantId: b.id } }));
    expect(filas).toEqual([]);
  });

  it("no se puede escribir en el B desde A", async () => {
    await expect(
      conTenant(a.id, (tx) =>
        tx.evento.create({ data: { tenantId: b.id, nombre: "intruso.creado", payload: {} } }),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("no se puede modificar ni borrar filas del B desde A", async () => {
    const r = await conTenant(a.id, (tx) =>
      tx.dominio.updateMany({ where: { tenantId: b.id }, data: { verificado: false } }),
    );
    expect(r.count).toBe(0);
    const borrados = await conTenant(a.id, (tx) => tx.evento.deleteMany({ where: { tenantId: b.id } }));
    expect(borrados.count).toBe(0);
  });
});

describe("prueba 2: una consulta sin filtro de tenant no filtra datos", () => {
  it("sin conTenant, la app no ve ninguna fila de banda", async () => {
    expect(await prisma.tenant.findMany()).toEqual([]);
    expect(await prisma.membresia.findMany()).toEqual([]);
    expect(await prisma.dominio.findMany()).toEqual([]);
    expect(await prisma.evento.findMany()).toEqual([]);
  });

  it("SQL crudo sin WHERE tampoco", async () => {
    const filas = await prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM "evento"`);
    expect(filas).toEqual([]);
  });

  it("la variable no sobrevive a la transacción (no se filtra por el pool)", async () => {
    await conTenant(a.id, (tx) => tx.evento.findMany());
    expect(await prisma.evento.findMany()).toEqual([]);
  });

  it("sin tenant no se puede insertar", async () => {
    await expect(
      prisma.evento.create({ data: { tenantId: a.id, nombre: "huerfano.creado", payload: {} } }),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("resolución de dominio sin tenant fijado", () => {
  it("resolver_tenant_por_host devuelve solo el id del tenant", async () => {
    const [r] = await prisma.$queryRaw<{ id: string | null }[]>`
      SELECT resolver_tenant_por_host('BANDA-B.deoco.com') AS id`;
    expect(r.id).toBe(b.id);
    const [n] = await prisma.$queryRaw<{ id: string | null }[]>`
      SELECT resolver_tenant_por_host('no-existe.com') AS id`;
    expect(n.id).toBeNull();
  });
});

describe("toda tabla con datos de banda nace con RLS", () => {
  it("cada tabla de public (salvo usuario y la de Prisma) tiene RLS y una política", async () => {
    const filas = await dueno.$queryRaw<{ tabla: string; rls: boolean; politicas: number }[]>`
      SELECT c.relname AS tabla, c.relrowsecurity AS rls,
             (SELECT count(*)::int FROM pg_policies p WHERE p.tablename = c.relname) AS politicas
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname NOT IN ('usuario', '_prisma_migrations')`;
    expect(filas.length).toBeGreaterThan(0);
    for (const f of filas) {
      expect(f, `tabla "${f.tabla}" sin RLS o sin política`).toMatchObject({ rls: true });
      expect(f.politicas, `tabla "${f.tabla}" sin política`).toBeGreaterThan(0);
    }
  });
});

describe("tablas de módulos", () => {
  const NUCLEO = ["usuario", "tenant", "membresia", "dominio", "moduloTenant", "evento", "archivo", "auditoria", "secreto", "correo", "archivo_plataforma", "cuenta_externa", "_prisma_migrations"];

  it("toda tabla que no es del núcleo lleva el prefijo de un módulo registrado y tiene tenantId", async () => {
    const { registro } = await import("@/nucleo/modulos");
    const prefijos = registro().modulos.map((m) => `${m.id.replace(/-/g, "_")}_`);
    const tablas = await dueno.$queryRaw<{ tabla: string; tiene_tenant: boolean }[]>`
      SELECT t.tablename AS tabla,
             EXISTS (SELECT 1 FROM information_schema.columns c
                     WHERE c.table_name = t.tablename AND c.column_name = 'tenantId') AS tiene_tenant
      FROM pg_tables t WHERE t.schemaname = 'public'`;
    const deModulos = tablas.filter((t) => !NUCLEO.includes(t.tabla));
    expect(deModulos.length).toBeGreaterThan(0);
    const globales = registro().tablasGlobales.map((g) => g.tabla);
    for (const t of deModulos) {
      expect(prefijos.some((p) => t.tabla.startsWith(p)), `"${t.tabla}" sin prefijo de módulo`).toBe(true);
      if (globales.includes(t.tabla)) continue; // ver la prueba de tablas globales
      expect(t.tiene_tenant, `"${t.tabla}" sin tenantId (ni declarada en tablasGlobales)`).toBe(true);
    }
  });

  it("toda tabla global declarada: sin tenantId, se lee libre y solo se escribe como staff", async () => {
    const { registro } = await import("@/nucleo/modulos");
    for (const { tabla } of registro().tablasGlobales) {
      const politicas = await dueno.$queryRaw<{ policyname: string; cmd: string; qual: string | null }[]>`
        SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = ${tabla} ORDER BY policyname`;
      expect(politicas.map((p) => p.policyname), `"${tabla}" sin las políticas de deoco_tabla_global`).toEqual([
        "escritura_staff",
        "lectura_global",
      ]);
      const [col] = await dueno.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = ${tabla} AND column_name = 'tenantId'`;
      expect(col.n, `"${tabla}" es global y tiene tenantId`).toBe(0);
    }
  });

  it("las tablas del módulo sitio aíslan por banda", async () => {
    await conTenant(a.id, (tx) =>
      tx.sitioFecha.create({ data: { tenantId: a.id, fecha: new Date(), lugar: "Club A", ciudad: "Rosario" } }),
    );
    expect(await conTenant(a.id, (tx) => tx.sitioFecha.count())).toBe(1);
    expect(await conTenant(b.id, (tx) => tx.sitioFecha.count())).toBe(0);
    expect(await prisma.sitioFecha.count()).toBe(0); // sin tenant, nada
    await expect(
      conTenant(b.id, (tx) =>
        tx.sitioFecha.create({ data: { tenantId: a.id, fecha: new Date(), lugar: "x", ciudad: "x" } }),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("deoco_aislar_tabla rechaza una tabla sin tenantId", async () => {
    await dueno.$executeRawUnsafe(`CREATE TABLE "prueba_sin_tenant" (id int)`);
    try {
      await expect(dueno.$executeRawUnsafe(`SELECT deoco_aislar_tabla('prueba_sin_tenant')`)).rejects.toThrow(
        /no tiene columna "tenantId"/,
      );
    } finally {
      await dueno.$executeRawUnsafe(`DROP TABLE "prueba_sin_tenant"`);
    }
  });

  it("la app no puede llamar a deoco_aislar_tabla", async () => {
    await expect(prisma.$executeRawUnsafe(`SELECT deoco_aislar_tabla('sitio_fecha')`)).rejects.toThrow(/permission denied/);
  });
});
