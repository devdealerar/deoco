import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { conStaffComo, leerComoStaffComo } from "@/nucleo/acceso/staff";
import { atenderAvisoPlataforma } from "@/nucleo/avisos";
import { bandejaDeSalida, esperarCorreos, vaciarBandeja } from "@/nucleo/correo";
import { prisma } from "@/nucleo/db/cliente";
import { formatearPesos } from "@/nucleo/dinero";
import { avanzarCompras, esperarCompras, pedirDevoluciones } from "@/nucleo/dominios/compra";
import type { Contacto } from "@/nucleo/dominios/registrador";
import { cotizarDominio, pagarDominio, type PedidoDominio } from "@/nucleo/dominios/venta";
import type { ComoStaff } from "../modulos/comercial/cuenta";
import { alertasDeDominios, esperarDominios, guardarPrecioDominio, marcarDevueltaAMano, revisarDominios } from "../modulos/comercial/dominios";
import { dosBandas, dueno } from "./apoyo";
import { CloudflareFalso } from "./cloudflare-falso";
import { MercadoPagoFalso } from "./mercadopago-falso";
import { RegistradorFalso } from "./registrador-falso";

// D9: el cobro de los dominios en el gestor (módulo comercial), con la cuenta de Mercado Pago de
// Deoco. Primero se cobra, después se registra; lo que no se registra se devuelve solo; la plata
// de los dominios no se mezcla con la de la cuota.

process.env.DEOCO_DOMINIO_RAIZ = "deocoartist.com";
const mp = new MercadoPagoFalso();
const cf = new CloudflareFalso();
const gd = new RegistradorFalso();
const TOKEN_DEOCO = "APP_USR-DEOCO-cuenta-de-la-plataforma";
const MIN = 60_000;
const HORA = 60 * MIN;
let a: { id: string };
let ua: { id: string };
let comoStaff: ComoStaff;
let staffId: string;

const titular: Contacto = {
  nombre: "Ana",
  apellido: "Pérez",
  email: "ana@lossatelites.com",
  telefono: "+54.1145678900",
  direccion: "Av. Corrientes 1234",
  ciudad: "CABA",
  provincia: "Buenos Aires",
  codigoPostal: "C1043",
  pais: "AR",
};
const pedido = (extra: Partial<PedidoDominio> = {}): PedidoDominio => ({
  dominio: "lossatelites.com",
  anios: 1,
  contacto: { ...titular },
  aceptacion: { fecha: new Date("2026-10-15T12:00:00Z"), ip: "203.0.113.7", claves: ["DNRA"] },
  hacerPrincipal: true,
  ...extra,
});

const aviso = (pagoId: string, ruta = "/dominio/mercadopago") =>
  atenderAvisoPlataforma(
    new Request(`http://app.deocoartist.com/avisos/plataforma/comercial${ruta}`, {
      method: "POST",
      body: JSON.stringify({ type: "payment", data: { id: pagoId } }),
      headers: { "content-type": "application/json" },
    }),
    { moduloId: "comercial", path: ruta },
  );

const esperar = async () => {
  for (let i = 0; i < 3; i++) {
    await esperarCompras();
    await esperarDominios();
  }
  await esperarCorreos();
};
const ultimaPreferencia = () => mp.preferencias.at(-1)!;
const compras = () => dueno.dominioCompra.findMany({ where: { tenantId: a.id } });
const pagos = () => dueno.comercialDominioPago.findMany({ where: { tenantId: a.id }, orderBy: { creadoEn: "asc" } });
const DEVUELTO = `Te devolvimos ${formatearPesos(2_500_000)} por lossatelites.com`;
const asuntos = () => bandejaDeSalida().map((m) => m.asunto);
/** Paga la última preferencia y avisa (como haría Mercado Pago). */
async function pagarYAvisar(opciones: Parameters<MercadoPagoFalso["pagar"]>[1] = {}) {
  const id = mp.pagar(ultimaPreferencia().id, opciones);
  expect((await aviso(id)).status).toBe(200);
  await esperar();
  return id;
}

