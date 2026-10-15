import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  agregarDominio,
  cambiarEstado,
  cambiarRol,
  invitar,
  marcarPrincipal,
  quitarMiembro,
} from "@/app/admin/_servidor/bandas";
import { dbAdmin } from "@/app/admin/_servidor/db";
import { reprocesar } from "@/app/admin/_servidor/eventos";
import { apagar, prender } from "@/app/admin/_servidor/modulos";
import { cambiarClave } from "@/nucleo/auth/clave";
import { verificarCredenciales } from "@/nucleo/auth/credenciales";
import { prisma } from "@/nucleo/db/cliente";
import { esperarEventos } from "@/nucleo/eventos/bus";
import type { Modulo } from "@/nucleo/modulos/contrato";
import { crearRegistro } from "@/nucleo/modulos/registro";
import { CONTRASENA, dueno, escenarioAcceso } from "./apoyo";
import { CloudflareFalso } from "./cloudflare-falso";

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
const cf = new CloudflareFalso();
const acciones = async (tenantId?: string) =>
  (await dueno.auditoria.findMany({ where: tenantId ? { tenantId } : {}, orderBy: { fecha: "asc" } })).map((a) => a.accion);

beforeAll(async () => {
  e = await escenarioAcceso();
  (await cf.iniciar()).usar();
});
beforeEach(async () => {
  await dueno.auditoria.deleteMany();
  await dueno.moduloTenant.deleteMany();
  await dueno.tenant.updateMany({ data: { estado: "ACTIVO" } });
});
afterAll(async () => {
  await cf.cerrar();
  await prisma.$disconnect();
  await dbAdmin().$disconnect();
  await dueno.$disconnect();
});

describe("prueba 3: módulos desde el back office", () => {
  const mod = (id: string, extra: Partial<Modulo> = {}): Modulo => ({ id, nombre: id, permisos: [], ...extra });
  const reg = crearRegistro([mod("base"), mod("dependiente", { dependencias: ["base"] })]);

  it("prender sin la dependencia falla con el mensaje de siempre y no deja auditoría", async () => {
    await expect(prender(e.staff.id, e.a.id, "dependiente", reg)).rejects.toThrow(
      'No se puede prender "dependiente": necesita "base", que no está prendido para esta banda.',
    );
    expect(await acciones()).toEqual([]);
  });

  it("prender y apagar dejan su auditoría; apagar una dependencia en uso falla", async () => {
    await prender(e.staff.id, e.a.id, "base", reg);
    await prender(e.staff.id, e.a.id, "dependiente", reg);
    await expect(apagar(e.staff.id, e.a.id, "base", reg)).rejects.toThrow(/lo usa "dependiente"/);
    await apagar(e.staff.id, e.a.id, "dependiente", reg);
    expect(await acciones(e.a.id)).toEqual(["modulo.prendido", "modulo.prendido", "modulo.apagado"]);
  });
});

describe("estado", () => {
  it("ARCHIVADO exige confirmación; con ella cambia y queda registrado", async () => {
    await expect(cambiarEstado(e.staff.id, e.a.id, "ARCHIVADO", false)).rejects.toThrow(/confirmá/);
    expect((await dueno.tenant.findUniqueOrThrow({ where: { id: e.a.id } })).estado).toBe("ACTIVO");
    await cambiarEstado(e.staff.id, e.a.id, "ARCHIVADO", true);
    await cambiarEstado(e.staff.id, e.a.id, "ACTIVO", false);
    const filas = await dueno.auditoria.findMany({ orderBy: { fecha: "asc" } });
    expect(filas.map((f) => f.detalle)).toEqual([
      { de: "ACTIVO", a: "ARCHIVADO" },
      { de: "ARCHIVADO", a: "ACTIVO" },
    ]);
  });

  it("MOROSO y SUSPENDIDO no piden confirmación; un estado inválido se rechaza", async () => {
    await cambiarEstado(e.staff.id, e.a.id, "SUSPENDIDO", false);
    expect((await dueno.tenant.findUniqueOrThrow({ where: { id: e.a.id } })).estado).toBe("SUSPENDIDO");
    await expect(cambiarEstado(e.staff.id, e.a.id, "BORRADO", true)).rejects.toThrow(/Elegí un estado/);
  });
});

