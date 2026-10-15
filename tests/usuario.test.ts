import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearCuentaExterna } from "@/nucleo/acceso/externas";
import { resolverAcceso } from "@/nucleo/acceso/resolver";
import { conStaffComo } from "@/nucleo/acceso/staff";
import { usuarioPropio } from "@/nucleo/acceso/usuario";
import { cambiarClave } from "@/nucleo/auth/clave";
import { verificarCredenciales } from "@/nucleo/auth/credenciales";
import { hashearContrasena } from "@/nucleo/auth/contrasena";
import { prisma } from "@/nucleo/db/cliente";
import { conTenant, type TxTenant } from "@/nucleo/db/con-tenant";
import { conUsuario } from "@/nucleo/db/con-usuario";
import { titularDeBanda } from "@/nucleo/personas";
import tienda from "../modulos/tienda";
import { CONTRASENA, dueno, escenarioAcceso } from "./apoyo";

// `usuario` con RLS: cada persona su fila (nombre y clave), el login por una función acotada,
// el staff por funciones acotadas, un módulo nada. `esStaff` no lo escribe la app, ni forzando.

let e: Awaited<ReturnType<typeof escenarioAcceso>>;

beforeAll(async () => {
  e = await escenarioAcceso();
});
afterAll(async () => {
  await prisma.$disconnect();
  await dueno.$disconnect();
});

/** Una sentencia en un savepoint: filas tocadas, o el tipo de error de la base. */
async function probar(tx: TxTenant, sql: string): Promise<number | string> {
  await tx.$executeRawUnsafe("SAVEPOINT prueba");
  try {
    const n = await tx.$executeRawUnsafe(sql);
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT prueba");
    return n;
  } catch (x) {
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT prueba");
    const m = (x as Error).message;
    return m.includes("permission denied") || m.includes("Solo el staff") ? "sin permiso" : m.includes("row-level security") ? "rls" : m.includes("clave temporal") ? "clave temporal" : `error: ${m}`;
  }
}

async function enOrden(tx: TxTenant, sentencias: string[]) {
  const r: (number | string)[] = [];
  for (const q of sentencias) r.push(await probar(tx, q));
  return r;
}

/** Corre y deshace: nada de lo que se intente queda escrito aunque la base lo deje. */
async function yDeshacer<T>(abrir: (fn: (tx: TxTenant) => Promise<void>) => Promise<unknown>, fn: (tx: TxTenant) => Promise<T>) {
  let r: T | undefined;
  await abrir(async (tx) => {
    r = await fn(tx);
    throw new Error("deshacer");
  }).catch((x) => {
    if (x.message !== "deshacer") throw x;
  });
  return r as T;
}

const intentosDeEscritura = (otro: string) => [
  `UPDATE usuario SET nombre = 'X'`,
  `UPDATE usuario SET "esStaff" = true`,
  `UPDATE usuario SET "hashContrasena" = 'x' WHERE id = '${otro}'`,
  `DELETE FROM usuario`,
  `INSERT INTO usuario (id, email, nombre, "hashContrasena", "esStaff") VALUES (gen_random_uuid(), 'nuevo@x.com', 'N', 'x', true)`,
];

