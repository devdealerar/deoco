import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { conStaffComo } from "@/nucleo/acceso/staff";
import { verificarFirma, urlFirmada } from "@/nucleo/archivos/firmados";
import { guardarArchivo } from "@/nucleo/archivos";
import { conTenant } from "@/nucleo/db/con-tenant";
import { prisma } from "@/nucleo/db/cliente";
import type { Modulo } from "@/nucleo/modulos/contrato";
import { menuAdmin, menuAdminPorModulo, menuPanel } from "@/nucleo/modulos/navegacion";
import { crearRegistro } from "@/nucleo/modulos/registro";
import { dueno, escenarioAcceso } from "./apoyo";

// Tabla global de prueba, creada y borrada acá (con el prefijo del módulo de prueba).
const TABLA = "prueba_global_tmp";
let e: Awaited<ReturnType<typeof escenarioAcceso>>;

beforeAll(async () => {
  e = await escenarioAcceso();
  await dueno.$executeRawUnsafe(`DROP TABLE IF EXISTS ${TABLA}`);
  await dueno.$executeRawUnsafe(`CREATE TABLE ${TABLA} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nombre text NOT NULL)`);
  await dueno.$executeRawUnsafe(`SELECT deoco_tabla_global('${TABLA}')`);
});
beforeEach(async () => {
  await dueno.$executeRawUnsafe(`DELETE FROM ${TABLA}`);
  await dueno.auditoria.deleteMany();
});
afterAll(async () => {
  await dueno.$executeRawUnsafe(`DROP TABLE IF EXISTS ${TABLA}`);
  await prisma.$disconnect();
  await dueno.$disconnect();
});

const insertar = (tx: { $executeRawUnsafe: typeof prisma.$executeRawUnsafe }, nombre: string) =>
  tx.$executeRawUnsafe(`INSERT INTO ${TABLA} (nombre) VALUES ($1)`, nombre);

