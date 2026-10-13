import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/nucleo/db/cliente";
import type { Modulo } from "@/nucleo/modulos/contrato";
import { resolverMetadatos } from "@/nucleo/modulos/metadatos";
import { crearRegistro } from "@/nucleo/modulos/registro";
import { dueno, dosBandas } from "./apoyo";

let a: { id: string };
const nada = () => null;
const vacio = new URLSearchParams();

// "sitio" de mentira (metadatos de todo el sitio) y "tienda" de mentira (metadatos por página).
const sitio: Modulo = {
  id: "sitio-falso",
  nombre: "Sitio",
  permisos: [],
  rutasPublicas: [{ ruta: "/", componente: nada }],
  metadatosPublicos: async () => ({ titulo: "Los Satélites", descripcion: "Rock de garage", imagen: "/archivos/x/fondo.jpg?v=web" }),
};
const tienda: Modulo = {
  id: "tienda-falsa",
  nombre: "Tienda",
  permisos: [],
  rutasPublicas: [
    { ruta: "/tienda", componente: nada, metadatos: () => ({ titulo: "Tienda" }) },
    {
      ruta: "/tienda/[producto]",
      componente: nada,
      metadatos: ({ params, consulta }) => ({
        titulo: `Remera ${params.producto}${consulta.get("talle") ? ` (${consulta.get("talle")})` : ""}`,
        descripcion: "Algodón",
        imagen: "https://cdn.ejemplo.com/remera.jpg",
      }),
    },
    { ruta: "/rota", componente: nada, metadatos: () => Promise.reject(new Error("se rompió")) },
  ],
};
const reg = crearRegistro([sitio, tienda]);

async function prender(...ids: string[]) {
  await dueno.moduloTenant.deleteMany();
  if (ids.length) await dueno.moduloTenant.createMany({ data: ids.map((moduloId) => ({ tenantId: a.id, moduloId })) });
}

beforeAll(async () => {
  ({ a } = await dosBandas());
});
beforeEach(() => prender());
afterAll(async () => {
  await dueno.moduloTenant.deleteMany();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("título y vista previa de las páginas públicas", () => {
  it("sin nada declarado: el nombre de la banda, nunca Deoco", async () => {
    expect(await resolverMetadatos(a.id, "/", vacio, reg)).toEqual({ titulo: "Banda A", banda: "Banda A" });
    expect(await resolverMetadatos(a.id, "/no-existe", vacio, crearRegistro([]))).toMatchObject({ titulo: "Banda A" });
  });

  it("el módulo del sitio pone el nombre, la descripción y la imagen de toda la banda", async () => {
    await prender("sitio-falso");
    expect(await resolverMetadatos(a.id, "/", vacio, reg)).toEqual({
      titulo: "Los Satélites",
      banda: "Los Satélites",
      descripcion: "Rock de garage",
      imagen: "/archivos/x/fondo.jpg?v=web",
    });
  });

  it("cada página declara lo suyo; lo que falta sale del sitio", async () => {
    await prender("sitio-falso", "tienda-falsa");
    expect(await resolverMetadatos(a.id, "/tienda", vacio, reg)).toMatchObject({
      titulo: "Tienda · Los Satélites",
      descripcion: "Rock de garage",
      imagen: "/archivos/x/fondo.jpg?v=web",
    });
    expect(await resolverMetadatos(a.id, "/tienda/negra", new URLSearchParams("talle=m"), reg)).toEqual({
      titulo: "Remera negra (m) · Los Satélites",
      banda: "Los Satélites",
      descripcion: "Algodón",
      imagen: "https://cdn.ejemplo.com/remera.jpg",
    });
  });

  it("con el sitio apagado, la página igual lleva el nombre de la banda", async () => {
    await prender("tienda-falsa");
    expect((await resolverMetadatos(a.id, "/tienda", vacio, reg)).titulo).toBe("Tienda · Banda A");
  });

  it("un módulo apagado no aporta metadatos", async () => {
    await prender("sitio-falso");
    expect((await resolverMetadatos(a.id, "/tienda", vacio, reg)).titulo).toBe("Los Satélites");
  });

  it("si un módulo falla al armarlos, la página sale con el nombre de la banda", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await prender("sitio-falso", "tienda-falsa");
    expect((await resolverMetadatos(a.id, "/rota", vacio, reg)).titulo).toBe("Los Satélites");
    vi.restoreAllMocks();
  });

  it("el registro: un solo módulo aporta los del sitio, y las rutas de panel no llevan", () => {
    expect(() => crearRegistro([sitio, { ...sitio, id: "otro", rutasPublicas: [] }])).toThrow(/metadatosPublicos: ya los aporta/);
    expect(() =>
      crearRegistro([{ id: "m", nombre: "m", permisos: [], rutasPanel: [{ ruta: "/x", componente: nada, metadatos: () => ({}) }] }]),
    ).toThrow(/solo del sitio público/);
  });
});
