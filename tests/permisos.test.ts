import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bandasVisibles } from "@/nucleo/acceso/bandas";
import { resolverAcceso } from "@/nucleo/acceso/resolver";
import { verificarCredenciales } from "@/nucleo/auth/credenciales";
import { prisma } from "@/nucleo/db/cliente";
import { puede } from "@/nucleo/permisos/puede";
import { registrarPermisos, vaciarRegistroPermisos } from "@/nucleo/permisos/registro";
import { CONTRASENA, dueno, escenarioAcceso } from "./apoyo";

let e: Awaited<ReturnType<typeof escenarioAcceso>>;

beforeAll(async () => {
  e = await escenarioAcceso();
  vaciarRegistroPermisos();
  // Lo que declararía un módulo "prueba" al registrarse.
  registrarPermisos("prueba", [
    { clave: "prueba.contenido.editar", rolesPorDefecto: ["TITULAR", "EDITOR"] },
    { clave: "prueba.config.editar", rolesPorDefecto: ["TITULAR"] },
    { clave: "prueba.pasarela.conectar", rolesPorDefecto: ["TITULAR"], exclusivoTitular: true },
  ]);
});
afterAll(async () => {
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("registro de permisos", () => {
  it("exige formato modulo.recurso.accion y prefijo del propio módulo", () => {
    expect(() => registrarPermisos("x", [{ clave: "x.editar", rolesPorDefecto: [] }])).toThrow(/formato/);
    expect(() => registrarPermisos("x", [{ clave: "otro.a.b", rolesPorDefecto: [] }])).toThrow(/propios/);
  });

  it("no deja declarar dos veces el mismo permiso", () => {
    expect(() =>
      registrarPermisos("prueba", [{ clave: "prueba.config.editar", rolesPorDefecto: [] }]),
    ).toThrow(/dos veces/);
  });

  it("un permiso exclusivo del titular no puede darse a otros roles", () => {
    expect(() =>
      registrarPermisos("y", [
        { clave: "y.pasarela.conectar", rolesPorDefecto: ["TITULAR", "COMERCIAL"], exclusivoTitular: true },
      ]),
    ).toThrow(/exclusivoTitular/);
  });
});

describe("prueba 3: mismo usuario, dos bandas, dos roles", () => {
  it("el rol sale de la membresía de cada banda", async () => {
    expect((await resolverAcceso(e.multi.id, e.a.id))?.rol).toBe("TITULAR");
    expect((await resolverAcceso(e.multi.id, e.b.id))?.rol).toBe("EDITOR");
  });

  it("puede() responde distinto en cada banda", async () => {
    expect(await puede(e.multi.id, e.a.id, "prueba.config.editar")).toBe(true);
    expect(await puede(e.multi.id, e.b.id, "prueba.config.editar")).toBe(false);
    // lo que ambos roles tienen, lo tiene en las dos
    expect(await puede(e.multi.id, e.a.id, "prueba.contenido.editar")).toBe(true);
    expect(await puede(e.multi.id, e.b.id, "prueba.contenido.editar")).toBe(true);
  });

  it("el titular tiene el permiso de pasarela; el editor no", async () => {
    expect(await puede(e.multi.id, e.a.id, "prueba.pasarela.conectar")).toBe(true);
    expect(await puede(e.editorA.id, e.a.id, "prueba.pasarela.conectar")).toBe(false);
  });
});

describe("prueba 2 (núcleo): sin membresía no hay acceso", () => {
  it("resolverAcceso devuelve null y puede() da false en todo", async () => {
    expect(await resolverAcceso(e.ajeno.id, e.a.id)).toBeNull();
    expect(await puede(e.ajeno.id, e.a.id, "prueba.contenido.editar")).toBe(false);
  });

  it("un permiso no declarado nunca se concede", async () => {
    expect(await puede(e.multi.id, e.a.id, "prueba.nada.hacer")).toBe(false);
  });
});

describe("prueba 6: staff de Deoco", () => {
  it("entra a cualquier banda sin membresía", async () => {
    const acceso = await resolverAcceso(e.staff.id, e.a.id);
    expect(acceso).toMatchObject({ esStaff: true, rol: null });
  });

  it("pasa todos los permisos menos los de pasarela de cobro", async () => {
    for (const t of [e.a.id, e.b.id]) {
      expect(await puede(e.staff.id, t, "prueba.contenido.editar")).toBe(true);
      expect(await puede(e.staff.id, t, "prueba.config.editar")).toBe(true);
      expect(await puede(e.staff.id, t, "prueba.pasarela.conectar")).toBe(false);
    }
  });

  it("un staff que es titular de una banda sí tiene su pasarela (por el rol, no por staff)", async () => {
    await dueno.membresia.create({ data: { usuarioId: e.staff.id, tenantId: e.b.id, rol: "TITULAR" } });
    expect(await puede(e.staff.id, e.b.id, "prueba.pasarela.conectar")).toBe(true);
    expect(await puede(e.staff.id, e.a.id, "prueba.pasarela.conectar")).toBe(false);
    await dueno.membresia.deleteMany({ where: { usuarioId: e.staff.id } });
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

  it("las bandas archivadas no aparecen", async () => {
    await dueno.tenant.update({ where: { id: e.a.id }, data: { estado: "ARCHIVADO" } });
    expect((await bandasVisibles(e.multi.id)).map((b) => b.slug)).toEqual(["banda-b"]);
    await dueno.tenant.update({ where: { id: e.a.id }, data: { estado: "ACTIVO" } });
  });
});
