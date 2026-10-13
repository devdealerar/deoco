import { describe, expect, it } from "vitest";
import { descubrir, pascal, problemasEsquema } from "../scripts/descubrir-modulos.mjs";

const valido = `
enum SitioColor {
  ROJO
}
model SitioPerfil {
  id       String @id @db.Uuid
  tenantId String @unique @db.Uuid
  @@map("sitio_perfil")
}`;

describe("reglas del esquema de un módulo", () => {
  it("pascal()", () => {
    expect(pascal("sitio")).toBe("Sitio");
    expect(pascal("press-kit")).toBe("PressKit");
  });

  it("un esquema que cumple no tiene problemas", () => {
    expect(problemasEsquema("sitio", valido)).toEqual([]);
  });

  it.each([
    ["modelo sin prefijo", valido.replace("model SitioPerfil", "model Perfil"), /tiene que empezar con "Sitio"/],
    ["enum sin prefijo", valido.replace("enum SitioColor", "enum Color"), /enum Color: tiene que empezar/],
    ["sin @@map", valido.replace('@@map("sitio_perfil")', ""), /falta @@map/],
    ["tabla sin prefijo", valido.replace('"sitio_perfil"', '"perfil"'), /tiene que empezar con "sitio_"/],
    ["tabla de otro módulo", valido.replace('"sitio_perfil"', '"tienda_perfil"'), /tiene que empezar con "sitio_"/],
    ["sin tenantId", valido.replace("tenantId String @unique @db.Uuid", ""), /falta "tenantId String @db.Uuid"/],
    ["tenantId que no es uuid", valido.replace("@unique @db.Uuid", "@unique"), /falta "tenantId/],
    ["con datasource", `datasource db {\n provider = "postgresql"\n}\n${valido}`, /generator ni datasource/],
  ])("%s", (_, esquema, problema) => {
    expect(problemasEsquema("sitio", esquema).join("\n")).toMatch(problema);
  });

  it("/// @global: tabla sin banda (sin tenantId); con tenantId, se rechaza", () => {
    const global = `/// @global\n/// Catálogo base.\nmodel TiendaProductoBase {\n id String @id\n @@map("tienda_producto_base")\n}`;
    expect(problemasEsquema("tienda", global)).toEqual([]);
    expect(problemasEsquema("tienda", global.replace("/// @global\n", "")).join()).toMatch(/falta "tenantId/);
    expect(problemasEsquema("tienda", global.replace(" id String @id", " id String @id\n tenantId String @db.Uuid")).join()).toMatch(
      /es @global y no puede tener tenantId/,
    );
  });

  it("ids con guion: prefijo PressKit y tablas press_kit_", () => {
    const e = `model PressKitFoto {\n tenantId String @db.Uuid\n @@map("press_kit_foto")\n}`;
    expect(problemasEsquema("press-kit", e)).toEqual([]);
  });
});

describe("el módulo de prueba no llega a producción", () => {
  it("la lista de producción excluye los SOLO_DESARROLLO y queda marcada como de producción", async () => {
    try {
      const prod = descubrir({ produccion: true });
      expect(prod.ids).not.toContain("prueba");
      expect(prod.excluidos).toEqual(["prueba"]);
      const { readFileSync } = await import("node:fs");
      const generado = readFileSync("src/generated/modulos.ts", "utf8");
      expect(generado).not.toMatch(/modulos\/prueba/);
      expect(generado).toMatch(/generadoPara: "produccion" \| "desarrollo" = "produccion"/);
    } finally {
      descubrir({ produccion: false }); // deja la lista de desarrollo para el resto de las pruebas
    }
  });
});
