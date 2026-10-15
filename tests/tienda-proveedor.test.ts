import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { conCuentaExterna, conCuentaExternaEnBanda, crearCuentaExterna, portalesDe } from "@/nucleo/acceso/externas";
import { conStaffComo, type LeerComoStaff, leerComoStaffComo } from "@/nucleo/acceso/staff";
import { urlFirmada, verificarFirma } from "@/nucleo/archivos/firmados";
import { bandejaDeSalida, esperarCorreos, vaciarBandeja } from "@/nucleo/correo";
import { conTenant } from "@/nucleo/db/con-tenant";
import { prisma } from "@/nucleo/db/cliente";
import { esperarEventos } from "@/nucleo/eventos/bus";
import { guardarSecreto } from "@/nucleo/secretos/carga";
import tienda from "../modulos/tienda";
import { type ComoStaff, crearProductoBase, crearProveedor, leerOpciones } from "../modulos/tienda/catalogo";
import { deudaDeBanda, registrarPago } from "../modulos/tienda/pagos";
import { crearPedido, type DatosFan } from "../modulos/tienda/pedidos";
import { crearProducto, publicarProducto, subirDiseno } from "../modulos/tienda/productos";
import {
  accesosDeProveedor,
  cuentaCorriente,
  darAccesoProveedor,
  despacharOrden,
  ordenDelProveedor,
  ordenesDelProveedor,
  quitarAccesoProveedor,
  saldarDeudas,
} from "../modulos/tienda/proveedor";
import { dueno, escenarioAcceso } from "./apoyo";

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
let comoStaff: ComoStaff;
let leer: LeerComoStaff;
let sur: { id: string };
let prensa: { id: string };
let remeraBase: { id: string };
let viniloBase: { id: string };
let delSur = ""; // usuario del proveedor Estampados Sur
let dePrensa = ""; // usuario de Prensa de Vinilos
const FAN: DatosFan = {
  nombre: "Lucía Fan", email: "lucia@fan.com", telefono: "341 555-1234", calle: "Córdoba", numero: "1234",
  piso: "3B", ciudad: "Rosario", provincia: "Santa Fe", codigoPostal: "2000",
};

