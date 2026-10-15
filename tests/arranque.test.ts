import { afterAll, describe, expect, it } from "vitest";
import { problemasDeBase, problemasDeEntorno, problemasDeVenta } from "@/nucleo/arranque";
import type { GestionCuenta } from "@/nucleo/modulos/contrato";
import { prisma } from "@/nucleo/db/cliente";

afterAll(async () => {
  await prisma.$disconnect();
});

const BIEN = {
  DATABASE_URL: "postgresql://deoco_app:x@db:5432/deoco",
  DATABASE_URL_ADMIN: "postgresql://deoco_admin:y@db:5432/deoco",
  DATABASE_URL_MIGRACIONES: "postgresql://deoco_owner:z@db:5432/deoco",
  AUTH_SECRET: "a".repeat(44),
  DEOCO_DOMINIO_RAIZ: "deocoartist.com",
};
const PROD = { generadoPara: "produccion" };

describe("verificación de arranque: entorno", () => {
  it("una configuración correcta no tiene problemas", () => {
    expect(problemasDeEntorno(BIEN, PROD)).toEqual([]);
    const cf = { DEOCO_CLOUDFLARE_TOKEN: "tok", DEOCO_CLOUDFLARE_ZONA: "zona", DEOCO_CLOUDFLARE_CUENTA: "cuenta", DEOCO_IP_PUBLICA: "203.0.113.10" };
    expect(problemasDeEntorno({ ...BIEN, ...cf }, PROD)).toEqual([]);
  });

  it.each([
    [{ DATABASE_URL: undefined }, "Falta la variable de entorno DATABASE_URL."],
    [{ DATABASE_URL_ADMIN: undefined }, "Falta la variable de entorno DATABASE_URL_ADMIN."],
    [{ AUTH_SECRET: undefined }, "Falta la variable de entorno AUTH_SECRET."],
    [{ DEOCO_DOMINIO_RAIZ: undefined }, "Falta la variable de entorno DEOCO_DOMINIO_RAIZ."],
    [{ AUTH_SECRET: "corto" }, /AUTH_SECRET es demasiado corto/],
    [{ DEOCO_DOMINIO_RAIZ: "https://deocoartist.com" }, /solo el dominio/],
    [{ DATABASE_URL_ADMIN: BIEN.DATABASE_URL }, /usan el mismo rol \(deoco_app\)/],
    [{ DATABASE_URL: BIEN.DATABASE_URL_MIGRACIONES }, /usa el rol dueño de las tablas \(deoco_owner\)/],
    [{ DEOCO_CLOUDFLARE_TOKEN: "tok" }, /las dos variables: DEOCO_CLOUDFLARE_TOKEN y DEOCO_CLOUDFLARE_ZONA/],
    [{ DEOCO_CLOUDFLARE_ZONA: "zona" }, /las dos variables: DEOCO_CLOUDFLARE_TOKEN y DEOCO_CLOUDFLARE_ZONA/],
    [{ DEOCO_CLOUDFLARE_TOKEN: "tok", DEOCO_CLOUDFLARE_ZONA: "zona", DEOCO_IP_PUBLICA: "203.0.113.10" }, /falta DEOCO_CLOUDFLARE_CUENTA/],
    [{ DEOCO_CLOUDFLARE_TOKEN: "tok", DEOCO_CLOUDFLARE_ZONA: "zona", DEOCO_CLOUDFLARE_CUENTA: "c" }, /falta DEOCO_IP_PUBLICA/],
    [{ DEOCO_CLOUDFLARE_TOKEN: "tok", DEOCO_CLOUDFLARE_ZONA: "zona", DEOCO_CLOUDFLARE_CUENTA: "c", DEOCO_IP_PUBLICA: "203.0.113.10", DEOCO_RESEND_TOKEN: "re" }, /falta DEOCO_CLOUDFLARE_KV/],
    [{ DEOCO_REGISTRADOR: "godaddy" }, /necesita DEOCO_GODADDY_KEY y DEOCO_GODADDY_SECRET/],
    [{ DEOCO_REGISTRADOR: "godaddy", DEOCO_GODADDY_KEY: "k", DEOCO_GODADDY_SECRET: "s" }, /necesita Cloudflare configurado/],
  ])("%o", (cambio, problema) => {
    expect(problemasDeEntorno({ ...BIEN, ...cambio }, PROD).join("\n")).toMatch(problema);
  });

  it("un build con la lista de módulos de desarrollo no arranca en producción", () => {
    expect(problemasDeEntorno(BIEN, { generadoPara: "desarrollo" })).toEqual([
      "La lista de módulos no es de producción (incluiría módulos de desarrollo): construí con `next build`.",
    ]);
  });
});

