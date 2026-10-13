import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Cliente con el rol dueño: SOLO para preparar datos de prueba (saltea RLS por ser dueño).
// La aplicación jamás usa este rol.
export const dueno = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_MIGRACIONES! }),
});

export async function limpiar() {
  await dueno.$executeRawUnsafe(
    `TRUNCATE "evento", "moduloTenant", "dominio", "membresia", "tenant", "usuario" CASCADE`,
  );
}

/** Dos bandas, cada una con su dominio, un usuario titular y un evento. */
export async function dosBandas() {
  await limpiar();
  const a = await dueno.tenant.create({ data: { nombre: "Banda A", slug: "banda-a" } });
  const b = await dueno.tenant.create({ data: { nombre: "Banda B", slug: "banda-b" } });
  const ua = await dueno.usuario.create({
    data: { email: "a@x.com", nombre: "A", hashContrasena: "x" },
  });
  const ub = await dueno.usuario.create({
    data: { email: "b@x.com", nombre: "B", hashContrasena: "x" },
  });
  for (const [t, u] of [[a, ua], [b, ub]] as const) {
    await dueno.membresia.create({ data: { tenantId: t.id, usuarioId: u.id, rol: "TITULAR" } });
    await dueno.dominio.create({
      data: { tenantId: t.id, dominio: `${t.slug}.deoco.com`, esPrincipal: true, verificado: true },
    });
    await dueno.evento.create({ data: { tenantId: t.id, nombre: "prueba.creada", payload: {} } });
  }
  return { a, b, ua, ub };
}

export const CONTRASENA = "clave-de-prueba";

/**
 * Escenario de acceso sobre dos bandas:
 * - multi: TITULAR en A, EDITOR en B
 * - ajeno: solo LECTURA en B
 * - editorA: EDITOR en A
 * - staff: esStaff, sin membresías
 */
export async function escenarioAcceso() {
  const { hashearContrasena } = await import("@/nucleo/auth/contrasena");
  const { a, b } = await dosBandas();
  const hashContrasena = await hashearContrasena(CONTRASENA);
  const crear = (email: string, esStaff = false) =>
    dueno.usuario.create({ data: { email, nombre: email, hashContrasena, esStaff } });
  const multi = await crear("multi@x.com");
  const ajeno = await crear("ajeno@x.com");
  const editorA = await crear("editor-a@x.com");
  const staff = await crear("staff@deoco.com", true);
  await dueno.membresia.createMany({
    data: [
      { usuarioId: multi.id, tenantId: a.id, rol: "TITULAR" },
      { usuarioId: multi.id, tenantId: b.id, rol: "EDITOR" },
      { usuarioId: ajeno.id, tenantId: b.id, rol: "LECTURA" },
      { usuarioId: editorA.id, tenantId: a.id, rol: "EDITOR" },
    ],
  });
  return { a, b, multi, ajeno, editorA, staff };
}