describe("un módulo no lee ni escribe usuario", () => {
  it("desde una transacción de banda (conTenant): no ve a nadie y no escribe nada", async () => {
    const r = await yDeshacer(
      (fn) => conTenant(e.a.id, fn),
      async (tx) => ({
        ve: await tx.usuario.count(),
        miembros: await tx.membresia.count(),
        conPersona: Number((await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM membresia m JOIN usuario u ON u.id = m."usuarioId"`)[0].n),
        escrituras: await enOrden(tx, intentosDeEscritura(e.multi.id)),
      }),
    );
    // Las membresías de la banda se ven; la persona detrás, no.
    // Columnas que la persona sí edita de sí misma: 0 filas (RLS); el resto, sin permiso.
    expect(r).toEqual({ ve: 0, miembros: 3, conPersona: 0, escrituras: [0, "sin permiso", 0, "sin permiso", "sin permiso"] });
  });

  it("desde una transacción de staff (lo que corre en rutasAdmin de un módulo), tampoco", async () => {
    const r = await yDeshacer(
      (fn) => conStaffComo(e.staff.id, "prueba.usuario", fn),
      async (tx) => ({ ve: await tx.usuario.count(), escrituras: await enOrden(tx, intentosDeEscritura(e.multi.id)) }),
    );
    expect(r).toEqual({ ve: 0, escrituras: [0, "sin permiso", 0, "sin permiso", "sin permiso"] });
  });

  it("lo único de una persona que un módulo pide es el titular de SU banda, por el núcleo", async () => {
    // A tiene dos titulares: uno de los dos, nunca alguien de otra banda.
    expect([{ nombre: "A", email: "a@x.com" }, { nombre: "multi@x.com", email: "multi@x.com" }]).toContainEqual(await conTenant(e.a.id, titularDeBanda));
    expect(await conTenant(e.b.id, titularDeBanda)).toEqual({ nombre: "B", email: "b@x.com" });
    // Sin banda fijada, nadie.
    expect(await prisma.$transaction((tx) => titularDeBanda(tx))).toBeNull();
  });
});

describe("cada persona, su fila", () => {
  it("lee la suya y ninguna otra", async () => {
    const r = await conUsuario(e.multi.id, async (tx) => ({
      todas: await tx.usuario.count(),
      suya: await tx.usuario.findUnique({ where: { id: e.multi.id }, select: { email: true } }),
      otra: await tx.usuario.findUnique({ where: { id: e.ajeno.id }, select: { email: true } }),
    }));
    expect(r).toEqual({ todas: 1, suya: { email: "multi@x.com" }, otra: null });
    expect(await usuarioPropio(e.staff.id)).toMatchObject({ email: "staff@deocoartist.com", esStaff: true, claveTemporal: false });
  });

  it("edita su nombre; no edita a otro", async () => {
    const r = await yDeshacer(
      (fn) => conUsuario(e.multi.id, fn),
      async (tx) => ({
        suyo: await probar(tx, `UPDATE usuario SET nombre = 'Multi' WHERE id = '${e.multi.id}'`),
        otro: await probar(tx, `UPDATE usuario SET nombre = 'X', "hashContrasena" = 'x' WHERE id = '${e.ajeno.id}'`),
        todos: await probar(tx, `UPDATE usuario SET nombre = 'X'`),
        borrarse: await probar(tx, `DELETE FROM usuario WHERE id = '${e.multi.id}'`),
        otroPorPrisma: (await tx.usuario.updateMany({ where: { id: e.ajeno.id }, data: { nombre: "X" } })).count,
      }),
    );
    expect(r).toEqual({ suyo: 1, otro: 0, todos: 1, borrarse: "sin permiso", otroPorPrisma: 0 });
    expect((await dueno.usuario.findUniqueOrThrow({ where: { id: e.ajeno.id } })).nombre).toBe("ajeno@x.com");
  });

  it("nadie se hace staff desde la app, ni forzando la consulta", async () => {
    const r = await yDeshacer(
      (fn) => conUsuario(e.multi.id, fn),
      async (tx) => ({
        directo: await probar(tx, `UPDATE usuario SET "esStaff" = true WHERE id = '${e.multi.id}'`),
        conOtraColumna: await probar(tx, `UPDATE usuario SET nombre = 'M', "esStaff" = true WHERE id = '${e.multi.id}'`),
        cambiandoElEmail: await probar(tx, `UPDATE usuario SET email = 'staff2@deocoartist.com' WHERE id = '${e.multi.id}'`),
        sacarleAlStaff: await probar(tx, `UPDATE usuario SET "esStaff" = false WHERE id = '${e.staff.id}'`),
        altaComoStaff: await probar(tx, `INSERT INTO usuario (id, email, nombre, "hashContrasena", "esStaff") VALUES (gen_random_uuid(), 'yo@x.com', 'Y', 'x', true)`),
        porPrisma: await tx.usuario
          .update({ where: { id: e.multi.id }, data: { esStaff: true }, select: { id: true } })
          .then(() => "pasó", (x: Error) => (x.message.includes("permission denied") ? "sin permiso" : x.message)),
      }),
    );
    expect(r).toEqual({
      directo: "sin permiso",
      conOtraColumna: "sin permiso",
      cambiandoElEmail: "sin permiso",
      sacarleAlStaff: "sin permiso",
      altaComoStaff: "sin permiso",
      porPrisma: "sin permiso",
    });
    // Ni con la variable de la persona puesta a mano en una transacción cualquiera.
    const forzado = await yDeshacer(
      (fn) => prisma.$transaction(fn),
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.usuario_id', ${e.multi.id}, true), set_config('app.staff', 'si', true)`;
        return probar(tx, `UPDATE usuario SET "esStaff" = true WHERE id = '${e.multi.id}'`);
      },
    );
    expect(forzado).toBe("sin permiso");
    expect((await dueno.usuario.findUniqueOrThrow({ where: { id: e.multi.id } })).esStaff).toBe(false);
  });

  it("la marca de clave temporal se saca solo cambiando la clave, y no se pone", async () => {
    await dueno.usuario.update({ where: { id: e.ajeno.id }, data: { claveTemporal: true } });
    const r = await yDeshacer(
      (fn) => conUsuario(e.ajeno.id, fn),
      async (tx) => ({
        sacarSinCambiar: await probar(tx, `UPDATE usuario SET "claveTemporal" = false WHERE id = '${e.ajeno.id}'`),
        sacarCambiando: await probar(tx, `UPDATE usuario SET "claveTemporal" = false, "hashContrasena" = 'otro' WHERE id = '${e.ajeno.id}'`),
      }),
    );
    expect(r).toEqual({ sacarSinCambiar: "clave temporal", sacarCambiando: 1 });
    const ponerla = await yDeshacer(
      (fn) => conUsuario(e.multi.id, fn),
      (tx) => probar(tx, `UPDATE usuario SET "claveTemporal" = true WHERE id = '${e.multi.id}'`),
    );
    expect(ponerla).toBe("clave temporal");
    await dueno.usuario.update({ where: { id: e.ajeno.id }, data: { claveTemporal: false } });
  });
});

describe("los cuatro caminos siguen andando", () => {
  it("login: por email, sin sesión (solo id y hash, por la función acotada)", async () => {
    expect(await verificarCredenciales(" Multi@X.com", CONTRASENA)).toEqual({ id: e.multi.id });
    expect(await verificarCredenciales("multi@x.com", "otra")).toBeNull();
    expect(await verificarCredenciales("nadie@x.com", CONTRASENA)).toBeNull();
    // La función no devuelve más que eso.
    const cols = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM usuario_para_ingresar('multi@x.com')`;
    expect(Object.keys(cols[0]).sort()).toEqual(["hash", "id"]);
  });

  it("rol por pedido: membresía y staff, leyendo solo la propia fila", async () => {
    expect(await resolverAcceso(e.multi.id, e.a.id)).toMatchObject({ rol: "TITULAR", esStaff: false });
    expect(await resolverAcceso(e.staff.id, e.a.id)).toMatchObject({ rol: null, esStaff: true });
    expect(await resolverAcceso(e.ajeno.id, e.a.id)).toBeNull();
  });

  it("alta con clave temporal (staff) → login con esa clave → cambio de clave", async () => {
    await dueno.cuentaExterna.deleteMany();
    await dueno.usuario.deleteMany({ where: { email: "nuevo@taller.com" } });
    const { claveTemporal } = await conStaffComo(e.staff.id, "prueba.alta", (tx) =>
      crearCuentaExterna(tx, tienda, { referencia: "ref-1", email: "Nuevo@Taller.com", nombre: "Nuevo", creadoPor: e.staff.id }),
    );
    expect(claveTemporal).toBeTruthy();
    const u = await dueno.usuario.findUniqueOrThrow({ where: { email: "nuevo@taller.com" } });
    expect(u).toMatchObject({ nombre: "Nuevo", claveTemporal: true, esStaff: false });

    expect(await verificarCredenciales("nuevo@taller.com", claveTemporal!)).toEqual({ id: u.id });
    await expect(cambiarClave(u.id, "mal", "clave-nueva-123", "clave-nueva-123")).rejects.toThrow("La clave actual no es correcta.");
    await cambiarClave(u.id, claveTemporal!, "clave-nueva-123", "clave-nueva-123");
    expect(await usuarioPropio(u.id)).toMatchObject({ claveTemporal: false });
    expect(await verificarCredenciales("nuevo@taller.com", "clave-nueva-123")).toEqual({ id: u.id });
    expect(await verificarCredenciales("nuevo@taller.com", claveTemporal!)).toBeNull();

    // Un email que ya existe no se duplica ni cambia de clave; uno del staff no entra.
    const otra = await conStaffComo(e.staff.id, "prueba.alta", async (tx) => {
      await tx.cuentaExterna.deleteMany({ where: { referencia: "ref-1" } });
      return crearCuentaExterna(tx, tienda, { referencia: "ref-2", email: "nuevo@taller.com", nombre: "", creadoPor: e.staff.id });
    });
    expect(otra.claveTemporal).toBeNull();
    await expect(
      conStaffComo(e.staff.id, "prueba.alta", (tx) =>
        crearCuentaExterna(tx, tienda, { referencia: "ref-3", email: "staff@deocoartist.com", nombre: "", creadoPor: e.staff.id }),
      ),
    ).rejects.toThrow(/staff de Deoco/);
  });

  it("las funciones del staff no andan fuera de conStaff", async () => {
    const hash = await hashearContrasena("x-x-x-x-x-x");
    const r = await yDeshacer(
      (fn) => conTenant(e.a.id, fn),
      async (tx) => ({
        alta: await probar(tx, `SELECT crear_usuario_temporal('colado@x.com', 'C', '${hash}')`),
        buscar: await probar(tx, `SELECT * FROM usuario_por_email_staff('multi@x.com')`),
        listar: await probar(tx, `SELECT * FROM cuentas_externas_de('tienda', 'ref-1')`),
      }),
    );
    expect(r).toEqual({ alta: "sin permiso", buscar: "sin permiso", listar: "sin permiso" });
  });
});

describe("en el código", () => {
  it("nadie lee `usuario` con el cliente de la app fuera de una transacción (RLS no devolvería nada)", () => {
    // Con RLS, `prisma.usuario.…` suelto no ve ninguna fila: falla en silencio (p. ej. /admin daba
    // 404 al staff). Se lee con conUsuario/usuarioPropio, o por las funciones acotadas.
    const archivos = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = path.join(dir, f);
        return statSync(p).isDirectory() ? (f === "generated" ? [] : archivos(p)) : /\.tsx?$/.test(f) ? [p] : [];
      });
    const usos = [...archivos("src"), ...archivos("modulos")].filter((f) => /\bprisma\.usuario\b/.test(readFileSync(f, "utf8")));
    expect(usos).toEqual([]);
  });
});
