import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { conStaffComo } from "@/nucleo/acceso/staff";
import { conTenant } from "@/nucleo/db/con-tenant";
import { prisma } from "@/nucleo/db/cliente";
import { guardarSecreto } from "@/nucleo/secretos/carga";
import { type ComoStaff, crearProductoBase, crearProveedor, leerOpciones } from "../modulos/tienda/catalogo";
import tienda from "../modulos/tienda";
import { pasarelaLista } from "../modulos/tienda/pasarelas";
import { crearPedido, type DatosFan, ErrorCompra, leerCarrito, revisarCarrito, validarDatosFan } from "../modulos/tienda/pedidos";
import { actualizarProducto, crearProducto, productosPublicados, publicarProducto, subirDiseno } from "../modulos/tienda/productos";
import { dueno, escenarioAcceso } from "./apoyo";

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
let remeraBase: { id: string; opciones: unknown };
let posterBase: { id: string };
let titularB = "";

const FAN: DatosFan = {
  nombre: "Lucía Fan",
  email: "Lucia@Fan.com",
  telefono: "+54 341 555-1234",
  calle: "Córdoba",
  numero: "1234",
  piso: "3 B",
  ciudad: "Rosario",
  provincia: "Santa Fe",
  codigoPostal: "s2000abc",
};