describe("verificación de arranque: base", () => {
  it("con los roles de pruebas (deoco_app / deoco_admin) no hay problemas", async () => {
    expect(await problemasDeBase(process.env)).toEqual([]);
  });

  it("un DATABASE_URL_ADMIN sin BYPASSRLS o inexistente se detecta", async () => {
    expect(await problemasDeBase({ DATABASE_URL_ADMIN: "postgresql://deoco_app:x@db/deoco" })).toEqual([
      "DATABASE_URL_ADMIN usa el rol deoco_app, sin BYPASSRLS: el back office no vería las bandas.",
    ]);
    expect((await problemasDeBase({ DATABASE_URL_ADMIN: "postgresql://nadie:x@db/deoco" })).join()).toMatch(/no existe/);
  });
});

describe("el dominio raíz sale de DEOCO_DOMINIO_RAIZ, nunca del código", () => {
  it("sin la variable, dominioRaiz() no inventa uno; con ella, la usa (también el remitente por defecto)", async () => {
    const { dominioRaiz } = await import("@/nucleo/tenant/hosts");
    const { remitente } = await import("@/nucleo/correo/transporte");
    const antes = { raiz: process.env.DEOCO_DOMINIO_RAIZ, remitente: process.env.DEOCO_CORREO_REMITENTE };
    try {
      delete process.env.DEOCO_DOMINIO_RAIZ;
      expect(() => dominioRaiz()).toThrow(/DEOCO_DOMINIO_RAIZ/);
      process.env.DEOCO_DOMINIO_RAIZ = "Ejemplo.Test";
      delete process.env.DEOCO_CORREO_REMITENTE;
      expect(dominioRaiz()).toBe("ejemplo.test");
      expect(remitente()).toBe("no-responder@ejemplo.test");
    } finally {
      process.env.DEOCO_DOMINIO_RAIZ = antes.raiz;
      if (antes.remitente === undefined) delete process.env.DEOCO_CORREO_REMITENTE;
      else process.env.DEOCO_CORREO_REMITENTE = antes.remitente;
    }
  });

  it("ningún archivo de la app tiene un dominio de respaldo para DEOCO_DOMINIO_RAIZ", async () => {
    const { execFileSync } = await import("node:child_process");
    let salida = "";
    try {
      salida = execFileSync("git", ["grep", "-n", "-E", "DEOCO_DOMINIO_RAIZ\\s*(\\?\\?|\\|\\|)", "--", "src", "modulos"], { encoding: "utf8" });
    } catch {
      // git grep sale con 1 cuando no encuentra nada: es lo esperado.
    }
    expect(salida).toBe("");
  });
});

describe("vender dominios", () => {
  it("con registrador hace falta un gestor que cobre dominios y la cuenta de Deoco", () => {
    const sinCobro = { gestor: { moduloId: "comercial", gestion: {} as GestionCuenta } };
    const conCobro = { gestor: { moduloId: "comercial", gestion: { dominios: {} } as GestionCuenta } };
    expect(problemasDeVenta(sinCobro, {})).toEqual([]);
    expect(problemasDeVenta({}, { DEOCO_REGISTRADOR: "godaddy" })[0]).toMatch(/ningún gestor de cuenta cobra dominios/);
    expect(problemasDeVenta(sinCobro, { DEOCO_REGISTRADOR: "godaddy" })[0]).toMatch(/ningún gestor de cuenta cobra dominios/);
    expect(problemasDeVenta(conCobro, { DEOCO_REGISTRADOR: "godaddy" })[0]).toMatch(/DEOCO_CUOTA_MP_TOKEN/);
    expect(problemasDeVenta(conCobro, { DEOCO_REGISTRADOR: "godaddy", DEOCO_CUOTA_MP_TOKEN: "APP_USR-x" })).toEqual([]);
  });
});