beforeAll(async () => {
  ({ a, ua } = await dosBandas());
  await mp.iniciar();
  await cf.iniciar();
  await gd.iniciar();
  process.env.DEOCO_MERCADOPAGO_API = mp.base;
  process.env.DEOCO_CUOTA_MP_TOKEN = TOKEN_DEOCO;
  const staff = await dueno.usuario.create({ data: { email: "staff@deocoartist.com", nombre: "Staff", hashContrasena: "x", esStaff: true } });
  staffId = staff.id;
  comoStaff = (accion, fn) => conStaffComo(staffId, accion, fn);
});
beforeEach(async () => {
  await esperar();
  for (const t of ["comercialDominioPago", "comercialDominioCobro", "comercialDominioPrecio", "comercialCobro", "dominioCompra", "registradorCliente", "auditoria", "correo"] as const) {
    await (dueno[t] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await dueno.dominio.deleteMany({ where: { NOT: { dominio: { endsWith: ".deocoartist.com" } } } });
  vaciarBandeja();
  mp.limpiar();
  cf.limpiar();
  cf.usar();
  gd.limpiar();
  gd.usar();
  await guardarPrecioDominio(comoStaff, { tld: "com", precio: 2_500_000, aLaVenta: true });
});
afterAll(async () => {
  await esperar();
  await Promise.all([mp.cerrar(), cf.cerrar(), gd.cerrar()]);
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("precio y cotización", () => {
  it("el precio sale de la terminación por año; sin precio o fuera de venta, no se vende", async () => {
    expect(await cotizarDominio(a.id, "LosSatelites.com", 2)).toEqual({ dominio: "lossatelites.com", disponible: true, precio: 5_000_000, anios: 2 });
    expect(await cotizarDominio(a.id, "lossatelites.net")).toMatchObject({ disponible: true, precio: null });
    await guardarPrecioDominio(comoStaff, { tld: "com", precio: 2_500_000, aLaVenta: false });
    expect(await cotizarDominio(a.id, "lossatelites.com")).toMatchObject({ disponible: true, precio: null });
    await expect(pagarDominio(a.id, ua.id, pedido())).rejects.toThrow(/no se venden/);
    gd.tomados.add("tomado.com");
    expect(await cotizarDominio(a.id, "tomado.com")).toEqual({ dominio: "tomado.com", disponible: false });
    await expect(guardarPrecioDominio(comoStaff, { tld: "com", precio: 0, aLaVenta: true })).rejects.toThrow(/mayor que cero/);
    await expect(guardarPrecioDominio(comoStaff, { tld: "no válido!", precio: 100, aLaVenta: true })).rejects.toThrow(/Terminación/);
  });

  it("se vuelve a mirar la disponibilidad justo antes de cobrar", async () => {
    gd.tomados.add("lossatelites.com");
    await expect(pagarDominio(a.id, ua.id, pedido())).rejects.toThrow(/ya no está disponible/);
    expect(mp.preferencias).toHaveLength(0);
    expect(await dueno.comercialDominioCobro.count()).toBe(0);
  });
});

describe("primero se cobra, después se registra", () => {
  it("el cobro: Checkout Pro de Deoco, solo medios inmediatos, vence, aviso propio (no el de la cuota)", async () => {
    const r = await pagarDominio(a.id, ua.id, pedido());
    expect(r).toMatchObject({ monto: 2_500_000 });
    expect(r.redireccion).toContain(mp.base);
    const pref = ultimaPreferencia();
    expect(pref.token).toBe(TOKEN_DEOCO); // la cuenta de Deoco, no la de la banda
    const cobro = await dueno.comercialDominioCobro.findFirstOrThrow();
    expect(pref.cuerpo).toMatchObject({
      binary_mode: true,
      payment_methods: { excluded_payment_types: [{ id: "ticket" }, { id: "atm" }, { id: "bank_transfer" }] },
      expires: true,
      external_reference: `dominio:${a.id}:${cobro.id}`,
      notification_url: expect.stringMatching(/^https?:\/\/app\.deocoartist\.com(:\d+)?\/avisos\/plataforma\/comercial\/dominio\/mercadopago$/),
      items: [{ title: "Dominio lossatelites.com · 1 año", quantity: 1, unit_price: 25000, currency_id: "ARS" }],
      payer: { email: "a@x.com" },
      back_urls: { success: expect.stringMatching(/\/b\/banda-a\/dominios\?pago=hecho$/) },
    });
    const vence = new Date(String(pref.cuerpo.expiration_date_to)).getTime() - Date.now();
    expect(vence).toBeGreaterThan(HORA);
    expect(vence).toBeLessThanOrEqual(2 * HORA);
    expect(cobro).toMatchObject({ estado: "esperando", monto: 2_500_000, clave: "alta:lossatelites.com", preferenciaId: pref.id });
    // Todavía no se registró nada: ni compra ni pedido al registrador.
    expect(await compras()).toHaveLength(0);
    // Al registrador solo se le preguntó si está libre (GET): ninguna escritura.
    expect(gd.pedidos.filter((p) => p.metodo !== "GET")).toHaveLength(0);
  });

  it("rechazado: no se registra nada; aprobado: arranca la compra, una sola vez aunque el aviso se repita", async () => {
    await pagarDominio(a.id, ua.id, pedido());
    const rechazado = await pagarYAvisar({ aprobado: false });
    expect(await compras()).toHaveLength(0);
    expect(gd.pedidos.filter((p) => p.metodo !== "GET")).toHaveLength(0);
    expect(await pagos()).toMatchObject([{ pagoId: rechazado, estado: "rechazado", entrega: null, devolucion: null }]);
    expect((await dueno.comercialDominioCobro.findFirstOrThrow()).estado).toBe("esperando");

    const aprobado = await pagarYAvisar();
    expect(await compras()).toMatchObject([{ dominio: "lossatelites.com", cobroId: aprobado, monto: 2_500_000, contacto: titular, hacerPrincipal: true, usuarioId: ua.id }]);
    expect(await dueno.comercialDominioCobro.findFirstOrThrow()).toMatchObject({ estado: "pagado", pagoId: aprobado });
    expect((await pagos())[1]).toMatchObject({ pagoId: aprobado, estado: "aprobado", entrega: "hecha", medio: "credit_card" });

    // El mismo aviso otra vez (Mercado Pago reintenta): nada nuevo.
    expect((await aviso(aprobado)).status).toBe(200);
    await esperar();
    expect(await compras()).toHaveLength(1);
    expect(await pagos()).toHaveLength(2);
    expect(mp.devoluciones).toHaveLength(0);
  });

  it("el aviso se perdió: el barrido busca los pagos del cobro y arranca la compra igual", async () => {
    await pagarDominio(a.id, ua.id, pedido());
    const id = mp.pagar(ultimaPreferencia().id);
    await revisarDominios(new Date(Date.now() + 5 * MIN));
    await esperar();
    expect(await compras()).toMatchObject([{ cobroId: id }]);
    // Un día después de vencer sin pagar, se deja de buscar.
    await pagarDominio(a.id, ua.id, pedido({ dominio: "otro.com" }));
    await revisarDominios(new Date(Date.now() + 27 * HORA));
    expect(await dueno.comercialDominioCobro.findFirstOrThrow({ where: { dominio: "otro.com" } })).toMatchObject({ estado: "sin-pagar" });
  });

  it("el cuerpo del aviso no se cree (se consulta el pago) y la firma se verifica", async () => {
    await pagarDominio(a.id, ua.id, pedido());
    expect((await aviso("999999")).status).toBe(500); // un pago que no existe en la pasarela: error, Mercado Pago reintenta
    process.env.DEOCO_CUOTA_MP_SECRETO_AVISOS = "secreto-de-deoco";
    try {
      const id = mp.pagar(ultimaPreferencia().id);
      expect((await aviso(id)).status).toBe(401);
      expect(await compras()).toHaveLength(0);
    } finally {
      delete process.env.DEOCO_CUOTA_MP_SECRETO_AVISOS;
    }
  });
});

describe("la plata de los dominios no se mezcla con la de la cuota", () => {
  it("otras filas, otro aviso: el pago de un dominio no toca la cuota ni la cuenta de la banda", async () => {
    await pagarDominio(a.id, ua.id, pedido());
    const id = mp.pagar(ultimaPreferencia().id);
    // Llega al aviso de la cuota (p. ej. si alguien configuró los pagos ahí): se ignora.
    expect((await aviso(id, "/cuota/mercadopago")).status).toBe(200);
    await esperar();
    expect(await compras()).toHaveLength(0);
    expect(await dueno.comercialCobro.count()).toBe(0);
    expect(await pagos()).toHaveLength(0);
    // Por su aviso, sí.
    expect((await aviso(id)).status).toBe(200);
    await esperar();
    expect(await compras()).toHaveLength(1);
    expect(await dueno.comercialCobro.count()).toBe(0);
    expect(await dueno.comercialCuenta.count({ where: { tenantId: a.id } })).toBe(0);
    expect((await dueno.tenant.findUniqueOrThrow({ where: { id: a.id } })).estado).toBe("ACTIVO");
  });
});

describe("devoluciones automáticas", () => {
  it("alguien lo registró en el medio: la compra falla sin registrar y el pago se devuelve entero", async () => {
    await pagarDominio(a.id, ua.id, pedido());
    gd.tomados.add("lossatelites.com");
    const id = await pagarYAvisar();
    expect(await compras()).toMatchObject([{ estado: "fallido", motivo: "no-disponible", devolucion: "pedida" }]);
    expect(await pagos()).toMatchObject([{ pagoId: id, entrega: "hecha", devolucion: "hecha", devolucionMotivo: "Alguien registró lossatelites.com antes" }]);
    expect(mp.devoluciones).toMatchObject([{ pagoId: id, status: "approved" }]);
    expect(await dueno.comercialDominioCobro.findFirstOrThrow()).toMatchObject({ estado: "devuelto" });
    expect(asuntos()).toEqual(expect.arrayContaining(["No pudimos registrar lossatelites.com", DEVUELTO]));
    // Devuelto, la banda puede volver a intentar con el mismo dominio (cuando se libere).
    gd.tomados.delete("lossatelites.com");
    await pagarDominio(a.id, ua.id, pedido());
    await pagarYAvisar();
    expect((await compras()).filter((c) => c.estado !== "fallido")).toHaveLength(1);
  });

  it("un pago de más (el mismo cobro dos veces, u otro cobro de lo mismo) o de otro monto: se devuelve, no se registra dos veces", async () => {
    await pagarDominio(a.id, ua.id, pedido());
    const pref = ultimaPreferencia().id;
    const bueno = await pagarYAvisar();
    const repetido = mp.pagar(pref);
    await aviso(repetido);
    // Otro cobro del mismo dominio, creado antes de que el primero se pagara: también pagado.
    await dueno.comercialDominioCobro.updateMany({ data: { estado: "esperando", pagoId: null } });
    await pagarDominio(a.id, ua.id, pedido());
    await dueno.comercialDominioCobro.updateMany({ where: { pagoId: null, preferenciaId: pref }, data: { estado: "pagado", pagoId: bueno } });
    const otroCobro = await pagarYAvisar();
    await esperar();
    expect(await compras()).toHaveLength(1);
    const p = await pagos();
    expect(p.find((x) => x.pagoId === repetido)).toMatchObject({ entrega: null, devolucion: "hecha", devolucionMotivo: "Pago repetido del mismo cobro" });
    expect(p.find((x) => x.pagoId === otroCobro)).toMatchObject({ entrega: null, devolucion: "hecha", devolucionMotivo: "lossatelites.com ya estaba pago (otro cobro)" });
    expect(mp.devoluciones.map((d) => d.pagoId).sort()).toEqual([otroCobro, repetido].sort());

    // Monto distinto (alguien tocó la preferencia): no se registra y se devuelve.
    await pagarDominio(a.id, ua.id, pedido({ dominio: "nuevo.com" }));
    const raro = await pagarYAvisar({ monto: 100 });
    expect((await pagos()).find((x) => x.pagoId === raro)).toMatchObject({ entrega: null, devolucion: "hecha" });
    expect((await pagos()).find((x) => x.pagoId === raro)!.devolucionMotivo).toMatch(/^El monto no coincide/);
    expect(await compras()).toHaveLength(1);
  });

  it("si la devolución falla, se reintenta y a los 3 intentos queda a la vista del staff; nunca se devuelve dos veces", async () => {
    await pagarDominio(a.id, ua.id, pedido());
    gd.tomados.add("lossatelites.com");
    mp.devolucionResponde = { estado: 400, cuerpo: { message: "insufficient_balance" } };
    const id = await pagarYAvisar();
    const leer = <T,>(fn: Parameters<typeof leerComoStaffComo<T>>[1]) => leerComoStaffComo(staffId, fn);
    expect(await pagos()).toMatchObject([{ devolucion: "pendiente", devolucionIntentos: 1 }]);
    expect((await pagos())[0].devolucionError).toMatch(/insufficient_balance/);
    // Reintentos con espera creciente (5 min, 30 min…): al tercero, fallida.
    await revisarDominios(new Date(Date.now() + 6 * MIN));
    await revisarDominios(new Date(Date.now() + 40 * MIN));
    expect(await pagos()).toMatchObject([{ devolucion: "fallida", devolucionIntentos: 3 }]);
    expect(await alertasDeDominios(leer)).toEqual(
      expect.arrayContaining([{ texto: "Una devolución de un dominio no sale: hay que devolver la plata.", href: "/admin/m/comercial/dominios" }]),
    );
    // Fallida se sigue reintentando: cuando la cuenta tiene saldo, sale.
    mp.devolucionResponde = "approved";
    await revisarDominios(new Date(Date.now() + 3 * HORA));
    await esperar();
    expect(await pagos()).toMatchObject([{ devolucion: "hecha" }]);
    expect(mp.devoluciones).toHaveLength(1);
    expect(mp.devoluciones[0]).toMatchObject({ pagoId: id });
    expect(await alertasDeDominios(leer)).toEqual([]);
    // Ya devuelta: otra vuelta no pide nada.
    await revisarDominios(new Date(Date.now() + 24 * HORA));
    expect(mp.devoluciones).toHaveLength(1);
  });

  it("una devolución en proceso se consulta hasta que termina", async () => {
    await pagarDominio(a.id, ua.id, pedido());
    gd.tomados.add("lossatelites.com");
    mp.devolucionResponde = "in_process";
    const id = await pagarYAvisar();
    expect(await pagos()).toMatchObject([{ devolucion: "en-proceso" }]);
    expect(asuntos()).not.toContain(DEVUELTO);
    await revisarDominios(new Date(Date.now() + 31 * MIN));
    expect(await pagos()).toMatchObject([{ devolucion: "en-proceso" }]);
    mp.terminarDevolucion(id);
    await revisarDominios(new Date(Date.now() + 62 * MIN));
    await esperar();
    expect(await pagos()).toMatchObject([{ devolucion: "hecha" }]);
    expect(asuntos()).toContain(DEVUELTO);
  });

  it("el staff la puede marcar devuelta a mano, siempre con la nota de cómo", async () => {
    await pagarDominio(a.id, ua.id, pedido());
    gd.tomados.add("lossatelites.com");
    mp.devolucionResponde = { estado: 400, cuerpo: { message: "too_old" } };
    await pagarYAvisar();
    const [p] = await pagos();
    await expect(marcarDevueltaAMano(comoStaff, a.id, p.id, "")).rejects.toThrow(/Contá cómo/);
    await marcarDevueltaAMano(comoStaff, a.id, p.id, "Transferencia del 16/10 al CBU de la banda");
    expect(await pagos()).toMatchObject([{ devolucion: "a-mano", devolucionNota: "Transferencia del 16/10 al CBU de la banda" }]);
    expect(await dueno.auditoria.count({ where: { accion: "comercial.devolucion_a_mano" } })).toBe(1);
    await revisarDominios(new Date(Date.now() + 24 * HORA));
    expect(mp.devoluciones).toHaveLength(0);
  });

  it("si la compra no puede arrancar en un día, el pago se devuelve; la devolución que el gestor no anotó sigue pendiente", async () => {
    await pagarDominio(a.id, ua.id, pedido());
    const registrador = process.env.DEOCO_REGISTRADOR;
    delete process.env.DEOCO_REGISTRADOR; // la compra no arranca (p. ej. una configuración rota)
    try {
      await pagarYAvisar();
      expect(await pagos()).toMatchObject([{ entrega: "pendiente", entregaIntentos: 1 }]);
      expect(await compras()).toHaveLength(0);
      await revisarDominios(new Date(Date.now() + 25 * HORA));
      await esperar();
      expect(await pagos()).toMatchObject([{ entrega: null, devolucion: "hecha" }]);
      expect((await pagos())[0].devolucionMotivo).toMatch(/^No se pudo arrancar la compra/);
    } finally {
      process.env.DEOCO_REGISTRADOR = registrador;
    }
    // Una compra fallida cuyo pago el gestor no conoce: queda pendiente (y a la vista), no se pierde.
    await dueno.dominioCompra.create({
      data: { tenantId: a.id, tipo: "alta", dominio: "x.com", registrador: "godaddy", cobroId: "desconocido", monto: 1, estado: "fallido", paso: "registrar", devolucion: "pendiente" },
    });
    expect(await pedirDevoluciones()).toBe(0);
    expect(await dueno.dominioCompra.findFirstOrThrow({ where: { cobroId: "desconocido" } })).toMatchObject({ devolucion: "pendiente" });
  });
});

describe("un cobro ya pagado", () => {
  it("no se puede volver a cobrar lo mismo mientras esté pagado", async () => {
    await pagarDominio(a.id, ua.id, pedido());
    await pagarYAvisar();
    // El registrador todavía lo da libre (la compra está en curso): igual no se cobra otra vez.
    await expect(pagarDominio(a.id, ua.id, pedido())).rejects.toThrow(/ya está pago/);
    await avanzarCompras(a.id);
  });
});
