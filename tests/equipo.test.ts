import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cambiarRolEnEquipo, dejarLaBanda, miembrosDeBanda, pasarTitularidad, quitarDelEquipo } from "@/nucleo/acceso/equipo";
import { resolverAcceso } from "@/nucleo/acceso/resolver";
import { prisma } from "@/nucleo/db/cliente";
import { conTenant } from "@/nucleo/db/con-tenant";
import { dueno, escenarioAcceso } from "./apoyo";

// 3.2 núcleo d6: el titular se va → la titularidad pasa a otra persona, nunca sin titular; un
// usuario revocado cae en el siguiente movimiento; Deoco no arbitra entre integrantes; la banda
// revoca el acceso desde su panel.
let e: Awaited<ReturnType<typeof escenarioAcceso>>;
const membresia = (usuarioId: string, tenantId = e.a.id) => dueno.membresia.findUniqueOrThrow({ where: { usuarioId_tenantId: { usuarioId, tenantId } } });

beforeEach(async () => {
  e = await escenarioAcceso();
  // La banda A queda con su titular (multi) y una editora.
  await dueno.membresia.deleteMany({ where: { tenantId: e.a.id, usuario: { email: "a@x.com" } } });
});
afterAll(async () => {
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("un solo titular, registrado, y nunca ninguno (lo impone la base)", () => {
  it("la base rechaza borrar o bajar al último titular, por cualquier camino", async () => {
    const m = await membresia(e.multi.id);
    await expect(conTenant(e.a.id, (tx) => tx.membresia.delete({ where: { id: m.id } }))).rejects.toThrow(/banda-sin-titular/);
    await expect(dueno.membresia.update({ where: { id: m.id }, data: { rol: "EDITOR" } })).rejects.toThrow(/banda-sin-titular/);
    expect((await membresia(e.multi.id)).rol).toBe("TITULAR");
  });

  it("la última persona titular no puede dejar la banda; primero pasa la titularidad", async () => {
    await expect(dejarLaBanda(e.multi.id, e.a.id)).rejects.toThrow("La banda no puede quedar sin titular");
    await pasarTitularidad(e.multi.id, e.a.id, (await membresia(e.editorA.id)).id);
    expect((await membresia(e.editorA.id)).rol).toBe("TITULAR");
    expect((await membresia(e.multi.id)).rol).toBe("GESTOR");
    await dejarLaBanda(e.multi.id, e.a.id);
    expect(await dueno.membresia.count({ where: { tenantId: e.a.id, usuarioId: e.multi.id } })).toBe(0);
    // Todo queda en la actividad de la banda.
    const acciones = (await dueno.auditoria.findMany({ where: { tenantId: e.a.id, accion: { startsWith: "membresia." } } })).map((a) => a.accion);
    expect(acciones).toEqual(expect.arrayContaining(["membresia.titularidad_pasada", "membresia.dejada"]));
  });

  it("la base no deja dos titulares en una banda, ni un momento", async () => {
    await expect(dueno.membresia.update({ where: { id: (await membresia(e.editorA.id)).id }, data: { rol: "TITULAR" } })).rejects.toThrow(/membresia_un_titular/);
    await expect(cambiarRolEnEquipo(e.multi.id, e.a.id, (await membresia(e.editorA.id)).id, "TITULAR")).rejects.toThrow("Hay un solo titular por banda");
  });

  it("pasar la titularidad: la otra persona queda titular y quien la pasó, gestor", async () => {
    await pasarTitularidad(e.multi.id, e.a.id, (await membresia(e.editorA.id)).id);
    expect((await membresia(e.editorA.id)).rol).toBe("TITULAR");
    expect((await membresia(e.multi.id)).rol).toBe("GESTOR");
    // El gestor ya no pasa la titularidad ni maneja el equipo.
    await expect(pasarTitularidad(e.multi.id, e.a.id, (await membresia(e.editorA.id)).id)).rejects.toThrow("Solo una persona titular");
  });
});

describe("la banda revoca el acceso desde su panel", () => {
  it("el titular saca a alguien: su sesión abierta deja de entrar en el siguiente pedido", async () => {
    expect((await resolverAcceso(e.editorA.id, e.a.id))?.rol).toBe("EDITOR");
    await quitarDelEquipo(e.multi.id, e.a.id, (await membresia(e.editorA.id)).id);
    expect(await resolverAcceso(e.editorA.id, e.a.id)).toBeNull();
  });

  it("cambiar el rol vale en el siguiente pedido", async () => {
    await cambiarRolEnEquipo(e.multi.id, e.a.id, (await membresia(e.editorA.id)).id, "LECTURA");
    expect((await resolverAcceso(e.editorA.id, e.a.id))?.rol).toBe("LECTURA");
    await expect(cambiarRolEnEquipo(e.multi.id, e.a.id, (await membresia(e.editorA.id)).id, "NO_EXISTE")).rejects.toThrow("Elegí un rol.");
  });

  it("el titular registrado conserva el control: no se baja a sí mismo sin pasar la titularidad", async () => {
    await expect(cambiarRolEnEquipo(e.multi.id, e.a.id, (await membresia(e.multi.id)).id, "EDITOR")).rejects.toThrow("pasale la titularidad");
    expect((await membresia(e.multi.id)).rol).toBe("TITULAR");
  });

  it("la lista del equipo es de la banda del pedido, con nombre y email", async () => {
    const a = await miembrosDeBanda(e.a.id);
    expect(a.map((m) => [m.email, m.rol])).toEqual([["multi@x.com", "TITULAR"], ["editor-a@x.com", "EDITOR"]]);
    expect((await miembrosDeBanda(e.b.id)).some((m) => m.email === "editor-a@x.com")).toBe(false);
    // Una membresía de otra banda no se toca desde esta.
    await expect(quitarDelEquipo(e.multi.id, e.a.id, (await membresia(e.ajeno.id, e.b.id)).id)).rejects.toThrow("ya no es parte");
  });
});

describe("GESTOR", () => {
  it("puede lo que el titular en los módulos, menos lo exclusivo del titular (la pasarela de cobro)", async () => {
    const { puede } = await import("@/nucleo/permisos/puede");
    await dueno.membresia.update({ where: { id: (await membresia(e.editorA.id)).id }, data: { rol: "GESTOR" } });
    await dueno.moduloTenant.createMany({ data: [{ tenantId: e.a.id, moduloId: "tienda" }], skipDuplicates: true });
    expect(await puede(e.editorA.id, e.a.id, "tienda.producto.editar")).toBe(true);
    expect(await puede(e.editorA.id, e.a.id, "tienda.pasarela.conectar")).toBe(false);
  });
});
