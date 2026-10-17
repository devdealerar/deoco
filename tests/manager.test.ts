import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { esperarCorreos } from "@/nucleo/correo";
import { prisma } from "@/nucleo/db/cliente";
import { conTenant } from "@/nucleo/db/con-tenant";
import { miembrosDeBanda, quitarDelEquipo } from "@/nucleo/acceso/equipo";
import { cancelarInvitacion, invitacionesPara, invitar, responderInvitacion } from "@/nucleo/acceso/invitaciones";
import { crearCampania } from "../modulos/lanzamiento/campanias";
import { alertas, calendario, metricasDelMes, roster } from "../modulos/manager/roster";
import { dueno, escenarioAcceso } from "./apoyo";

// D7: panel del manager y plan Sello (3.2 manager d1 y d2) + invitaciones al equipo.

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
let managerId = "";
const MANAGER = "manager@sello.com";

async function sumarManager(tenantId: string, titularId: string) {
  const id = await invitar(titularId, tenantId, MANAGER, "GESTOR");
  await responderInvitacion(managerId, tenantId, id, true);
}

beforeAll(async () => {
  e = await escenarioAcceso();
  managerId = (await dueno.usuario.create({ data: { email: MANAGER, nombre: "Mara Manager", hashContrasena: "x" } })).id;
  await dueno.moduloTenant.createMany({ data: ["tienda", "ticketera", "fans", "lanzamiento"].flatMap((moduloId) => [e.a.id, e.b.id].map((tenantId) => ({ tenantId, moduloId }))), skipDuplicates: true });
});
beforeEach(async () => {
  await esperarCorreos();
  await dueno.invitacion.deleteMany();
  await dueno.membresia.deleteMany({ where: { usuarioId: managerId } });
  await dueno.tenant.updateMany({ data: { estado: "ACTIVO" } });
});
afterAll(async () => {
  await esperarCorreos();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("invitaciones", () => {
  it("el titular invita con un rol; la persona acepta con su cuenta de ese email", async () => {
    const id = await invitar(e.multi.id, e.a.id, "Manager@Sello.com", "GESTOR");
    expect((await invitacionesPara(managerId)).map((i) => [i.banda, i.rol])).toEqual([["Banda A", "GESTOR"]]);
    // Otra persona no la puede aceptar.
    await expect(responderInvitacion(e.editorA.id, e.a.id, id, true)).rejects.toThrow(/ya no está vigente/);
    await responderInvitacion(managerId, e.a.id, id, true);
    expect((await miembrosDeBanda(e.a.id)).find((m) => m.email === MANAGER)?.rol).toBe("GESTOR");
    expect(await invitacionesPara(managerId)).toEqual([]);
    expect(await dueno.auditoria.count({ where: { accion: "membresia.invitacion_aceptada", tenantId: e.a.id } })).toBe(1);
  });

  it("no se invita como titular ni a quien ya está; se cancela; vence", async () => {
    await expect(invitar(e.multi.id, e.a.id, MANAGER, "TITULAR")).rejects.toThrow(/un solo titular/);
    await expect(invitar(e.multi.id, e.a.id, "editor-a@x.com", "LECTURA")).rejects.toThrow(/ya es parte/);
    const id = await invitar(e.multi.id, e.a.id, MANAGER, "LECTURA");
    await cancelarInvitacion(e.multi.id, e.a.id, id);
    await expect(responderInvitacion(managerId, e.a.id, id, true)).rejects.toThrow(/ya no está vigente/);
    const otra = await invitar(e.multi.id, e.a.id, MANAGER, "LECTURA");
    await expect(responderInvitacion(managerId, e.a.id, otra, true, new Date(Date.now() + 15 * 86_400_000))).rejects.toThrow(/ya no está vigente/);
  });
});

describe("roster del manager", () => {
  it("son las bandas que lo invitaron; de cada una, solo números", async () => {
    expect(await roster(managerId)).toEqual([]);
    await sumarManager(e.a.id, e.multi.id);
    await sumarManager(e.b.id, (await dueno.membresia.findFirstOrThrow({ where: { tenantId: e.b.id, rol: "TITULAR" } })).usuarioId);
    expect((await roster(managerId)).map((b) => b.slug)).toEqual(["banda-a", "banda-b"]);
    // Fans de A: solo cuántos.
    await dueno.fansContacto.createMany({ data: [{ tenantId: e.a.id, email: "x@fan.com", origen: "formulario", newsletter: "confirmado" }, { tenantId: e.a.id, email: "y@fan.com", origen: "tienda" }] });
    const m = await metricasDelMes(e.a.id, new Date());
    expect(m).toMatchObject({ contactos: 2, suscriptos: 1 });
    expect(JSON.stringify(m)).not.toContain("@");
    await dueno.fansContacto.deleteMany();
  });

  it("calendario unificado con los lanzamientos de todas las bandas", async () => {
    await sumarManager(e.a.id, e.multi.id);
    await crearCampania(e.a.id, e.multi.id, { titulo: "Single de A", tipo: "single", fecha: new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10) });
    const fechas = await calendario(await roster(managerId));
    expect(fechas.some((f) => f.tipo === "lanzamiento" && f.titulo === "Single de A" && f.banda.slug === "banda-a")).toBe(true);
    await dueno.$executeRawUnsafe(`TRUNCATE "lanzamiento_campania" CASCADE`);
  });

  it("una banda que deja de pagar: solo esa se marca; el resto del roster sigue igual", async () => {
    await sumarManager(e.a.id, e.multi.id);
    const titularB = (await dueno.membresia.findFirstOrThrow({ where: { tenantId: e.b.id, rol: "TITULAR" } })).usuarioId;
    await sumarManager(e.b.id, titularB);
    await dueno.tenant.update({ where: { id: e.b.id }, data: { estado: "SUSPENDIDO" } });
    const [a, b] = await roster(managerId);
    expect(await alertas(b)).toContain("Está suspendida por la cuota: su sitio no se ve.");
    expect(await alertas(a)).not.toContain("Está suspendida por la cuota: su sitio no se ve.");
  });

  it("la banda lo saca: el acceso cesa ya y lo que hizo queda", async () => {
    await sumarManager(e.a.id, e.multi.id);
    const campaniaId = await crearCampania(e.a.id, managerId, { titulo: "Hecha por el manager", tipo: "single", fecha: "2027-03-01" });
    const m = await dueno.membresia.findFirstOrThrow({ where: { tenantId: e.a.id, usuarioId: managerId } });
    await quitarDelEquipo(e.multi.id, e.a.id, m.id);
    expect(await roster(managerId)).toEqual([]);
    expect(await conTenant(e.a.id, (tx) => tx.lanzamientoCampania.count({ where: { id: campaniaId } }))).toBe(1);
    await dueno.$executeRawUnsafe(`TRUNCATE "lanzamiento_campania" CASCADE`);
  });
});
