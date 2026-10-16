import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { conStaffComo } from "@/nucleo/acceso/staff";
import { conTenant } from "@/nucleo/db/con-tenant";
import { prisma } from "@/nucleo/db/cliente";
import {
  actualizarProductoBase,
  actualizarProveedor,
  borrarProductoBase,
  type ComoStaff,
  crearProductoBase,
  crearProveedor,
  type DatosProductoBase,
  fijarCostosDelPedido,
  leerOpciones,
  guardarOferta,
  marcarProveedorPorDefecto,
  ofertasDe,
} from "../modulos/tienda/catalogo";
import { formatearPesos, leerPesos } from "@/nucleo/dinero";
import { dueno, escenarioAcceso } from "./apoyo";

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
let comoStaff: ComoStaff;

const remera = (extra: Partial<DatosProductoBase> = {}): DatosProductoBase => ({
  nombre: "Remera",
  descripcion: "Algodón peinado 24/1",
  opciones: leerOpciones("Talle: S, M, L, XL\nColor: Negro, Blanco"),
  costoProduccion: 900000,
  costoEnvio: 350000,
  proveedorId: null,
  impresionAnchoPx: 4200,
  impresionAltoPx: 4800,
  impresionDpi: 300,
  impresionFormatos: ["png"],
  ...extra,
});
const proveedor = (nombre: string, formatos = ["png", "pdf"]) =>
  crearProveedor(comoStaff, { nombre, email: `ordenes@${nombre.toLowerCase().replace(/\W/g, "")}.com`, contacto: "Ana", formatos });

beforeAll(async () => {
  e = await escenarioAcceso();
  comoStaff = (accion, fn) => conStaffComo(e.staff.id, accion, fn);
});
beforeEach(async () => {
  await dueno.tiendaPedidoItem.deleteMany();
  await dueno.tiendaPedido.deleteMany();
  await dueno.tiendaProducto.deleteMany();
  await dueno.tiendaDiseno.deleteMany();
  await dueno.tiendaOferta.deleteMany();
  await dueno.tiendaProductoBase.deleteMany();
  await dueno.tiendaProveedor.deleteMany();
  await dueno.archivoPlataforma.deleteMany();
  await dueno.auditoria.deleteMany();
});
afterAll(async () => {
  await prisma.$disconnect();
  await dueno.$disconnect();
});

const FAN = {
  nombre: "Fan",
  email: "fan@x.com",
  telefono: "341 555-1234",
  calle: "Córdoba",
  numero: "1234",
  ciudad: "Rosario",
  provincia: "Santa Fe",
  codigoPostal: "2000",
};

/** Una banda que vende el producto base: producto + pedido con un renglón. */
async function venta(tenantId: string, productoBaseId: string) {
  const { proveedorId } = await dueno.tiendaOferta.findFirstOrThrow({ where: { productoBaseId }, orderBy: { creadoEn: "asc" } });
  return conTenant(tenantId, async (tx) => {
    const diseno = await tx.tiendaDiseno.create({
      data: { tenantId, nombre: "Logo", archivoId: crypto.randomUUID(), archivoNombre: "logo.png", formato: "png", anchoPx: 4200, altoPx: 4800, dpi: 300 },
    });
    const producto = await tx.tiendaProducto.create({
      data: { tenantId, productoBaseId, proveedorId, disenoId: diseno.id, nombre: "Remera Los Satélites", precio: 2500000, publicado: true },
    });
    const pedido = await tx.tiendaPedido.create({ data: { tenantId, ...FAN, subtotal: 5000000, envio: 700000, total: 5700000, tokenHash: "h".repeat(64) } });
    await tx.tiendaPedidoItem.create({
      data: { tenantId, pedidoId: pedido.id, productoId: producto.id, productoBaseId, disenoId: diseno.id, nombreProducto: "Remera Los Satélites", variante: { Talle: "M" }, cantidad: 2, precioUnitario: 2500000, envioUnitario: 350000 },
    });
    return { producto, pedido };
  });
}

