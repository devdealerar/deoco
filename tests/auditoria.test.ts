import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actividadDeBanda } from "@/nucleo/actividad";
import { conTenant } from "@/nucleo/db/con-tenant";
import { prisma } from "@/nucleo/db/cliente";
import { dueno, escenarioAcceso } from "./apoyo";

// Registro de actividad obligatorio (td3, regla 4): solo se agrega. Ni la app ni el back office
// lo pueden cambiar o borrar; la banda lee lo suyo (con nombres solo de su gente).

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
beforeAll(async () => {
  e = await escenarioAcceso();
});
afterAll(async () => {
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("la auditoría es inmutable", () => {
  it("la app inserta, pero no cambia ni borra (ni siquiera sus propias filas)", async () => {
    await conTenant(e.a.id, (tx) => tx.auditoria.createMany({ data: [{ tenantId: e.a.id, usuarioId: e.multi.id, accion: "prueba.hecha" }] }));
    await expect(conTenant(e.a.id, (tx) => tx.auditoria.updateMany({ where: { accion: "prueba.hecha" }, data: { accion: "otra" } }))).rejects.toThrow(/permission denied/);
    await expect(conTenant(e.a.id, (tx) => tx.auditoria.deleteMany({ where: { accion: "prueba.hecha" } }))).rejects.toThrow(/permission denied/);
    expect(await dueno.auditoria.count({ where: { accion: "prueba.hecha" } })).toBeGreaterThan(0);
  });

  it("el back office (deoco_admin, BYPASSRLS) tampoco", async () => {
    const { dbAdmin } = await import("../src/app/admin/_servidor/db");
    await expect(dbAdmin().auditoria.deleteMany({})).rejects.toThrow(/permission denied/);
    await expect(dbAdmin().$executeRawUnsafe(`UPDATE auditoria SET accion = 'x'`)).rejects.toThrow(/permission denied/);
  });
});

describe("la banda lee su actividad", () => {
  it("lo suyo, con nombre de quien lo hizo (el staff, como Equipo de Deoco); nada de otras bandas", async () => {
    await dueno.auditoria.createMany({
      data: [
        { tenantId: e.a.id, usuarioId: e.multi.id, accion: "tienda.panel_guardado", detalle: { pantalla: "/tienda" } },
        { tenantId: e.a.id, usuarioId: e.staff.id, accion: "acceso.panel" },
        { tenantId: e.a.id, usuarioId: null, accion: "banda.estado_cambiado" },
        { tenantId: e.b.id, usuarioId: e.multi.id, accion: "de.la.otra" },
      ],
    });
    const { filas } = await actividadDeBanda(e.a.id);
    const quien = (accion: string) => filas.find((f) => f.accion === accion)?.quien;
    expect(quien("tienda.panel_guardado")).toBe((await dueno.usuario.findUniqueOrThrow({ where: { id: e.multi.id } })).nombre);
    expect(quien("acceso.panel")).toBe("Equipo de Deoco");
    expect(quien("banda.estado_cambiado")).toBe("Deoco (automático)");
    expect(filas.some((f) => f.accion === "de.la.otra")).toBe(false);
    expect((await actividadDeBanda(e.a.id, { accion: "tienda." })).filas.every((f) => f.accion.startsWith("tienda."))).toBe(true);
  });
});
