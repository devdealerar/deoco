import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bandasVisibles } from "@/nucleo/acceso/bandas";
import { resolverAcceso } from "@/nucleo/acceso/resolver";
import { verificarCredenciales } from "@/nucleo/auth/credenciales";
import { prisma } from "@/nucleo/db/cliente";
import { puede } from "@/nucleo/permisos/puede";
import { prenderModulo } from "@/nucleo/modulos/encendido";
import { CONTRASENA, dueno, escenarioAcceso } from "./apoyo";

let e: Awaited<ReturnType<typeof escenarioAcceso>>;

beforeAll(async () => {
  e = await escenarioAcceso();
  // Permisos del módulo modulos/prueba: contenido.ver (TITULAR, EDITOR) y
  // pasarela.conectar (exclusivo del titular). Prendido en las dos bandas.
  await prenderModulo(e.staff.id, e.a.id, "prueba");
  await prenderModulo(e.staff.id, e.b.id, "prueba");
});
afterAll(async () => {
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("prueba 3: mismo usuario, dos bandas, dos roles", () => {
  it("el rol sale de la membresía de cada banda", async () => {
    expect((await resolverAcceso(e.multi.id, e.a.id))?.rol).toBe("TITULAR");
    expect((await resolverAcceso(e.multi.id, e.b.id))?.rol).toBe("EDITOR");
  });

  it("puede() responde distinto en cada banda", async () => {
    expect(await puede(e.multi.id, e.a.id, "prueba.pasarela.conectar")).toBe(true);
    expect(await puede(e.multi.id, e.b.id, "prueba.pasarela.conectar")).toBe(false);
    // lo que ambos roles tienen, lo tiene en las dos
    expect(await puede(e.multi.id, e.a.id, "prueba.contenido.ver")).toBe(true);
    expect(await puede(e.multi.id, e.b.id, "prueba.contenido.ver")).toBe(true);
  });

  it("el titular tiene el permiso de pasarela; el editor no", async () => {
    expect(await puede(e.multi.id, e.a.id, "prueba.pasarela.conectar")).toBe(true);
    expect(await puede(e.editorA.id, e.a.id, "prueba.pasarela.conectar")).toBe(false);
  });
});

describe("prueba 2 (núcleo): sin membresía no hay acceso", () => {
  it("resolverAcceso devuelve null y puede() da false en todo", async () => {
    expect(await resolverAcceso(e.ajeno.id, e.a.id)).toBeNull();
    expect(await puede(e.ajeno.id, e.a.id, "prueba.contenido.ver")).toBe(false);
  });

  it("un permiso no declarado nunca se concede", async () => {
    expect(await puede(e.multi.id, e.a.id, "prueba.nada.hacer")).toBe(false);
  });
});

describe("prueba 6: staff de Deoco (D3: suplantación segura)", () => {
  it("sin sesión de soporte no tiene ningún permiso en una banda", async () => {
    await dueno.sesionSoporte.deleteMany();
    const acceso = await resolverAcceso(e.staff.id, e.a.id);
    expect(acceso).toMatchObject({ esStaff: true, rol: null, soporte: null });
    expect(await puede(e.staff.id, e.a.id, "prueba.contenido.ver")).toBe(false);
  });

  it("con sesión de soporte (motivo, vence sola): los permisos de gestor, nunca la pasarela de cobro; solo en esa banda", async () => {
    const { iniciarSoporte, terminarSoporte } = await import("@/nucleo/acceso/soporte");
    await expect(iniciarSoporte(e.staff.id, e.a.id, "corto", 30)).rejects.toThrow(/motivo/);
    await expect(iniciarSoporte(e.staff.id, e.a.id, "Revisar por qué no se ve la tienda", 240)).rejects.toThrow(/15, 30 o 60/);
    const s = await iniciarSoporte(e.staff.id, e.a.id, "Revisar por qué no se ve la tienda", 30);
    expect(await puede(e.staff.id, e.a.id, "prueba.contenido.ver")).toBe(true);
    expect(await puede(e.staff.id, e.a.id, "prueba.pasarela.conectar")).toBe(false);
    expect(await puede(e.staff.id, e.b.id, "prueba.contenido.ver")).toBe(false); // la sesión es de A
    // Queda en la actividad de la banda, con el motivo; la fila no se puede borrar ni cambiar.
    expect(await dueno.auditoria.findFirstOrThrow({ where: { tenantId: e.a.id, accion: "soporte.entrada" } })).toMatchObject({ usuarioId: e.staff.id, detalle: expect.objectContaining({ motivo: "Revisar por qué no se ve la tienda" }) });
    await expect(dueno.sesionSoporte.update({ where: { id: s.id }, data: { motivo: "otra cosa distinta" } })).rejects.toThrow(/inmutable/);
    await expect(dueno.sesionSoporte.update({ where: { id: s.id }, data: { venceEn: new Date(Date.now() + 86_400_000) } })).rejects.toThrow(/inmutable/);
    // Vence sola.
    const { sesionDeSoporte } = await import("@/nucleo/acceso/soporte");
    expect(await sesionDeSoporte(e.staff.id, e.a.id, new Date(Date.now() + 31 * 60_000))).toBeNull();
    // Y se termina antes.
    await terminarSoporte(e.staff.id, e.a.id);
    expect(await puede(e.staff.id, e.a.id, "prueba.contenido.ver")).toBe(false);
  });

  it("un staff que es titular de una banda sí tiene su pasarela (por el rol, no por staff)", async () => {
    const titularB = await dueno.membresia.findFirstOrThrow({ where: { tenantId: e.b.id, rol: "TITULAR" } });
    await dueno.$transaction([
      dueno.membresia.update({ where: { id: titularB.id }, data: { rol: "GESTOR" } }),
      dueno.membresia.create({ data: { usuarioId: e.staff.id, tenantId: e.b.id, rol: "TITULAR" } }),
    ]);
    expect(await puede(e.staff.id, e.b.id, "prueba.pasarela.conectar")).toBe(true);
    expect(await puede(e.staff.id, e.a.id, "prueba.pasarela.conectar")).toBe(false);
    // Y el gestor (el titular de antes) no la tiene: es exclusiva del titular.
    expect(await puede(titularB.usuarioId, e.b.id, "prueba.pasarela.conectar")).toBe(false);
    await dueno.$transaction([
      dueno.membresia.deleteMany({ where: { usuarioId: e.staff.id } }),
      dueno.membresia.update({ where: { id: titularB.id }, data: { rol: "TITULAR" } }),
    ]);
  });
});

describe("credenciales", () => {
  it("email + contraseña correctos → id; incorrectos o inexistentes → null", async () => {
    expect(await verificarCredenciales("MULTI@x.com ", CONTRASENA)).toEqual({ id: e.multi.id });
    expect(await verificarCredenciales("multi@x.com", "otra")).toBeNull();
    expect(await verificarCredenciales("nadie@x.com", CONTRASENA)).toBeNull();
  });

  it("la contraseña se guarda con argon2id, nunca en claro", async () => {
    const u = await dueno.usuario.findUniqueOrThrow({ where: { id: e.multi.id } });
    expect(u.hashContrasena).toMatch(/^\$argon2id\$/);
  });
});

describe("selector de bandas", () => {
  it("cada usuario ve solo las bandas donde tiene membresía, con su rol", async () => {
    const multi = await bandasVisibles(e.multi.id);
    expect(multi.map((b) => [b.slug, b.rol, b.accesoStaff])).toEqual([
      ["banda-a", "TITULAR", false],
      ["banda-b", "EDITOR", false],
    ]);
    expect((await bandasVisibles(e.ajeno.id)).map((b) => b.slug)).toEqual(["banda-b"]);
  });

  it("el staff ve todas, marcadas como acceso de staff", async () => {
    const staff = await bandasVisibles(e.staff.id);
    expect(staff.map((b) => [b.slug, b.accesoStaff])).toEqual([
      ["banda-a", true],
      ["banda-b", true],
    ]);
  });

  it("una banda archivada solo la ve su titular (para llevarse sus dominios); otros roles y el staff, no", async () => {
    await dueno.tenant.update({ where: { id: e.a.id }, data: { estado: "ARCHIVADO" } });
    try {
      // multi: TITULAR en A (archivada), EDITOR en B.
      expect((await bandasVisibles(e.multi.id)).map((b) => [b.slug, b.estado])).toEqual([
        ["banda-a", "ARCHIVADO"],
        ["banda-b", "ACTIVO"],
      ]);
      expect((await bandasVisibles(e.staff.id)).map((b) => b.slug)).toEqual(["banda-b"]);
    } finally {
      await dueno.tenant.update({ where: { id: e.a.id }, data: { estado: "ACTIVO" } });
    }
  });
});