describe("prueba 1: el staff carga un proveedor y un producto base (auditado)", () => {
  it("con variantes, costos, especificaciones de impresión y foto", async () => {
    const p = await proveedor("Estampados Sur");
    expect(p.porDefecto).toBe(true); // el primero es el de la plataforma
    const foto = await sharp({ create: { width: 1600, height: 1600, channels: 3, background: "#222" } }).jpeg().toBuffer();
    const base = await crearProductoBase(comoStaff, remera(), { nombre: "remera.jpg", datos: foto });
    expect(base).toMatchObject({
      nombre: "Remera",
      costoEnvioPorZona: null,
      impresionFormatos: ["png"],
      activo: true,
      opciones: [
        { nombre: "Talle", valores: ["S", "M", "L", "XL"] },
        { nombre: "Color", valores: ["Negro", "Blanco"] },
      ],
    });
    // Los costos son de la primera oferta: la del proveedor de la plataforma, plazo 7 días.
    expect(await dueno.tiendaOferta.findMany({ where: { productoBaseId: base.id } })).toMatchObject([
      { proveedorId: p.id, costoProduccion: 900000, costoEnvio: 350000, plazoDias: 7, activa: true },
    ]);
    expect(await dueno.archivoPlataforma.findUniqueOrThrow({ where: { id: base.fotoArchivoId! } })).toMatchObject({
      moduloId: "tienda",
      variantes: ["web"],
    });
    const audit = await dueno.auditoria.findMany({ orderBy: { fecha: "asc" } });
    expect(audit.map((a) => [a.accion, a.usuarioId, a.tenantId])).toEqual([
      ["tienda.proveedor_creado", e.staff.id, null],
      ["tienda.producto_base_creado", e.staff.id, null],
    ]);
  });

  it("solo el staff: otro usuario no puede", async () => {
    await proveedor("Estampados Sur");
    const comoBanda: ComoStaff = (accion, fn) => conStaffComo(e.multi.id, accion, fn);
    await expect(crearProductoBase(comoBanda, remera())).rejects.toThrow("Solo el staff de Deoco.");
    await expect(crearProveedor(comoBanda, { nombre: "X", email: "x@x.com", contacto: "", formatos: ["png"] })).rejects.toThrow(
      "Solo el staff de Deoco.",
    );
  });

  it("valida: SVG no es formato de impresión; formatos que el proveedor no acepta; variantes mal escritas", async () => {
    await expect(proveedor("Raro", ["svg"])).rejects.toThrow(/Solo PNG y PDF \(SVG no\)/);
    await expect(crearProductoBase(comoStaff, remera())).rejects.toThrow(/No hay proveedor por defecto/);
    await proveedor("Solo PNG", ["png"]);
    await expect(crearProductoBase(comoStaff, remera({ impresionFormatos: ["pdf"] }))).rejects.toThrow(/no acepta PDF/);
    expect(() => leerOpciones("Talle S, M")).toThrow(/Opción: valor, valor/);
    expect(() => leerOpciones("Talle: S\ntalle: M")).toThrow(/repetida/);
    expect(leerOpciones("")).toEqual([]); // un vinilo no tiene variantes
  });
});

describe("prueba 2: la primera oferta, sin proveedor nombrado, es del de la plataforma", () => {
  it("el nombrado si hay; si no, el por defecto (cambiar el por defecto rige para los productos base nuevos)", async () => {
    const sur = await proveedor("Estampados Sur");
    const vinilos = await proveedor("Prensa de Vinilos", ["pdf"]);
    const remeraBase = await crearProductoBase(comoStaff, remera());
    const vinilo = await crearProductoBase(
      comoStaff,
      remera({ nombre: "Vinilo", opciones: [], proveedorId: vinilos.id, impresionFormatos: ["pdf"], impresionAnchoPx: 3600, impresionAltoPx: 3600 }),
    );
    const proveedores = async (id: string) => (await ofertasDe(id)).map((o) => o.proveedor.nombre);
    expect(await proveedores(remeraBase.id)).toEqual(["Estampados Sur"]);
    expect(await proveedores(vinilo.id)).toEqual(["Prensa de Vinilos"]);

    const norte = await proveedor("Estampados Norte");
    await marcarProveedorPorDefecto(comoStaff, norte.id);
    expect(await proveedores(remeraBase.id)).toEqual(["Estampados Sur"]);
    expect(await proveedores((await crearProductoBase(comoStaff, remera({ nombre: "Buzo" }))).id)).toEqual(["Estampados Norte"]);
    expect(await dueno.tiendaProveedor.count({ where: { porDefecto: true } })).toBe(1);
    // El por defecto no se desactiva; uno con ofertas activas, tampoco.
    await expect(actualizarProveedor(comoStaff, norte.id, { ...norte, activo: false })).rejects.toThrow(/marcá otro por defecto/);
    await expect(actualizarProveedor(comoStaff, vinilos.id, { ...vinilos, activo: false })).rejects.toThrow(/retiralas/);
    await guardarOferta(comoStaff, remeraBase.id, sur.id, { costoProduccion: 900000, costoEnvio: 350000, plazoDias: 7, activa: false });
    await actualizarProveedor(comoStaff, sur.id, { ...sur, activo: false });
    await expect(marcarProveedorPorDefecto(comoStaff, sur.id)).rejects.toThrow(/desactivado/);
  });
});

describe("prueba 3: un producto base en uso no se borra, se desactiva", () => {
  it("sin uso se borra; usado por una banda, no (aunque el staff no vea sus productos)", async () => {
    await proveedor("Estampados Sur");
    const libre = await crearProductoBase(comoStaff, remera({ nombre: "Buzo" }));
    await borrarProductoBase(comoStaff, libre.id);
    expect(await dueno.tiendaProductoBase.count()).toBe(0);

    const base = await crearProductoBase(comoStaff, remera());
    await venta(e.a.id, base.id);
    await expect(borrarProductoBase(comoStaff, base.id)).rejects.toThrow(/Hay bandas que lo usan.*Desactivalo/);
    expect(await dueno.tiendaProductoBase.count()).toBe(1);

    await actualizarProductoBase(comoStaff, base.id, { ...remera(), activo: false });
    expect((await dueno.tiendaProductoBase.findUniqueOrThrow({ where: { id: base.id } })).activo).toBe(false);
    // Desactivado (3.2 proveedor d5): el producto que la banda ya tenía sigue existiendo, pero se despublica.
    expect(await conTenant(e.a.id, (tx) => tx.tiendaProducto.count({ where: { productoBaseId: base.id } }))).toBe(1);
    expect(await conTenant(e.a.id, (tx) => tx.tiendaProducto.count({ where: { productoBaseId: base.id, publicado: true } }))).toBe(0);
  });
});