const png = (a: number, h: number) =>
  sharp({ create: { width: a, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).withMetadata({ density: 300 }).png().toBuffer();

/** Pedido pagado de la banda: 2 remeras (Sur) + 1 vinilo (Prensa). */
async function pedidoPagado(tenantId: string, cobro: string) {
  const d = await subirDiseno(tenantId, "Logo", { nombre: "logo.png", datos: await png(4200, 5000) });
  const remera = await crearProducto(tenantId, remeraBase.id, {
    disenoId: d.id, nombre: "Remera Gira", descripcion: "", precio: 2500000, variantes: [{ nombre: "Talle", valores: ["M"] }],
  });
  const vinilo = await crearProducto(tenantId, viniloBase.id, { disenoId: d.id, nombre: "Vinilo", descripcion: "", precio: 4000000, variantes: [] });
  await publicarProducto(tenantId, remera.id, true);
  await publicarProducto(tenantId, vinilo.id, true);
  const pedido = await crearPedido(tienda, tenantId, [
    { productoId: remera.id, variante: { Talle: "M" }, cantidad: 2 },
    { productoId: vinilo.id, variante: {}, cantidad: 1 },
  ], FAN);
  expect(await registrarPago(tenantId, "mercadopago", { cobroId: cobro, estado: "aprobado", estadoPasarela: "approved", referencia: pedido.id, monto: pedido.total, moneda: "ARS" })).toBe("pagado");
  return pedido;
}

const ordenDe = async (usuarioId: string, banda: string) => (await ordenesDelProveedor(usuarioId, {})).find((o) => o.banda === banda)!;

beforeAll(async () => {
  e = await escenarioAcceso();
  comoStaff = (accion, fn) => conStaffComo(e.staff.id, accion, fn);
  leer = (fn) => leerComoStaffComo(e.staff.id, fn);
  for (const t of ["tiendaOrden", "tiendaDeuda", "tiendaPedidoItem", "tiendaPedido", "tiendaProducto", "tiendaDiseno", "tiendaProductoBase", "tiendaProveedor"] as const) {
    await (dueno[t] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await dueno.cuentaExterna.deleteMany();
  await dueno.usuario.deleteMany({ where: { email: { in: ["taller@sur.com", "prensa@vinilos.com"] } } });
  sur = await crearProveedor(comoStaff, { nombre: "Estampados Sur", email: "ordenes@sur.com", contacto: "", formatos: ["png", "pdf"] });
  prensa = await crearProveedor(comoStaff, { nombre: "Prensa de Vinilos", email: "pedidos@vinilos.com", contacto: "", formatos: ["png", "pdf"] });
  const comun = { descripcion: "", impresionDpi: 300, impresionFormatos: ["png"], impresionAnchoPx: 3000, impresionAltoPx: 3000 };
  remeraBase = await crearProductoBase(comoStaff, { ...comun, nombre: "Remera", opciones: leerOpciones("Talle: M"), costoProduccion: 900000, costoEnvio: 350000, proveedorId: null });
  viniloBase = await crearProductoBase(comoStaff, { ...comun, nombre: "Vinilo", opciones: [], costoProduccion: 2000000, costoEnvio: 500000, proveedorId: prensa.id });
  const r1 = await darAccesoProveedor(comoStaff, sur.id, { email: "Taller@Sur.com", nombre: "Taller Sur" });
  expect(r1.claveTemporal).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  await darAccesoProveedor(comoStaff, prensa.id, { email: "prensa@vinilos.com", nombre: "Prensa" });
  delSur = (await dueno.usuario.findUniqueOrThrow({ where: { email: "taller@sur.com" } })).id;
  dePrensa = (await dueno.usuario.findUniqueOrThrow({ where: { email: "prensa@vinilos.com" } })).id;
});
beforeEach(async () => {
  await esperarEventos(); // que no quede nada del anterior en vuelo
  await esperarCorreos();
  for (const t of ["tiendaOrden", "tiendaDeuda", "tiendaPedidoItem", "tiendaPedido", "tiendaProducto", "tiendaDiseno", "tiendaConfig"] as const) {
    await (dueno[t] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await dueno.evento.deleteMany();
  await dueno.correo.deleteMany();
  vaciarBandeja();
  await dueno.moduloTenant.deleteMany({ where: { moduloId: "tienda" } });
  await dueno.moduloTenant.createMany({ data: [{ tenantId: e.a.id, moduloId: "tienda" }, { tenantId: e.b.id, moduloId: "tienda" }] });
  // La tienda recibe pedidos solo con la pasarela cargada.
  await dueno.secreto.deleteMany();
  const titularB = (await dueno.usuario.findUniqueOrThrow({ where: { email: "b@x.com" } })).id;
  await guardarSecreto(e.multi.id, e.a.id, "pagos", "mercadopago_access_token", "APP_USR-AAAA");
  await guardarSecreto(titularB, e.b.id, "pagos", "mercadopago_access_token", "APP_USR-BBBB");
});
afterAll(async () => {
  await esperarEventos();
  await esperarCorreos();
  await dueno.moduloTenant.deleteMany({ where: { moduloId: "tienda" } });
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("acceso del proveedor (cuenta externa)", () => {
  it("lo da el staff; el usuario no es de ninguna banda y entra a su portal", async () => {
    expect((await accesosDeProveedor(leer, sur.id)).map((c) => [c.email, c.claveTemporal])).toEqual([["taller@sur.com", true]]);
    expect(await dueno.membresia.count({ where: { usuarioId: delSur } })).toBe(0);
    expect(await portalesDe(delSur)).toEqual([{ moduloId: "tienda", etiqueta: "Panel de proveedor", href: "/portal/tienda" }]);
    // Fuera del staff no se puede dar acceso; a alguien del staff, tampoco.
    await expect(conTenant(e.a.id, (tx) => crearCuentaExterna(tx, tienda, { referencia: sur.id, email: "x@x.com", nombre: "X", creadoPor: e.multi.id }))).rejects.toThrow(/staff/);
    await expect(darAccesoProveedor(comoStaff, sur.id, { email: "staff@deoco.com", nombre: "" })).rejects.toThrow(/staff de Deoco/);
    await expect(darAccesoProveedor(comoStaff, sur.id, { email: "taller@sur.com", nombre: "" })).rejects.toThrow(/ya tiene una cuenta/);
  });

  it("quitar el acceso: ya no lee nada", async () => {
    await darAccesoProveedor(comoStaff, sur.id, { email: "otro@sur.com", nombre: "Otro" });
    const [, otro] = await accesosDeProveedor(leer, sur.id);
    await quitarAccesoProveedor(comoStaff, otro.id);
    const id = (await dueno.usuario.findUniqueOrThrow({ where: { email: "otro@sur.com" } })).id;
    await expect(ordenesDelProveedor(id)).rejects.toThrow(/no tiene cuenta externa/);
    await dueno.usuario.delete({ where: { id } });
  });
});

describe("órdenes: de todas las bandas, solo las suyas", () => {
  it("cada proveedor ve sus órdenes de A y de B, y nada de otro proveedor", async () => {
    await pedidoPagado(e.a.id, "c-a1");
    await pedidoPagado(e.b.id, "c-b1");
    const deSur = await ordenesDelProveedor(delSur);
    expect(deSur.map((o) => [o.banda, o.unidades, o.estado]).sort()).toEqual([
      ["Banda A", 2, "EN_PRODUCCION"],
      ["Banda B", 2, "EN_PRODUCCION"],
    ]);
    expect((await ordenesDelProveedor(dePrensa)).map((o) => o.unidades)).toEqual([1, 1]);
    // Ni una fila de otro proveedor, aunque la consulte de frente.
    const ajenas = await conCuentaExterna(delSur, tienda, async (tx) => ({
      items: await tx.tiendaPedidoItem.findMany({ where: { proveedorId: prensa.id } }),
      deudas: await tx.tiendaDeuda.findMany({ where: { proveedorId: prensa.id } }),
      ordenes: await tx.tiendaOrden.findMany({ where: { proveedorId: prensa.id } }),
      // Tablas de banda sin política de proveedor: nada.
      productos: await tx.tiendaProducto.findMany({ where: { nombre: "Vinilo" } }),
      membresias: await tx.membresia.count(),
      correos: await tx.correo.count(),
    }));
    expect(ajenas).toEqual({ items: [], deudas: [], ordenes: [], productos: [], membresias: 0, correos: 0 });
  });

  it("el detalle: qué producir, archivo, envío y contacto; sin montos de venta", async () => {
    await pedidoPagado(e.a.id, "c-a2");
    const o = await ordenDe(delSur, "Banda A");
    const ahora = new Date();
    const d = (await ordenDelProveedor(delSur, o.id, ahora))!;
    expect(d.renglones.map((r) => [r.cantidad, r.productoBase, r.producto, r.variante])).toEqual([[2, "Remera", "Remera Gira", "Talle: M"]]);
    expect(d.envio).toEqual({ nombre: "Lucía Fan", telefono: "341 555-1234", direccion: "Córdoba 1234, 3B", ciudad: "Rosario", provincia: "Santa Fe", codigoPostal: "2000" });
    expect(d.contacto.email).toMatch(/^(a|multi)@x\.com$/); // sin contacto cargado: un titular
    expect(JSON.stringify(d)).not.toMatch(/2500000|25\.000|total|precio/i);
    // Link nuevo, firmado, que vale 3 días desde ahora.
    const u = new URL(d.renglones[0].archivo.url);
    const [, , tenant, id] = u.pathname.split("/");
    expect(verificarFirma(tenant, id, u.searchParams.get("vence"), u.searchParams.get("firma"), new Date(ahora.getTime() + 2 * 86400_000))).toBe("ok");
    expect(verificarFirma(tenant, id, u.searchParams.get("vence"), u.searchParams.get("firma"), new Date(ahora.getTime() + 4 * 86400_000))).toBe("vencido");
    // La orden de otro proveedor no la abre.
    expect(await ordenDelProveedor(dePrensa, o.id)).toBeNull();
  });
});

describe("despacho", () => {
  it("con seguimiento: la orden pasa a DESPACHADO, el fan recibe el mail; cuando salen todas, el pedido también", async () => {
    const pedido = await pedidoPagado(e.a.id, "c-a3");
    await esperarEventos();
    await esperarCorreos();
    vaciarBandeja();
    const deSur = await ordenDe(delSur, "Banda A");
    await despacharOrden(delSur, deSur.id, "  AR 1234-5678 ");
    await esperarEventos();
    await esperarCorreos();
    expect((await dueno.tiendaPedido.findUniqueOrThrow({ where: { id: pedido.id } })).estado).toBe("PAGADO"); // falta el vinilo
    let [m] = bandejaDeSalida();
    expect(m).toMatchObject({ para: "lucia@fan.com", asunto: expect.stringMatching(/^Una parte de tu pedido .* ya salió · Banda A$/) });
    expect(m.texto).toContain("Número de seguimiento: AR 1234-5678");
    expect(m.texto).toContain("Remera Gira × 2 (Talle: M)");
    expect(m.texto).not.toContain("Vinilo");

    // Dos veces no: ni otro estado ni otro mail.
    await expect(despacharOrden(delSur, deSur.id, "otro")).rejects.toThrow(/ya estaba despachada/);
    // Otro proveedor no puede despachar una orden ajena.
    await expect(despacharOrden(dePrensa, deSur.id, "")).rejects.toThrow(/no existe/);

    vaciarBandeja();
    await despacharOrden(dePrensa, (await ordenDe(dePrensa, "Banda A")).id, "");
    await esperarEventos();
    await esperarCorreos();
    expect((await dueno.tiendaPedido.findUniqueOrThrow({ where: { id: pedido.id } })).estado).toBe("DESPACHADO");
    [m] = bandejaDeSalida();
    expect(m.asunto).toMatch(/^El resto de tu pedido .* ya salió/);
    expect(m.texto).toContain("Este envío no tiene número de seguimiento.");
    expect(await dueno.auditoria.count({ where: { accion: "tienda.orden_despachada", tenantId: e.a.id } })).toBe(2);
  });
});

describe("cuenta corriente", () => {
  it("lo que le debe cada banda; el proveedor marca saldado y la banda lo ve", async () => {
    await pedidoPagado(e.a.id, "c-a4");
    await pedidoPagado(e.a.id, "c-a5");
    await pedidoPagado(e.b.id, "c-b2");
    const cuentas = await cuentaCorriente(delSur);
    // Por pedido: 2 × 9.000 + envío 3.500 = 21.500
    expect(cuentas.map((c) => [c.banda, c.pendiente, c.deudas.length])).toEqual([
      ["Banda A", 4300000, 2],
      ["Banda B", 2150000, 1],
    ]);
    const [a1] = cuentas[0].deudas;
    expect(await saldarDeudas(delSur, e.a.id, [a1.id], "Transferencia del 3/11")).toBe(1);
    expect(await saldarDeudas(delSur, e.a.id, [a1.id], "otra")).toBe(0); // no se pisa
    const saldada = await dueno.tiendaDeuda.findUniqueOrThrow({ where: { id: a1.id } });
    expect(saldada).toMatchObject({ saldadaPor: delSur, notaSaldo: "Transferencia del 3/11" });
    expect((await deudaDeBanda(e.a.id)).find((d) => d.proveedor === "Estampados Sur")).toMatchObject({ pendiente: 2150000, saldado: 2150000 });
    // Una deuda de otro proveedor, o de otra banda, no.
    const deVinilo = (await cuentaCorriente(dePrensa))[0].deudas[0];
    await expect(saldarDeudas(delSur, e.a.id, [deVinilo.id], "")).rejects.toThrow(/no es tuya/);
    await expect(saldarDeudas(delSur, e.b.id, [cuentas[0].deudas[1].id], "")).rejects.toThrow(/no es tuya/);
  });
});

describe("el alcance del proveedor lo pone la base, no el código", () => {
  /** Corre `fn` como el proveedor Sur dentro de la banda A, y deshace todo al final. */
  async function comoSurEnA<T>(fn: (tx: Parameters<Parameters<typeof conCuentaExternaEnBanda>[3]>[0]) => Promise<T>) {
    let r: T | undefined;
    await conCuentaExternaEnBanda(delSur, tienda, e.a.id, async (tx) => {
      r = await fn(tx);
      throw new Error("deshacer");
    }).catch((x) => {
      if (x.message !== "deshacer") throw x;
    });
    return r as T;
  }
  /** Una sentencia dentro de un savepoint: cuántas filas tocó, o el error de la base. */
  async function probar(tx: { $executeRawUnsafe: (q: string) => Promise<number> }, sql: string): Promise<number | string> {
    await tx.$executeRawUnsafe("SAVEPOINT prueba");
    try {
      const n = await tx.$executeRawUnsafe(sql);
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT prueba");
      return n;
    } catch (x) {
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT prueba");
      return (x as Error).message.includes("row-level security") ? "rls" : "error";
    }
  }

  it("ninguna política de escritura queda abierta para una cuenta externa salvo las nombradas", async () => {
    // Toda política que deja escribir (INSERT/UPDATE/DELETE/ALL) depende de la banda fijada
    // (conTenant), del staff (conStaff), de la propia persona (conUsuario, su fila de `usuario`)
    // o es una de estas, pensadas para la cuenta externa.
    const PERMITIDAS = ["auditoria/externa_audita", "evento/externa_emite", "tienda_deuda/proveedor_actualiza", "tienda_orden/proveedor_actualiza"];
    const politicas = await dueno.$queryRaw<{ tabla: string; nombre: string; cmd: string; condicion: string }[]>`
      SELECT tablename AS tabla, policyname AS nombre, cmd, coalesce(qual, '') || ' ' || coalesce(with_check, '') AS condicion
      FROM pg_policies WHERE schemaname = 'public' AND cmd <> 'SELECT'`;
    const abiertas = politicas.filter(
      // ("false false": la que no deja pasar nada, p. ej. registro_pendiente.)
      (p) => !/app_tenant_id\(\)|app_es_staff\(\)|app_usuario_id\(\)/.test(p.condicion) && p.condicion !== "false false" && !PERMITIDAS.includes(`${p.tabla}/${p.nombre}`),
    );
    expect(abiertas.map((p) => `${p.tabla}/${p.nombre} (${p.cmd}): ${p.condicion}`)).toEqual([]);
    // Y las nombradas, solo en la banda fijada para la cuenta externa.
    for (const p of politicas.filter((x) => PERMITIDAS.includes(`${x.tabla}/${x.nombre}`))) expect(p.condicion).toContain("app_externo_tenant()");
  });

  it("dentro de una banda, no puede borrar ni modificar nada de ninguna tabla salvo sus órdenes y deudas", async () => {
    await pedidoPagado(e.a.id, "alc-1");
    await pedidoPagado(e.b.id, "alc-2");
    const tablas = (await dueno.$queryRaw<{ t: string; c: string }[]>`
      SELECT t.tablename AS t, (SELECT a.attname FROM pg_attribute a WHERE a.attrelid = ('public."' || t.tablename || '"')::regclass AND a.attnum = 1) AS c
      FROM pg_tables t WHERE t.schemaname = 'public' AND t.tablename <> '_prisma_migrations' ORDER BY 1`).filter((x) => x.c);
    const resultado = await comoSurEnA(async (tx) => {
      const r: Record<string, { borrar: number | string; tocar: number | string }> = {};
      for (const { t, c } of tablas) {
        r[t] = {
          borrar: await probar(tx, `DELETE FROM "${t}"`),
          tocar: await probar(tx, `UPDATE "${t}" SET "${c}" = "${c}"`),
        };
      }
      return r;
    });
    // Sin excepciones: también `usuario` (RLS + privilegios por columna).
    for (const [tabla, { borrar, tocar }] of Object.entries(resultado)) {
      expect(borrar, `${tabla}: borrar`).not.toSatisfy((x: number | string) => typeof x === "number" && x > 0);
      // Un UPDATE "sin cambios" en sus órdenes y deudas lo frena el disparador de columnas
      // (solo se despacha o se salda): en ninguna tabla una fila queda tocada.
      expect(tocar, `${tabla}: modificar`).not.toSatisfy((x: number | string) => typeof x === "number" && x > 0);
    }
    expect(resultado.tienda_orden.tocar).toBe("error"); // las ve (son suyas), pero no así
  });

  it("en sus propias filas: solo despachar y saldar, una vez; nada de otro proveedor ni de otra banda", async () => {
    await pedidoPagado(e.a.id, "alc-3");
    await pedidoPagado(e.b.id, "alc-4");
    const suya = await dueno.tiendaOrden.findFirstOrThrow({ where: { tenantId: e.a.id, proveedorId: sur.id } });
    const ajena = await dueno.tiendaOrden.findFirstOrThrow({ where: { tenantId: e.a.id, proveedorId: prensa.id } });
    const deB = await dueno.tiendaOrden.findFirstOrThrow({ where: { tenantId: e.b.id, proveedorId: sur.id } });
    const deuda = await dueno.tiendaDeuda.findFirstOrThrow({ where: { tenantId: e.a.id, proveedorId: sur.id } });
    const pedido = await dueno.tiendaPedido.findFirstOrThrow({ where: { tenantId: e.a.id } });
    const r = await comoSurEnA(async (tx) => ({
      otraColumna: await probar(tx, `UPDATE tienda_orden SET "bandaNombre" = 'X' WHERE id = '${suya.id}'`),
      sinDespacharASuNombre: await probar(tx, `UPDATE tienda_orden SET estado = 'DESPACHADO', "despachadoPor" = '${e.multi.id}' WHERE id = '${suya.id}'`),
      despacharLaAjena: await probar(tx, `UPDATE tienda_orden SET estado = 'DESPACHADO', "despachadoPor" = '${delSur}' WHERE id = '${ajena.id}'`),
      despacharLaDeB: await probar(tx, `UPDATE tienda_orden SET estado = 'DESPACHADO', "despachadoPor" = '${delSur}' WHERE id = '${deB.id}'`),
      despacharLaSuya: await probar(tx, `UPDATE tienda_orden SET estado = 'DESPACHADO', "despachadoPor" = '${delSur}', seguimiento = 'AR1' WHERE id = '${suya.id}'`),
      cambiarElMonto: await probar(tx, `UPDATE tienda_deuda SET total = 1 WHERE id = '${deuda.id}'`),
      saldar: await probar(tx, `UPDATE tienda_deuda SET "saldadaEn" = now(), "saldadaPor" = '${delSur}' WHERE id = '${deuda.id}'`),
      tocarElPedido: await probar(tx, `UPDATE tienda_pedido SET estado = 'CANCELADO' WHERE id = '${pedido.id}'`),
      crearProducto: await probar(tx, `INSERT INTO tienda_config (id, "tenantId") VALUES (gen_random_uuid(), '${e.a.id}')`),
      emitirEnB: await probar(tx, `INSERT INTO evento (id, nombre, "tenantId", payload, "usuarioId") VALUES (gen_random_uuid(), 'pedido.pagado', '${e.b.id}', '{}', '${delSur}')`),
      emitirAOtroNombre: await probar(tx, `INSERT INTO evento (id, nombre, "tenantId", payload, "usuarioId") VALUES (gen_random_uuid(), 'pedido.pagado', '${e.a.id}', '{}', '${e.multi.id}')`),
      auditarAOtroNombre: await probar(tx, `INSERT INTO auditoria (id, accion, "tenantId", "usuarioId", detalle) VALUES (gen_random_uuid(), 'x', '${e.a.id}', '${e.multi.id}', '{}')`),
      leeMiembros: (await tx.membresia.count()) + (await tx.secreto.count()) + (await tx.correo.count()) + (await tx.tenant.count()),
    }));
    expect(r).toEqual({
      otraColumna: "error",
      sinDespacharASuNombre: "error",
      despacharLaAjena: 0,
      despacharLaDeB: 0,
      despacharLaSuya: 1,
      cambiarElMonto: "error",
      saldar: 1,
      tocarElPedido: 0,
      crearProducto: "rls",
      emitirEnB: "rls",
      emitirAOtroNombre: "rls",
      auditarAOtroNombre: "rls",
      leeMiembros: 0,
    });
  });

  it("no entra a una banda donde no tiene nada, y solo firma los diseños de sus renglones", async () => {
    await pedidoPagado(e.a.id, "alc-5");
    await expect(conCuentaExternaEnBanda(delSur, tienda, e.b.id, async () => 1)).rejects.toThrow(/no tiene nada en esa banda/);
    const usado = await dueno.tiendaDiseno.findFirstOrThrow({ where: { tenantId: e.a.id } });
    const suelto = await subirDiseno(e.a.id, "Sin usar", { nombre: "suelto.png", datos: await png(4200, 5000) });
    const firmar = (archivoId: string) =>
      conCuentaExternaEnBanda(delSur, tienda, e.a.id, (tx) => urlFirmada(tienda, e.a.id, archivoId, { tx }));
    await expect(firmar(usado.archivoId)).resolves.toMatch(/\/descargas\//);
    await expect(firmar(suelto.archivoId)).rejects.toThrow(/no es de este módulo en esta banda/);
  });
});
