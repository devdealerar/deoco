import { afterAll, describe, expect, it } from "vitest";
import { problemasDeBase, problemasDeEntorno } from "@/nucleo/arranque";
import { prisma } from "@/nucleo/db/cliente";

afterAll(async () => {
  await prisma.$disconnect();
});

const BIEN = {
  DATABASE_URL: "postgresql://deoco_app:x@db:5432/deoco",
  DATABASE_URL_ADMIN: "postgresql://deoco_admin:y@db:5432/deoco",
  DATABASE_URL_MIGRACIONES: "postgresql://deoco_owner:z@db:5432/deoco",
  AUTH_SECRET: "a".repeat(44),
  DEOCO_DOMINIO_RAIZ: "deoco.com",
};
const PROD = { generadoPara: "produccion" };

describe("verificación de arranque: entorno", () => {
  it("una configuración correcta no tiene problemas", () => {
    expect(problemasDeEntorno(BIEN, PROD)).toEqual([]);
  });

  it.each([
    [{ DATABASE_URL: undefined }, "Falta la variable de entorno DATABASE_URL."],
    [{ DATABASE_URL_ADMIN: undefined }, "Falta la variable de entorno DATABASE_URL_ADMIN."],
    [{ AUTH_SECRET: undefined }, "Falta la variable de entorno AUTH_SECRET."],
    [{ DEOCO_DOMINIO_RAIZ: undefined }, "Falta la variable de entorno DEOCO_DOMINIO_RAIZ."],
    [{ AUTH_SECRET: "corto" }, /AUTH_SECRET es demasiado corto/],
    [{ DEOCO_DOMINIO_RAIZ: "https://deoco.com" }, /solo el dominio/],
    [{ DATABASE_URL_ADMIN: BIEN.DATABASE_URL }, /usan el mismo rol \(deoco_app\)/],
    [{ DATABASE_URL: BIEN.DATABASE_URL_MIGRACIONES }, /usa el rol dueño de las tablas \(deoco_owner\)/],
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