const png = (a: number, h: number) =>
  sharp({ create: { width: a, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).withMetadata({ density: 300 }).png().toBuffer();

/** Banda con un producto publicado (remera, $25.000, envío $3.500) y uno de poster ($15.000, envío $3.000). */
async function tiendaDe(tenantId: string, titular: string) {
  const d = await subirDiseno(tenantId, "Logo", { nombre: "logo.png", datos: await png(4200, 5000) });
  const remera = await crearProducto(tenantId, remeraBase.id, {
    disenoId: d.id,
    nombre: `Remera ${tenantId.slice(0, 4)}`,
    descripcion: "",
    precio: 2500000,
    variantes: [{ nombre: "Talle", valores: ["S", "M", "L"] }],
  });
  const poster = await crearProducto(tenantId, posterBase.id, { disenoId: d.id, nombre: "Poster", descripcion: "", precio: 1500000, variantes: [] });
  await publicarProducto(tenantId, remera.id, true);
  await publicarProducto(tenantId, poster.id, true);
  await guardarSecreto(titular, tenantId, "tienda", "mercadopago_access_token", "APP_USR-1234567890-token-de-prueba");
  return { remera, poster };
}

beforeAll(async () => {
  e = await escenarioAcceso();
  titularB = (await dueno.usuario.findUniqueOrThrow({ where: { email: "b@x.com" } })).id;
  const comoStaff: ComoStaff = (accion, fn) => conStaffComo(e.staff.id, accion, fn);
  for (const t of ["tiendaPedidoItem", "tiendaPedido", "tiendaProducto", "tiendaDiseno", "tiendaProductoBase", "tiendaProveedor"] as const) {
    await (dueno[t] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await crearProveedor(comoStaff, { nombre: "Sur", email: "o@sur.com", contacto: "", formatos: ["png", "pdf"] });
  const comun = { descripcion: "", proveedorId: null, impresionDpi: 300, impresionFormatos: ["png"] };
  remeraBase = await crearProductoBase(comoStaff, {
    ...comun,
    nombre: "Remera",
    opciones: leerOpciones("Talle: S, M, L, XL"),
    costoProduccion: 900000,
    costoEnvio: 350000,
    impresionAnchoPx: 4200,
    impresionAltoPx: 4800,
  });
  posterBase = await crearProductoBase(comoStaff, {
    ...comun,
    nombre: "Poster",
    opciones: [],
    costoProduccion: 450000,
    costoEnvio: 300000,
    impresionAnchoPx: 3508,
    impresionAltoPx: 4961,
  });
});
beforeEach(async () => {
  await dueno.tiendaPedidoItem.deleteMany();
  await dueno.tiendaPedido.deleteMany();
  await dueno.tiendaProducto.deleteMany();
  await dueno.tiendaDiseno.deleteMany();
  await dueno.secreto.deleteMany();
  await dueno.moduloTenant.deleteMany({ where: { moduloId: "tienda" } });
  await dueno.moduloTenant.createMany({
    data: [
      { tenantId: e.a.id, moduloId: "tienda" },
      { tenantId: e.b.id, moduloId: "tienda" },
    ],
  });
});
afterAll(async () => {
  await dueno.moduloTenant.deleteMany({ where: { moduloId: "tienda" } });
  await prisma.$disconnect();
  await dueno.$disconnect();
});

const linea = (productoId: string, variante: Record<string, string> = {}, cantidad = 1) => ({ productoId, variante, cantidad });

describe("prueba 1: borrador no, publicado sí", () => {
  it("el catálogo y el carrito solo toman publicados", async () => {
    const { remera } = await tiendaDe(e.a.id, e.multi.id);
    await publicarProducto(e.a.id, remera.id, false);
    expect((await productosPublicados(e.a.id)).map((p) => p.nombre)).toEqual(["Poster"]);
    const r = await revisarCarrito(e.a.id, [linea(remera.id, { Talle: "M" })]);
    expect(r.problemas).toEqual([`"${remera.nombre}" ya no está a la venta: sacalo del carrito para seguir.`]);
  });
});

describe("prueba 2: el agujero de aislamiento (renglón con producto de otra banda)", () => {
  it("cada tienda muestra lo suyo", async () => {
    const a = await tiendaDe(e.a.id, e.multi.id);
    const b = await tiendaDe(e.b.id, titularB);
    expect((await productosPublicados(e.a.id)).map((p) => p.id).sort()).toEqual([a.remera.id, a.poster.id].sort());
    expect((await productosPublicados(e.b.id)).map((p) => p.id).sort()).toEqual([b.remera.id, b.poster.id].sort());
  });

  it("un producto de A en el carrito de B no existe: ni se revisa ni se compra", async () => {
    const a = await tiendaDe(e.a.id, e.multi.id);
    await tiendaDe(e.b.id, titularB);
    const carrito = [linea(a.remera.id, { Talle: "M" })];
    expect((await revisarCarrito(e.b.id, carrito)).problemas).toEqual(["Un producto del carrito ya no existe: sacalo para seguir."]);
    await expect(crearPedido(tienda, e.b.id, carrito, FAN)).rejects.toThrow(ErrorCompra);
    expect(await dueno.tiendaPedido.count()).toBe(0);
  });

  it("ni forzando la base: la clave foránea compuesta rechaza el renglón de otra banda", async () => {
    const a = await tiendaDe(e.a.id, e.multi.id);
    const b = await tiendaDe(e.b.id, titularB);
    const deB = await crearPedido(tienda, e.b.id, [linea(b.poster.id)], FAN);
    const renglon = (pedidoId: string, productoId: string) => ({
      tenantId: e.b.id,
      pedidoId,
      productoId,
      productoBaseId: remeraBase.id,
      nombreProducto: "trucho",
      variante: {},
      cantidad: 1,
      precioUnitario: 1,
      envioUnitario: 0,
    });
    // En una transacción de B, un renglón que apunta al producto de A.
    await expect(conTenant(e.b.id, (tx) => tx.tiendaPedidoItem.create({ data: renglon(deB.id, a.remera.id) }))).rejects.toThrow(
      /Foreign key constraint|violates foreign key/i,
    );
    // Y un renglón de B colgado de un pedido de A.
    const deA = await crearPedido(tienda, e.a.id, [linea(a.poster.id)], FAN);
    await expect(conTenant(e.b.id, (tx) => tx.tiendaPedidoItem.create({ data: renglon(deA.id, b.poster.id) }))).rejects.toThrow(
      /Foreign key constraint|violates foreign key/i,
    );
    // Aun con el rol dueño (sin RLS): la base no deja mezclar bandas.
    await expect(
      dueno.tiendaPedidoItem.create({ data: { ...renglon(deB.id, a.remera.id) } }),
    ).rejects.toThrow(/Foreign key constraint|violates foreign key/i);
    expect(await dueno.tiendaPedidoItem.count()).toBe(2);
  });
});

describe("prueba 3: el carrito no decide precios", () => {
  it("cambió el precio en el panel: la revisión y el pedido toman el nuevo", async () => {
    const { remera } = await tiendaDe(e.a.id, e.multi.id);
    const carritoViejo = leerCarrito([{ productoId: remera.id, variante: { Talle: "M" }, cantidad: 1, precio: 1, nombre: "barato" }]);
    await actualizarProducto(e.a.id, remera.id, {
      disenoId: remera.disenoId,
      nombre: remera.nombre,
      descripcion: "",
      precio: 2800000,
      variantes: [{ nombre: "Talle", valores: ["S", "M", "L"] }],
    });
    const r = await revisarCarrito(e.a.id, carritoViejo);
    expect(r.lineas[0].precio).toBe(2800000);
    const pedido = await crearPedido(tienda, e.a.id, carritoViejo, FAN);
    expect(pedido.subtotal).toBe(2800000);
    const [item] = await conTenant(e.a.id, (tx) => tx.tiendaPedidoItem.findMany({ where: { pedidoId: pedido.id } }));
    expect(item).toMatchObject({ precioUnitario: 2800000, envioUnitario: 350000, nombreProducto: remera.nombre, costoProduccion: null });
  });

  it("una variante que el producto ya no ofrece, o sin elegir, no pasa", async () => {
    const { remera } = await tiendaDe(e.a.id, e.multi.id);
    expect((await revisarCarrito(e.a.id, [linea(remera.id, { Talle: "XL" })])).problemas).toEqual([`"${remera.nombre}": Talle XL ya no está disponible.`]);
    expect((await revisarCarrito(e.a.id, [linea(remera.id)])).problemas).toEqual([`"${remera.nombre}": Elegí talle.`]);
  });
});

describe("prueba 4: despublicado mientras estaba en el carrito", () => {
  it("no deja seguir, con aviso claro, y no crea el pedido", async () => {
    const { remera, poster } = await tiendaDe(e.a.id, e.multi.id);
    const carrito = [linea(remera.id, { Talle: "M" }), linea(poster.id)];
    await publicarProducto(e.a.id, remera.id, false);
    const error = await crearPedido(tienda, e.a.id, carrito, FAN).catch((x) => x);
    expect(error).toBeInstanceOf(ErrorCompra);
    expect((error as ErrorCompra).problemas).toEqual([`"${remera.nombre}" ya no está a la venta: sacalo del carrito para seguir.`]);
    expect(await dueno.tiendaPedido.count()).toBe(0);
  });
});

describe("prueba 5: sin credenciales no se compra", () => {
  it("la pasarela no está lista y el pedido no se crea", async () => {
    const { poster } = await tiendaDe(e.a.id, e.multi.id);
    await dueno.secreto.deleteMany();
    expect(await pasarelaLista(tienda, e.a.id)).toMatchObject({ lista: false, faltan: ["Mercado Pago · Access token"] });
    await expect(crearPedido(tienda, e.a.id, [linea(poster.id)], FAN)).rejects.toThrow("La tienda no está recibiendo pedidos en este momento.");
    expect(await dueno.tiendaPedido.count()).toBe(0);
  });
});

describe("prueba 6: total = suma de precios + suma de envíos", () => {
  it("dos remeras y un poster", async () => {
    const { remera, poster } = await tiendaDe(e.a.id, e.multi.id);
    const pedido = await crearPedido(tienda, e.a.id, [linea(remera.id, { Talle: "M" }, 2), linea(poster.id)], FAN);
    // 2 × 25.000 + 15.000 = 65.000 · envíos 2 × 3.500 + 3.000 = 10.000 · total 75.000
    expect(pedido).toMatchObject({ estado: "PENDIENTE", subtotal: 6500000, envio: 1000000, total: 7500000 });
    expect(pedido).toMatchObject({ email: "lucia@fan.com", codigoPostal: "S2000ABC", provincia: "Santa Fe" });
  });
});

describe("lo que manda el navegador no se cree", () => {
  it("leerCarrito descarta lo que no es un renglón y junta repetidos, con tope", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(
      leerCarrito([
        { productoId: id, variante: { Talle: "M" }, cantidad: 3, precio: 1 },
        { productoId: id, variante: { Talle: "M" }, cantidad: 9 },
        { productoId: "no-uuid", cantidad: 1 },
        { productoId: id, variante: { Talle: "S" }, cantidad: -5 },
        "basura",
      ]),
    ).toEqual([
      { productoId: id, variante: { Talle: "M" }, cantidad: 10 },
      { productoId: id, variante: { Talle: "S" }, cantidad: 1 },
    ]);
    expect(leerCarrito("no es una lista")).toEqual([]);
  });

  it("datos del fan: dice qué falta", () => {
    expect(validarDatosFan({ ...FAN, email: "x", codigoPostal: "12", provincia: "Narnia", numero: "" }).problemas).toEqual([
      "Revisá tu email: ahí te llega la confirmación.",
      "Falta el número.",
      "Elegí la provincia.",
      "Revisá el código postal (p. ej. 2000 o S2000ABC).",
    ]);
  });
});
