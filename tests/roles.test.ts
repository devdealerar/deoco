import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/nucleo/db/cliente";
import type { Modulo } from "@/nucleo/modulos/contrato";
import { registro } from "@/nucleo/modulos";
import { crearRegistro, ErrorRegistro } from "@/nucleo/modulos/registro";
import { puede, rolVigente } from "@/nucleo/permisos/puede";
import { dosBandas, dueno } from "./apoyo";

// Roles: el núcleo tiene TITULAR, EDITOR y LECTURA; PUERTA y COMERCIAL los declaran los módulos.

const base = (extra: Partial<Modulo>): Modulo => ({ id: "uno", nombre: "Uno", permisos: [], ...extra });

describe("registro de roles", () => {
  it("los del núcleo y los de los módulos; el mismo nombre en dos módulos es el mismo rol", () => {
    const reg = registro();
    expect(reg.roles.map((r) => r.clave)).toEqual(["TITULAR", "EDITOR", "LECTURA", "PUERTA", "COMERCIAL"]);
    expect(reg.rol("COMERCIAL")!.moduloIds.sort()).toEqual(["ticketera", "tienda"]);
    expect(reg.rol("PUERTA")!.moduloIds).toEqual(["ticketera"]);
    expect(reg.rol("TITULAR")!.moduloIds).toEqual([]);
  });

  it("valida forma, que no pise uno del núcleo y que los permisos nombren roles que existen", () => {
    expect(() => crearRegistro([base({ roles: [{ clave: "puerta", etiqueta: "P" }] })])).toThrow(ErrorRegistro);
    expect(() => crearRegistro([base({ roles: [{ clave: "EDITOR", etiqueta: "E" }] })])).toThrow(/es del núcleo/);
    expect(() => crearRegistro([base({ permisos: [{ clave: "uno.cosa.ver", rolesPorDefecto: ["TITULAR", "PUERTA"] }] })])).toThrow(/"PUERTA" no existe/);
    expect(() =>
      crearRegistro([
        base({ permisos: [{ clave: "uno.cosa.ver", rolesPorDefecto: ["PUERTA"] }] }),
        { id: "dos", nombre: "Dos", permisos: [], roles: [{ clave: "PUERTA", etiqueta: "Puerta" }] },
      ]),
    ).not.toThrow();
  });
});

describe("un rol de módulo cuenta solo con su módulo prendido", () => {
  let e: Awaited<ReturnType<typeof dosBandas>>;
  beforeAll(async () => {
    e = await dosBandas();
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await dueno.$disconnect();
  });

  it("PUERTA ve la tienda solo si la ticketera (que declara PUERTA) está prendida", async () => {
    const p = await dueno.usuario.create({ data: { email: "puerta@x.com", nombre: "P", hashContrasena: "x" } });
    await dueno.membresia.create({ data: { tenantId: e.a.id, usuarioId: p.id, rol: "PUERTA" } });
    await dueno.moduloTenant.create({ data: { tenantId: e.a.id, moduloId: "tienda" } });
    expect(rolVigente("PUERTA", new Set(["tienda"]))).toBe(false);
    expect(await puede(p.id, e.a.id, "tienda.producto.ver")).toBe(false);
    await dueno.moduloTenant.create({ data: { tenantId: e.a.id, moduloId: "ticketera" } });
    expect(await puede(p.id, e.a.id, "tienda.producto.ver")).toBe(true);
    expect(await puede(p.id, e.a.id, "ticketera.puerta.validar")).toBe(true);
    // Un rol que ya no existe en el build no da nada, y la base no acepta cualquier cosa.
    expect(rolVigente("VIEJO", new Set(["tienda", "ticketera"]))).toBe(false);
    await expect(dueno.membresia.update({ where: { usuarioId_tenantId: { usuarioId: p.id, tenantId: e.a.id } }, data: { rol: "no válido" } })).rejects.toThrow();
  });
});