describe("dominios", () => {
  it("registra un dominio propio sin verificar; sin verificar no puede ser principal", async () => {
    await agregarDominio(e.staff.id, e.a.id, "https://LosSatelites.com.ar/");
    const d = await dueno.dominio.findFirstOrThrow({ where: { dominio: "lossatelites.com.ar" } });
    expect(d).toMatchObject({ tenantId: e.a.id, esPrincipal: false, verificado: false });
    await expect(marcarPrincipal(e.staff.id, e.a.id, d.id)).rejects.toThrow(/todavía no está verificado/);
    await dueno.dominio.update({ where: { id: d.id }, data: { verificado: true } });
    cf.activar("lossatelites.com.ar");
    await marcarPrincipal(e.staff.id, e.a.id, d.id);
    const principales = await dueno.dominio.findMany({ where: { tenantId: e.a.id, esPrincipal: true } });
    expect(principales.map((p) => p.dominio)).toEqual(["lossatelites.com.ar"]);
    expect(await acciones(e.a.id)).toEqual(["dominio.agregado", "dominio.principal_marcado"]);
  });

  it.each([
    ["no es un dominio", /no es un dominio válido/],
    ["otra.lvh.me", /los asigna la plataforma/],
    ["banda-a.deocoartist.com", /ya está registrado en esta banda/],
  ])("rechaza %s", async (dominio, error) => {
    await expect(agregarDominio(e.staff.id, e.a.id, dominio)).rejects.toThrow(error);
  });

  it("no marca principal un dominio de otra banda", async () => {
    const deB = await dueno.dominio.findFirstOrThrow({ where: { tenantId: e.b.id } });
    await expect(marcarPrincipal(e.staff.id, e.a.id, deB.id)).rejects.toThrow(/no es de esta banda/);
  });
});

describe("miembros", () => {
  it("invitar a alguien nuevo: usuario con clave temporal, membresía y auditoría", async () => {
    const r = await invitar(e.staff.id, e.b.id, { email: "Prensa@Nueva.com", nombre: "Prensa", rol: "EDITOR" });
    expect(r.claveTemporal).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    const u = await dueno.usuario.findUniqueOrThrow({ where: { email: "prensa@nueva.com" } });
    expect(u.claveTemporal).toBe(true);
    expect(await dueno.membresia.findFirst({ where: { usuarioId: u.id, tenantId: e.b.id, rol: "EDITOR" } })).not.toBeNull();
    expect(await acciones()).toEqual(["usuario.creado", "membresia.invitada"]);
    await expect(invitar(e.staff.id, e.b.id, { email: "prensa@nueva.com", nombre: "", rol: "LECTURA" })).rejects.toThrow(/ya es miembro/);
  });

  it("prueba 8: no se puede quitar ni degradar al último titular", async () => {
    // La banda B tiene un único titular (b@x.com).
    expect(await dueno.membresia.count({ where: { tenantId: e.b.id, rol: "TITULAR" } })).toBe(1);
    const titularB = await dueno.membresia.findFirstOrThrow({ where: { tenantId: e.b.id, rol: "TITULAR" } });
    await expect(quitarMiembro(e.staff.id, e.b.id, titularB.id, true)).rejects.toThrow("La banda no puede quedar sin titular");
    await expect(cambiarRol(e.staff.id, e.b.id, titularB.id, "EDITOR")).rejects.toThrow("La banda no puede quedar sin titular");
    expect((await dueno.membresia.findUniqueOrThrow({ where: { id: titularB.id } })).rol).toBe("TITULAR");
    expect(await acciones()).toEqual([]);
  });

  it("con otro titular, sí: y cada cambio queda registrado", async () => {
    // La banda A tiene dos titulares (a@x.com y multi@x.com).
    const editorA = await dueno.membresia.findFirstOrThrow({ where: { tenantId: e.a.id, usuarioId: e.editorA.id } });
    await cambiarRol(e.staff.id, e.a.id, editorA.id, "TITULAR");
    const original = await dueno.membresia.findFirstOrThrow({ where: { tenantId: e.a.id, usuarioId: e.multi.id } });
    await quitarMiembro(e.staff.id, e.a.id, original.id, true);
    expect(await dueno.membresia.count({ where: { tenantId: e.a.id, rol: "TITULAR" } })).toBe(2); // a@x.com y editor-a
    expect(await acciones(e.a.id)).toEqual(["membresia.rol_cambiado", "membresia.quitada"]);
  });
});