describe("tablas globales y conStaff()", () => {
  it("todos leen; solo conStaff escribe, y queda en la auditoría sin banda", async () => {
    await conStaffComo(e.staff.id, "prueba.remera_cargada", async (tx, ctx) => {
      await insertar(tx, "Remera");
      ctx.detalle({ nombre: "Remera" });
    });
    // La app la lee sin banda y desde cualquier banda.
    expect(await prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM ${TABLA}`)).toHaveLength(1);
    expect(await conTenant(e.b.id, (tx) => tx.$queryRawUnsafe<unknown[]>(`SELECT * FROM ${TABLA}`))).toHaveLength(1);
    const audit = await dueno.auditoria.findMany();
    expect(audit.map((x) => [x.accion, x.usuarioId, x.tenantId, x.detalle])).toEqual([
      ["prueba.remera_cargada", e.staff.id, null, { nombre: "Remera" }],
    ]);
  });

  it("sin conStaff la base rechaza la escritura: ni suelta ni desde una banda", async () => {
    await expect(insertar(prisma, "x")).rejects.toThrow(/row-level security/);
    await expect(conTenant(e.a.id, (tx) => insertar(tx, "x"))).rejects.toThrow(/row-level security/);
    await conStaffComo(e.staff.id, "prueba.cargada", (tx) => insertar(tx, "Buzo"));
    await expect(conTenant(e.a.id, (tx) => tx.$executeRawUnsafe(`DELETE FROM ${TABLA}`))).resolves.toBe(0); // no ve filas para borrar
    await expect(prisma.$executeRawUnsafe(`UPDATE ${TABLA} SET nombre = 'hackeado'`)).resolves.toBe(0);
    expect(await prisma.$queryRawUnsafe<{ nombre: string }[]>(`SELECT nombre FROM ${TABLA}`)).toEqual([{ nombre: "Buzo" }]);
  });

  it("alguien que no es staff no puede: ni escribe ni deja auditoría", async () => {
    await expect(conStaffComo(e.multi.id, "prueba.cargada", (tx) => insertar(tx, "x"))).rejects.toThrow("Solo el staff de Deoco.");
    expect(await prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM ${TABLA}`)).toHaveLength(0);
    expect(await dueno.auditoria.count()).toBe(0);
  });

  it("si la acción falla, no queda ni el dato ni la auditoría", async () => {
    await expect(
      conStaffComo(e.staff.id, "prueba.cargada", async (tx) => {
        await insertar(tx, "a medias");
        throw new Error("falló");
      }),
    ).rejects.toThrow("falló");
    expect(await prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM ${TABLA}`)).toHaveLength(0);
    expect(await dueno.auditoria.count()).toBe(0);
  });

  it("deoco_tabla_global rechaza una tabla con tenantId (esa es de una banda)", async () => {
    await expect(dueno.$executeRawUnsafe(`SELECT deoco_tabla_global('membresia')`)).rejects.toThrow(/es de una banda/);
  });
});

describe("contrato: rutasAdmin, navegación del back office y tablasGlobales", () => {
  const nada = () => null;
  const base = { nombre: "x", permisos: [] };

  it("el menú del back office lleva las entradas admin; el del panel, no", () => {
    const reg = crearRegistro([
      {
        ...base,
        id: "tienda-falsa",
        rutasAdmin: [{ ruta: "/", componente: nada }, { ruta: "/catalogo/[id]", componente: nada }],
        rutasPanel: [{ ruta: "/tienda", componente: nada }],
        navegacion: [
          { etiqueta: "Catálogo base", href: "/", admin: true, orden: 10 },
          { etiqueta: "Tienda", href: "/tienda", orden: 20 },
        ],
        tablasGlobales: ["tienda_falsa_producto_base"],
      },
    ]);
    expect(menuAdmin(reg).map((m) => [m.etiqueta, m.href])).toEqual([["Catálogo base", "/admin/m/tienda-falsa"]]);
    // Agrupado por módulo, con su nombre de título (el menú del back office).
    expect(menuAdminPorModulo(reg).map((g) => [g.moduloId, g.items.length])).toEqual([["tienda-falsa", 1]]);
    const acceso = { usuarioId: e.staff.id, tenantId: e.a.id, rol: null, esStaff: true };
    expect(menuPanel(reg, new Set(["tienda-falsa"]), acceso, "banda-a").map((m) => m.etiqueta)).toEqual(["Tienda"]);
    expect(reg.rutaAdmin("tienda-falsa", "/catalogo/remera")?.params).toEqual({ id: "remera" });
    expect(reg.rutaAdmin("otro", "/")).toBeUndefined();
    expect(reg.tablasGlobales).toEqual([{ moduloId: "tienda-falsa", tabla: "tienda_falsa_producto_base" }]);
  });

  it.each([
    [{ rutasAdmin: [{ ruta: "/", componente: nada, permiso: "m.x.y" }] }, /no lleva permiso/],
    [{ rutasAdmin: [{ ruta: "/a", componente: nada }, { ruta: "/a", componente: nada }] }, /repetida/],
    [{ navegacion: [{ etiqueta: "X", href: "/x", admin: true, orden: 1 }] }, /no es una ruta de admin/],
    [{ tablasGlobales: ["otro_modulo_tabla"] }, /tiene que empezar con "m_"/],
  ])("el registro rechaza lo mal declarado (%#)", (extra, error) => {
    expect(() => crearRegistro([{ ...base, id: "m", ...extra } as Modulo])).toThrow(error);
  });
});

describe("urlFirmada(): link con vencimiento a un archivo privado", () => {
  const imprimible: Modulo = { id: "tienda-falsa", nombre: "Tienda", permisos: [] };
  const otro: Modulo = { id: "otro-falso", nombre: "Otro", permisos: [] };
  const reg = crearRegistro([imprimible, otro]);
  const PDF = Buffer.from("%PDF-1.4\n%diseño para imprimir\n");

  async function archivoDe(moduloId: string) {
    const { id } = await guardarArchivo(e.a.id, { nombre: "diseño final.pdf", datos: PDF }, { moduloId, tipos: ["pdf"] });
    return id;
  }
  const partes = (url: string) => {
    const u = new URL(url);
    const [, , tenant, id] = u.pathname.split("/");
    return { u, tenant, id, vence: u.searchParams.get("vence"), firma: u.searchParams.get("firma") };
  };

  it("es de la plataforma, vale hasta su vencimiento y después no", async () => {
    const id = await archivoDe("tienda-falsa");
    const ahora = new Date("2026-10-13T12:00:00Z");
    const url = await urlFirmada(imprimible, e.a.id, id, { validoPorSegundos: 3600, ahora }, reg);
    const p = partes(url);
    expect(p.u.origin).toMatch(/^https?:\/\/app\./);
    expect(p.u.pathname).toBe(`/descargas/${e.a.id}/${id}/dise%C3%B1o%20final.pdf`);
    expect(verificarFirma(p.tenant, p.id, p.vence, p.firma, new Date("2026-10-13T12:59:59Z"))).toBe("ok");
    expect(verificarFirma(p.tenant, p.id, p.vence, p.firma, new Date("2026-10-13T13:00:01Z"))).toBe("vencido");
  });

  it("alterar banda, archivo, vencimiento o firma lo invalida", async () => {
    const id = await archivoDe("tienda-falsa");
    const p = partes(await urlFirmada(imprimible, e.a.id, id, {}, reg));
    expect(verificarFirma(p.tenant, p.id, p.vence, p.firma)).toBe("ok");
    expect(verificarFirma(e.b.id, p.id, p.vence, p.firma)).toBe("invalido");
    expect(verificarFirma(p.tenant, "00000000-0000-4000-8000-000000000000", p.vence, p.firma)).toBe("invalido");
    expect(verificarFirma(p.tenant, p.id, String(Number(p.vence) + 86400), p.firma)).toBe("invalido");
    expect(verificarFirma(p.tenant, p.id, p.vence, p.firma!.slice(0, -2) + "xx")).toBe("invalido");
    expect(verificarFirma(p.tenant, p.id, null, p.firma)).toBe("invalido");
  });

  it("un módulo solo firma sus archivos, con su contrato registrado, y hasta 30 días", async () => {
    const id = await archivoDe("tienda-falsa");
    await expect(urlFirmada(otro, e.a.id, id, {}, reg)).rejects.toThrow(/no es de este módulo/);
    await expect(urlFirmada({ ...imprimible }, e.a.id, id, {}, reg)).rejects.toThrow(/no es un módulo registrado/);
    await expect(urlFirmada(imprimible, e.b.id, id, {}, reg)).rejects.toThrow(/no es de este módulo en esta banda/);
    await expect(urlFirmada(imprimible, e.a.id, id, { validoPorSegundos: 31 * 86400 }, reg)).rejects.toThrow(/30 días/);
  });
});
