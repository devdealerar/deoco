import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resolverAcceso } from "@/nucleo/acceso/resolver";
import { guardarArchivo } from "@/nucleo/archivos";
import { accesoAlArchivo } from "@/nucleo/archivos/permiso";
import { prisma } from "@/nucleo/db/cliente";
import { crearRegistro, ErrorRegistro } from "@/nucleo/modulos/registro";
import { dueno, escenarioAcceso } from "./apoyo";

// En el panel, un archivo de la banda se entrega con el permiso de SU recurso (lo declara el
// módulo en `archivos`), no a cualquier miembro que tenga el id. Sin recurso conocido: solo el
// titular.

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
let puerta = "";
let lectura = "";
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c636000010000050001a5f645400000000049454e44ae426082", "hex");

const acceso = async (usuarioId: string) => (await resolverAcceso(usuarioId, e.a.id))!;
const subir = (moduloId: string, recurso: string) => guardarArchivo(e.a.id, { nombre: "x.png", datos: PNG }, { moduloId, recurso, tipos: ["png"] });

beforeAll(async () => {
  e = await escenarioAcceso();
  const crear = async (email: string, rol: string) => {
    const u = await dueno.usuario.create({ data: { email, nombre: email, hashContrasena: "x" } });
    await dueno.membresia.create({ data: { tenantId: e.a.id, usuarioId: u.id, rol } });
    return u.id;
  };
  puerta = await crear("puerta@x.com", "PUERTA");
  lectura = await crear("lectura-a@x.com", "LECTURA");
});
beforeEach(async () => {
  await dueno.archivo.deleteMany();
  await dueno.moduloTenant.deleteMany({ where: { tenantId: e.a.id } });
  await dueno.moduloTenant.createMany({ data: ["tienda", "ticketera", "sitio"].map((moduloId) => ({ tenantId: e.a.id, moduloId })) });
});
afterAll(async () => {
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("entrega de un archivo en el panel", () => {
  it("PUERTA, con el id exacto de un archivo de la tienda, no lo recibe", async () => {
    const diseno = await subir("tienda", "diseno");
    expect(await accesoAlArchivo(await acceso(puerta), diseno.id)).toBe("prohibido");
  });

  it("quien tiene el permiso del recurso lo recibe; con el módulo apagado, nadie", async () => {
    const diseno = await subir("tienda", "diseno");
    expect(await accesoAlArchivo(await acceso(e.multi.id), diseno.id)).toBe("permitido"); // titular
    expect(await accesoAlArchivo(await acceso(lectura), diseno.id)).toBe("permitido"); // tienda.producto.ver
    const foto = await subir("ticketera", "foto-show");
    expect(await accesoAlArchivo(await acceso(puerta), foto.id)).toBe("prohibido"); // ticketera.eventos.ver: no
    expect(await accesoAlArchivo(await acceso(lectura), foto.id)).toBe("permitido");
    await dueno.moduloTenant.deleteMany({ where: { tenantId: e.a.id, moduloId: "tienda" } });
    expect(await accesoAlArchivo(await acceso(e.multi.id), diseno.id)).toBe("prohibido");
  });

  it("sin recurso conocido (archivos viejos que no se pudieron deducir): solo el titular", async () => {
    const viejo = await subir("tienda", "diseno");
    await dueno.archivo.update({ where: { id: viejo.id }, data: { recurso: null } });
    expect(await accesoAlArchivo(await acceso(e.multi.id), viejo.id)).toBe("permitido");
    expect(await accesoAlArchivo(await acceso(e.editorA.id), viejo.id)).toBe("prohibido");
    expect(await accesoAlArchivo(await acceso(lectura), viejo.id)).toBe("prohibido");
  });

  it("de otra banda o inexistente: no existe", async () => {
    const deB = await guardarArchivo(e.b.id, { nombre: "x.png", datos: PNG }, { moduloId: "tienda", recurso: "diseno", tipos: ["png"] });
    expect(await accesoAlArchivo(await acceso(e.multi.id), deB.id)).toBe("no-existe");
    expect(await accesoAlArchivo(await acceso(e.multi.id), crypto.randomUUID())).toBe("no-existe");
    expect(await accesoAlArchivo(await acceso(e.multi.id), "no-es-un-id")).toBe("no-existe");
  });
});

describe("el recurso se declara", () => {
  it("guardar con un recurso que el módulo no declara falla", async () => {
    await expect(subir("tienda", "otra-cosa")).rejects.toThrow(/recurso "otra-cosa"/);
  });

  it("el contrato: recurso con forma, permiso del propio módulo y declarado, sin repetir", () => {
    const base = { id: "uno", nombre: "Uno", permisos: [{ clave: "uno.cosa.ver", rolesPorDefecto: ["TITULAR"] }] };
    expect(() => crearRegistro([{ ...base, archivos: [{ recurso: "foto", permiso: "uno.cosa.ver" }] }])).not.toThrow();
    expect(() => crearRegistro([{ ...base, archivos: [{ recurso: "Foto Grande", permiso: "uno.cosa.ver" }] }])).toThrow(ErrorRegistro);
    expect(() => crearRegistro([{ ...base, archivos: [{ recurso: "foto", permiso: "uno.otra.ver" }] }])).toThrow(/no lo declara/);
    expect(() => crearRegistro([{ ...base, archivos: [{ recurso: "foto", permiso: "uno.cosa.ver" }, { recurso: "foto", permiso: "uno.cosa.ver" }] }])).toThrow(/repetido/);
  });
});

describe("la migración deduce el recurso de los archivos que ya existían", () => {
  it("diseño y foto de la tienda, logo/fondo/rider/slide/descargable del sitio, foto del show; lo demás queda sin recurso", async () => {
    const de: [string, string][] = [["tienda", "diseno"], ["tienda", "foto-producto"], ...["logo", "fondo", "rider", "slide", "descargable"].map((r) => ["sitio", r] as [string, string]), ["ticketera", "foto-show"], ["tienda", "diseno"]];
    const ids = await Promise.all(de.map(([m, r]) => subir(m, r).then((a) => a.id)));
    const [diseno, fotoProducto, logo, fondo, rider, slide, descargable, fotoShow, huerfano] = ids;
    await dueno.archivo.updateMany({ data: { recurso: null } });
    const t = e.a.id;
    const prov = await dueno.tiendaProveedor.create({ data: { nombre: "Prov", email: "prov@x.com", formatos: ["png"] } });
    const base = await dueno.tiendaProductoBase.create({ data: { nombre: "Remera", impresionFormatos: ["png"], impresionDpi: 300, impresionAnchoPx: 1, impresionAltoPx: 1 } });
    const d = await dueno.tiendaDiseno.create({ data: { tenantId: t, nombre: "D", archivoId: diseno, archivoNombre: "x.png", formato: "png" } });
    await dueno.tiendaProducto.create({ data: { tenantId: t, productoBaseId: base.id, proveedorId: prov.id, disenoId: d.id, nombre: "P", precio: 1, fotoArchivoId: fotoProducto } });
    await dueno.sitioPerfil.create({ data: { tenantId: t, logoArchivoId: logo, fondoArchivoId: fondo, riderArchivoId: rider } });
    await dueno.sitioSlide.create({ data: { tenantId: t, archivoId: slide, orden: 0 } });
    await dueno.sitioDescargable.create({ data: { tenantId: t, archivoId: descargable, tipo: "FOTO", orden: 0 } });
    await dueno.ticketeraEvento.create({ data: { tenantId: t, nombre: "S", fecha: new Date(), lugar: "L", ciudad: "C", fotoArchivoId: fotoShow } });

    const sql = readFileSync("prisma/migrations/20261119100000_archivo_recurso/migration.sql", "utf8");
    await dueno.$executeRawUnsafe(sql.slice(sql.indexOf("DO $$"), sql.lastIndexOf("$$;") + 3));

    const recurso = async (id: string) => (await dueno.archivo.findUniqueOrThrow({ where: { id } })).recurso;
    expect(await Promise.all(ids.map(recurso))).toEqual(["diseno", "foto-producto", "logo", "fondo", "rider", "slide", "descargable", "foto-show", null]);
    void huerfano;
    await dueno.tiendaProducto.deleteMany();
    await dueno.tiendaDiseno.deleteMany();
    await dueno.tiendaProductoBase.deleteMany();
    await dueno.sitioSlide.deleteMany();
    await dueno.sitioDescargable.deleteMany();
    await dueno.sitioPerfil.deleteMany();
    await dueno.ticketeraEvento.deleteMany();
  });
});