describe("quitar un miembro pide confirmación", () => {
  it("sin confirmar no quita, y el mensaje nombra a quién", async () => {
    const lectura = await dueno.membresia.findFirstOrThrow({ where: { tenantId: e.b.id, usuarioId: e.ajeno.id } });
    await expect(quitarMiembro(e.staff.id, e.b.id, lectura.id, false)).rejects.toThrow(
      "Para quitar a ajeno@x.com de la banda, confirmalo: pierde el acceso a su panel.",
    );
    expect(await dueno.membresia.findUnique({ where: { id: lectura.id } })).not.toBeNull();
  });

  it("si es el propio usuario, el mensaje lo dice", async () => {
    const propia = await dueno.membresia.create({ data: { tenantId: e.b.id, usuarioId: e.staff.id, rol: "EDITOR" } });
    await expect(quitarMiembro(e.staff.id, e.b.id, propia.id, false)).rejects.toThrow(/Te estás quitando a vos mismo de esta banda/);
    await quitarMiembro(e.staff.id, e.b.id, propia.id, true);
    expect(await dueno.membresia.findUnique({ where: { id: propia.id } })).toBeNull();
  });
});

describe("prueba 9: reprocesar desde el back office", () => {
  it("vuelve a entregar el evento fallido y queda registrado", async () => {
    await dueno.moduloTenant.create({ data: { tenantId: e.b.id, moduloId: "prueba" } });
    const ev = await dueno.evento.create({
      data: {
        tenantId: e.b.id,
        nombre: "prueba.verificada",
        payload: {},
        estado: "FALLIDO",
        intentos: 1,
        fallos: [{ intento: 1, moduloId: "prueba", error: "se cayó", fecha: new Date().toISOString() }],
      },
    });
    expect(await reprocesar(e.staff.id, e.b.id, ev.id)).toBe("PROCESADO");
    await esperarEventos();
    expect(await dueno.evento.findUniqueOrThrow({ where: { id: ev.id } })).toMatchObject({ estado: "PROCESADO", intentos: 2 });
    const fila = await dueno.auditoria.findFirstOrThrow({ where: { accion: "evento.reprocesado" } });
    expect(fila).toMatchObject({ tenantId: e.b.id, usuarioId: e.staff.id, detalle: { eventoId: ev.id } });
    await expect(reprocesar(e.staff.id, e.b.id, ev.id)).rejects.toThrow(/no está fallido/);
  });
});

describe("cambio de clave", () => {
  it("valida la clave actual y la nueva; al cambiar deja de ser temporal", async () => {
    await dueno.usuario.update({ where: { id: e.ajeno.id }, data: { claveTemporal: true } });
    await expect(cambiarClave(e.ajeno.id, "mal", "clave-nueva-123", "clave-nueva-123")).rejects.toThrow("La clave actual no es correcta.");
    await expect(cambiarClave(e.ajeno.id, CONTRASENA, "corta", "corta")).rejects.toThrow(/al menos 10/);
    await expect(cambiarClave(e.ajeno.id, CONTRASENA, "clave-nueva-123", "otra-cosa-123")).rejects.toThrow(/no coinciden/);
    await expect(cambiarClave(e.ajeno.id, CONTRASENA, CONTRASENA, CONTRASENA)).rejects.toThrow(/distinta/);
    await cambiarClave(e.ajeno.id, CONTRASENA, "clave-nueva-123", "clave-nueva-123");
    expect((await dueno.usuario.findUniqueOrThrow({ where: { id: e.ajeno.id } })).claveTemporal).toBe(false);
    expect(await verificarCredenciales("ajeno@x.com", "clave-nueva-123")).not.toBeNull();
    expect(await verificarCredenciales("ajeno@x.com", CONTRASENA)).toBeNull();
  });
});
