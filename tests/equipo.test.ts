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
  // La banda A queda con una sola persona titular (multi) y una editora.
  await dueno.membresia.deleteMany({ where: { tenantId: e.a.id, usuario: { email: "a@x.com" } } });
});
afterAll(async () => {
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("nunca queda una banda sin titular (lo impone la base)", () => {
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
    expect((await membresia(e.multi.id)).rol).toBe("EDITOR");
    await dejarLaBanda(e.multi.id, e.a.id);
    expect(await dueno.membresia.count({ where: { tenantId: e.a.id, usuarioId: e.multi.id } })).toBe(0);
    // Todo queda en la actividad de la banda.
    const acciones = (await dueno.auditoria.findMany({ where: { tenantId: e.a.id, accion: { startsWith: "membresia." } } })).map((a) => a.accion);
    expect(acciones).toEqual(expect.arrayContaining(["membresia.titularidad_pasada", "membresia.dejada"]));
  });

  it("dos titulares que se van a la vez: uno de los dos queda", async () => {
    await dueno.membresia.update({ where: { id: (await membresia(e.editorA.id)).id }, data: { rol: "TITULAR" } });
    const r = await Promise.allSettled([dejarLaBanda(e.multi.id, e.a.id), dejarLaBanda(e.editorA.id, e.a.id)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await dueno.membresia.count({ where: { tenantId: e.a.id, rol: "TITULAR" } })).toBe(1);
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

  it("Deoco no arbitra: una persona titular no saca ni baja a otra", async () => {
    await dueno.membresia.update({ where: { id: (await membresia(e.editorA.id)).id }, data: { rol: "TITULAR" } });
    const otra = (await membresia(e.editorA.id)).id;
    await expect(quitarDelEquipo(e.multi.id, e.a.id, otra)).rejects.toThrow(/otra persona titular/);
    await expect(cambiarRolEnEquipo(e.multi.id, e.a.id, otra, "EDITOR")).rejects.toThrow(/otra persona titular/);
    // Pero sí puede bajar su propio rol, porque queda otra.
    await cambiarRolEnEquipo(e.multi.id, e.a.id, (await membresia(e.multi.id)).id, "EDITOR");
    expect((await membresia(e.multi.id)).rol).toBe("EDITOR");
  });

  it("la lista del equipo es de la banda del pedido, con nombre y email", async () => {
    const a = await miembrosDeBanda(e.a.id);
    expect(a.map((m) => [m.email, m.rol])).toEqual([["multi@x.com", "TITULAR"], ["editor-a@x.com", "EDITOR"]]);
    expect((await miembrosDeBanda(e.b.id)).some((m) => m.email === "editor-a@x.com")).toBe(false);
    // Una membresía de otra banda no se toca desde esta.
    await expect(quitarDelEquipo(e.multi.id, e.a.id, (await membresia(e.ajeno.id, e.b.id)).id)).rejects.toThrow("ya no es parte");
  });
});