describe("prueba 4: cambiar costos no afecta lo ya pagado", () => {
  it("el renglón pagado guarda su copia de costo, envío y proveedor", async () => {
    const sur = await proveedor("Estampados Sur");
    const base = await crearProductoBase(comoStaff, remera());
    const { pedido } = await venta(e.a.id, base.id);
    await conTenant(e.a.id, (tx) => fijarCostosDelPedido(tx, pedido.id)); // se pagó

    await guardarOferta(comoStaff, base.id, sur.id, { costoProduccion: 1200000, costoEnvio: 500000, plazoDias: 7, activa: true });

    const item = await conTenant(e.a.id, (tx) => tx.tiendaPedidoItem.findFirstOrThrow({ where: { pedidoId: pedido.id } }));
    expect(item).toMatchObject({ costoProduccion: 900000, costoEnvio: 350000, proveedorId: sur.id });
    // Un segundo "pago" (aviso repetido) no pisa la copia.
    await conTenant(e.a.id, (tx) => fijarCostosDelPedido(tx, pedido.id));
    expect(await conTenant(e.a.id, (tx) => tx.tiendaPedidoItem.findFirstOrThrow({ where: { pedidoId: pedido.id } }))).toMatchObject({
      costoProduccion: 900000,
      costoEnvio: 350000,
    });
    // Lo que se pague desde ahora, con los costos nuevos.
    const otro = await venta(e.a.id, base.id);
    await conTenant(e.a.id, (tx) => fijarCostosDelPedido(tx, otro.pedido.id));
    expect(await conTenant(e.a.id, (tx) => tx.tiendaPedidoItem.findFirstOrThrow({ where: { pedidoId: otro.pedido.id } }))).toMatchObject({
      costoProduccion: 1200000,
      costoEnvio: 500000,
      proveedorId: sur.id,
    });
    const audit = await dueno.auditoria.findFirstOrThrow({ where: { accion: "tienda.oferta_guardada" } });
    expect(audit.detalle).toMatchObject({ antes: { costoProduccion: 900000 }, despues: { costoProduccion: 1200000 } });
  });
});

describe("prueba 5: proveedores y catálogo son globales", () => {
  it("cualquier banda los lee; ninguna los escribe", async () => {
    await proveedor("Estampados Sur");
    await crearProductoBase(comoStaff, remera());
    expect(await conTenant(e.a.id, (tx) => tx.tiendaProductoBase.count())).toBe(1);
    expect(await conTenant(e.b.id, (tx) => tx.tiendaProductoBase.count())).toBe(1);
    await expect(conTenant(e.a.id, (tx) => tx.tiendaOferta.updateMany({ data: { costoProduccion: 1 } }))).resolves.toEqual({ count: 0 });
    await expect(
      conTenant(e.a.id, (tx) => tx.tiendaProveedor.create({ data: { nombre: "Trucho", email: "t@t.com", formatos: ["png"] } })),
    ).rejects.toThrow(/row-level security/);
    expect((await dueno.tiendaOferta.findFirstOrThrow()).costoProduccion).toBe(900000);
  });

  it("los productos y pedidos de una banda no se ven desde otra", async () => {
    await proveedor("Estampados Sur");
    const base = await crearProductoBase(comoStaff, remera());
    await venta(e.a.id, base.id);
    expect(await conTenant(e.a.id, (tx) => tx.tiendaPedido.count())).toBe(1);
    expect(await conTenant(e.b.id, (tx) => tx.tiendaPedido.count())).toBe(0);
    expect(await conTenant(e.b.id, (tx) => tx.tiendaProducto.count())).toBe(0);
  });
});

describe("dinero en pesos", () => {
  it("se escribe como acá y se guarda en centavos", () => {
    expect(leerPesos("12500")).toBe(1250000);
    expect(leerPesos("12.500")).toBe(1250000);
    expect(leerPesos("$ 12.500,50")).toBe(1250050);
    expect(leerPesos("12500,5")).toBe(1250050);
    expect(leerPesos("12,500.50")).toBeNull();
    expect(leerPesos("-3")).toBeNull();
    expect(formatearPesos(1250050).replace(/\s/g, " ")).toBe("$ 12.500,50");
    expect(formatearPesos(1250000).replace(/\s/g, " ")).toBe("$ 12.500");
    expect(formatearPesos(-250000).replace(/\s/g, " ")).toBe("-$ 2.500");
  });
});
