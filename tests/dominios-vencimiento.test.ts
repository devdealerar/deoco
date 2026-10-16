import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { conStaffComo } from "@/nucleo/acceso/staff";
import { atenderAvisoPlataforma } from "@/nucleo/avisos";
import { barrer } from "@/nucleo/barrido";
import { bandejaDeSalida, esperarCorreos, vaciarBandeja } from "@/nucleo/correo";
import { prisma } from "@/nucleo/db/cliente";
import { dominiosDeBanda } from "@/nucleo/dominios";
import { avanzarCompras, cambiarTitularRegistral, dominioPagado, esperarCompras } from "@/nucleo/dominios/compra";
import type { Contacto } from "@/nucleo/dominios/registrador";
import { seguimientoDeCompras } from "@/nucleo/dominios/seguimiento";
import { pedirCodigoDeTransferencia, revisarTransferencias } from "@/nucleo/dominios/transferencia";
import { avisoQueToca, dominiosPorVencerEnPanel, fijarVencimiento, revisarVencimientos } from "@/nucleo/dominios/vencimiento";
import { pagarRenovacion } from "@/nucleo/dominios/venta";
import type { ComoStaff } from "../modulos/comercial/cuenta";
import { esperarDominios, guardarPrecioDominio } from "../modulos/comercial/dominios";
import { dosBandas, dueno } from "./apoyo";
import { CloudflareFalso } from "./cloudflare-falso";
import { MercadoPagoFalso } from "./mercadopago-falso";
import { RegistradorFalso } from "./registrador-falso";
import comercial from "../modulos/comercial";

// D11: renovación y salida de los dominios comprados. Calendario de avisos, renovar pagando,
// vencer (vuelta al subdominio, gracia, pérdida), llevárselo con el código y cambiar el titular.

process.env.DEOCO_DOMINIO_RAIZ = "deocoartist.com";
const mp = new MercadoPagoFalso();
const cf = new CloudflareFalso();
const gd = new RegistradorFalso();
const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
let a: { id: string };
let ua: { id: string };
let comoStaff: ComoStaff;

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

const esperar = async () => {
  for (let i = 0; i < 3; i++) {
    await esperarCompras();
    await esperarDominios();
  }
  await esperarCorreos();
};
const asuntos = () => bandejaDeSalida().map((m) => m.asunto);
const fila = () => dueno.dominio.findFirstOrThrow({ where: { tenantId: a.id, dominio: "lossatelites.com" } });
const avanzar = (ms: number) => avanzarCompras(a.id, new Date(Date.now() + ms));

function aviso(pagoId: string) {
  return atenderAvisoPlataforma(
    new Request("http://app.deocoartist.com/avisos/plataforma/comercial/dominio/mercadopago", {
      method: "POST",
      body: JSON.stringify({ type: "payment", data: { id: pagoId } }),
      headers: { "content-type": "application/json" },
    }),
    { moduloId: "comercial", path: "/dominio/mercadopago" },
  );
}

/** Un dominio comprado y listo (registrado, zona activa), como principal. */
async function comprado() {
  await dominioPagado(comercial, a.id, {
    dominio: "lossatelites.com",
    anios: 1,
    contacto: { ...titular },
    aceptacion: { fecha: new Date(), ip: "203.0.113.7", claves: ["DNRA"] },
    hacerPrincipal: true,
    cobro: { id: "cobro-alta", monto: 2_500_000 },
    usuarioId: ua.id,
  });
  await esperar();
  gd.terminar("REGISTER");
  await avanzar(2 * MIN);
  gd.terminar();
  await avanzar(4 * MIN);
  cf.activarZona("lossatelites.com");
  await barrer({ ahora: new Date(Date.now() + 20 * MIN) });
  await avanzar(40 * MIN);
  await esperar();
  expect(await dueno.dominioCompra.findFirstOrThrow({ where: { tipo: "alta" } })).toMatchObject({ estado: "listo" });
  vaciarBandeja();
  return fila();
}

/** Renovar pagando con Mercado Pago (cuenta de Deoco) y que GoDaddy lo haga. */
async function renovarPagando() {
  await pagarRenovacion(a.id, ua.id, "lossatelites.com");
  const id = mp.pagar(mp.preferencias.at(-1)!.id);
  expect((await aviso(id)).status).toBe(200);
  await esperar();
  gd.terminar("RENEW");
  await avanzar(2 * MIN);
  await esperar();
  return id;
}

beforeAll(async () => {
  ({ a, ua } = await dosBandas());
  await Promise.all([mp.iniciar(), cf.iniciar(), gd.iniciar()]);
  process.env.DEOCO_MERCADOPAGO_API = mp.base;
  process.env.DEOCO_CUOTA_MP_TOKEN = "APP_USR-DEOCO";
  const staff = await dueno.usuario.create({ data: { email: "staff@deocoartist.com", nombre: "Staff", hashContrasena: "x", esStaff: true } });
  comoStaff = (accion, fn) => conStaffComo(staff.id, accion, fn);
});
beforeEach(async () => {
  await esperar();
  for (const t of ["comercialDominioPago", "comercialDominioCobro", "comercialDominioPrecio", "dominioCompra", "registradorCliente", "zonaSaliente", "auditoria", "correo"] as const) {
    await (dueno[t] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await dueno.dominio.deleteMany({ where: { NOT: { dominio: { endsWith: ".deocoartist.com" } } } });
  await dueno.dominio.updateMany({ where: { dominio: { endsWith: ".deocoartist.com" } }, data: { esPrincipal: true } });
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

describe("lo que la tarjeta muestra siempre", () => {
  it("dónde está registrado, quién lo renueva y cuándo vence, quién maneja el DNS", async () => {
    const d = await comprado();
    expect(d.venceEn).toBeInstanceOf(Date);
    const lista = await dominiosDeBanda(a.id);
    const c = lista.find((x) => x.dominio === "lossatelites.com")!;
    expect(c.renglones.registro).toBe("En Deoco (GoDaddy), a nombre de Ana Pérez");
    expect(c.renglones.renueva).toMatch(/^Deoco, cuando pagás la renovación · vence el \d+ de \w+ de \d{4}$/);
    expect(c.renglones.dns).toBe("Deoco (Cloudflare)");
    expect(c.titular).toMatchObject({ nombre: "Ana", email: "ana@lossatelites.com" });
    expect(lista.find((x) => x.dominio === "banda-a.deocoartist.com")!.renglones).toEqual({ registro: "Es el subdominio de Deoco", renueva: "No vence", dns: "Deoco" });
  });
});

describe("calendario de avisos", () => {
  it("45, 30, 15, 7, 3 y 1 día antes: un mail cada vez (nunca dos), y desde los 30 en el panel", async () => {
    expect([46, 45, 31, 30, 16, 15, 8, 7, 4, 3, 2, 1, 0].map(avisoQueToca)).toEqual([null, 45, 45, 30, 30, 15, 15, 7, 7, 3, 3, 1, null]);
    const d = await comprado();
    const antes = (dias: number) => new Date(d.venceEn!.getTime() - dias * DIA + HORA);
    await revisarVencimientos(antes(50));
    await esperar();
    expect(asuntos()).toEqual([]);
    for (const dias of [44, 40, 29, 14, 6, 3, 1]) await revisarVencimientos(antes(dias));
    await esperar();
    const fecha = d.venceEn!.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" });
    expect(asuntos()).toEqual([
      `lossatelites.com vence el ${fecha}`,
      `lossatelites.com vence el ${fecha}`,
      `lossatelites.com vence el ${fecha}`,
      "lossatelites.com vence en 6 días",
      "lossatelites.com vence en 3 días",
      "lossatelites.com vence mañana",
    ]);
    const textos = bandejaDeSalida().map((m) => m.texto);
    expect(textos[0]).toContain("Renovalo desde Dominios por $");
    expect(textos[0]).not.toContain("deja de verse"); // lo que se pierde, desde los 15 días
    expect(textos[2]).toContain("deja de verse en lossatelites.com");
    expect(textos[5]).toContain("tenés 30 días para renovarlo al mismo precio");
    expect(await dominiosPorVencerEnPanel(a.id, antes(40))).toEqual([]);
    expect(await dominiosPorVencerEnPanel(a.id, antes(29))).toMatchObject([{ dominio: "lossatelites.com", dias: 29, comprado: true }]);
  });

  it("un delegado con la fecha que cargó la banda: los mismos avisos, a renovar en su registrador", async () => {
    const d = await dueno.dominio.create({ data: { tenantId: a.id, dominio: "otra.com.ar", via: "zona", verificado: true } });
    const vence = new Date(Date.now() + 20 * DIA);
    await fijarVencimiento(ua.id, a.id, d.id, vence);
    await revisarVencimientos();
    await esperar();
    expect(bandejaDeSalida()[0].texto).toContain("Se renueva en nic.ar: Deoco no lo puede renovar por vos.");
    expect((await dominiosDeBanda(a.id)).find((x) => x.dominio === "otra.com.ar")!.renglones).toMatchObject({ registro: "En NIC Argentina, a tu nombre", renueva: expect.stringMatching(/^Vos, en nic\.ar · vence el .* \(lo cargaste vos\)$/) });
    await expect(fijarVencimiento(ua.id, a.id, d.id, new Date(Date.now() - 5 * DIA))).rejects.toThrow(/no parece un vencimiento/);
    await fijarVencimiento(ua.id, a.id, d.id, null);
    expect((await dueno.dominio.findUniqueOrThrow({ where: { id: d.id } })).venceEn).toBeNull();
    const c = await comprado();
    await expect(fijarVencimiento(ua.id, a.id, c.id, vence)).rejects.toThrow(/lo informa el registrador/);
  });
});

describe("renovar", () => {
  it("paga la renovación y Deoco renueva: el vencimiento pasa un año; dos veces el mismo año, no", async () => {
    const d = await comprado();
    await renovarPagando();
    const despues = await fila();
    expect(despues.venceEn!.getUTCFullYear()).toBe(d.venceEn!.getUTCFullYear() + 1);
    expect(asuntos()).toEqual(expect.arrayContaining(["Recibimos tu pago: estamos renovando lossatelites.com", "Renovamos lossatelites.com"]));
    expect((await seguimientoDeCompras(a.id))[0]).toMatchObject({ tipo: "renovacion", enCurso: false, tono: "exito" });
    // Pagar en curso: no se puede pedir otra.
    await pagarRenovacion(a.id, ua.id, "lossatelites.com");
    const id = mp.pagar(mp.preferencias.at(-1)!.id);
    await aviso(id);
    await esperar();
    await expect(pagarRenovacion(a.id, ua.id, "lossatelites.com")).rejects.toThrow(/ya está paga/);
  });

  it("si no se puede renovar en 24 h (ya no está en la subcuenta), se devuelve el pago", async () => {
    await comprado();
    await pagarRenovacion(a.id, ua.id, "lossatelites.com");
    const id = mp.pagar(mp.preferencias.at(-1)!.id);
    gd.dominios.delete("lossatelites.com");
    await aviso(id);
    await esperar();
    await dueno.dominioCompra.updateMany({ where: { tipo: "renovacion" }, data: { primerFalloEn: new Date(Date.now() - 25 * HORA) } });
    await avanzar(7 * HORA);
    await esperar();
    expect(await dueno.dominioCompra.findFirstOrThrow({ where: { tipo: "renovacion" } })).toMatchObject({ estado: "fallido", devolucion: "pedida" });
    expect(await dueno.comercialDominioPago.findFirstOrThrow({ where: { pagoId: id } })).toMatchObject({ devolucion: "hecha" });
    expect(asuntos()).toContain("No pudimos renovar lossatelites.com");
  });
});

describe("vencer sin renovar", () => {
  it("vuelve al subdominio y nada se borra; en la gracia se renueva y vuelve a ser el principal", async () => {
    const d = await comprado();
    expect(d.esPrincipal).toBe(true);
    const vencido = new Date(d.venceEn!.getTime() + DIA);
    expect(await revisarVencimientos(vencido)).toMatchObject({ vencidos: 1 });
    await esperar();
    expect(await fila()).toMatchObject({ vencidoEn: vencido, vencidoEraPrincipal: true, esPrincipal: false });
    expect((await dueno.dominio.findFirstOrThrow({ where: { tenantId: a.id, esPrincipal: true } })).dominio).toBe("banda-a.deocoartist.com");
    expect(cf.zonaDe("lossatelites.com")).toBeDefined();
    expect(asuntos()).toEqual(["lossatelites.com venció"]);
    expect(bandejaDeSalida()[0].texto).toContain("Todavía podés recuperarlo al mismo precio");
    expect((await dominiosDeBanda(a.id)).find((x) => x.dominio === "lossatelites.com")!.vencido).toMatchObject({ renovable: true });
    // Otra pasada: no se vence dos veces.
    expect(await revisarVencimientos(new Date(vencido.getTime() + HORA))).toMatchObject({ vencidos: 0 });

    // La banda renueva en la gracia: vuelve todo como estaba.
    await renovarPagando();
    expect(await fila()).toMatchObject({ vencidoEn: null, esPrincipal: true });
  });

  it("pasada la gracia no se renueva solo; si el registrador lo libera, se pierde (y se dice)", async () => {
    const d = await comprado();
    const vencido = new Date(d.venceEn!.getTime() + DIA);
    await revisarVencimientos(vencido);
    await dueno.dominio.updateMany({ where: { dominio: "lossatelites.com" }, data: { vencidoEn: new Date(Date.now() - 31 * DIA) } });
    await expect(pagarRenovacion(a.id, ua.id, "lossatelites.com")).rejects.toThrow(/recargo del registrador: escribinos/);
    // A los 60 días, si sigue en la subcuenta, se espera.
    await dueno.dominio.updateMany({ where: { dominio: "lossatelites.com" }, data: { vencidoEn: new Date(Date.now() - 61 * DIA) } });
    expect(await revisarVencimientos()).toMatchObject({ perdidos: 0 });
    gd.dominios.delete("lossatelites.com");
    vaciarBandeja();
    expect(await revisarVencimientos()).toMatchObject({ perdidos: 1 });
    await esperar();
    expect(await dueno.dominio.count({ where: { dominio: { in: ["lossatelites.com", "www.lossatelites.com"] } } })).toBe(0);
    expect(cf.zonaDe("lossatelites.com")).toBeUndefined();
    expect(asuntos()).toEqual(["lossatelites.com ya no es tuyo"]);
    expect(await dueno.auditoria.count({ where: { accion: "dominio.perdido" } })).toBe(1);
  });
});

describe("llevárselo a otro registrador", () => {
  it("con el código, sin staff; los primeros 60 días no; al irse queda delegado y nada se corta", async () => {
    const d = await comprado();
    await expect(pedirCodigoDeTransferencia(ua.id, a.id, d.id)).rejects.toThrow(/se puede llevar a otro registrador desde el/);
    await dueno.dominioCompra.updateMany({ data: { terminadoEn: new Date(Date.now() - 61 * DIA) } });
    expect(await pedirCodigoDeTransferencia(ua.id, a.id, d.id)).toEqual({ dominio: "lossatelites.com", codigo: "AUTH-lossatelites.com" });
    expect(gd.dominios.get("lossatelites.com")!.locked).toBe(false);
    await esperar();
    // El mail avisa, pero el código no viaja por mail (ni queda guardado).
    expect(asuntos()).toEqual(["Pediste el código para llevarte lossatelites.com"]);
    expect(bandejaDeSalida()[0].texto).not.toContain("AUTH-");
    expect(await dueno.correo.count({ where: { OR: [{ texto: { contains: "AUTH-" } }, { html: { contains: "AUTH-" } }] } })).toBe(0);
    expect(await dueno.correo.count()).toBeGreaterThan(0);
    // Otra vez: el mismo código, sin otro mail.
    await pedirCodigoDeTransferencia(ua.id, a.id, d.id);
    await esperar();
    expect(asuntos()).toHaveLength(1);

    expect(await revisarTransferencias()).toBe(0);
    gd.transferidoAfuera("lossatelites.com");
    expect(await revisarTransferencias()).toBe(1);
    await esperar();
    const despues = (await dominiosDeBanda(a.id)).find((x) => x.dominio === "lossatelites.com")!;
    expect(despues).toMatchObject({ comprado: false, via: "zona", verificado: true, esPrincipal: true });
    expect(despues.renglones).toMatchObject({ registro: "En tu registrador (lo compraste afuera)", renueva: "Vos, en tu registrador · fecha sin cargar" });
    expect(cf.zonaDe("lossatelites.com")).toBeDefined();
    expect(asuntos()).toContain("lossatelites.com ya está en tu registrador nuevo");
  });
});

describe("cambio de titular registral", () => {
  it("lo pide el titular desde el panel, va por la máquina (reintentos, progreso) y bloquea la transferencia 60 días", async () => {
    const d = await comprado();
    await dueno.dominioCompra.updateMany({ data: { terminadoEn: new Date(Date.now() - 61 * DIA) } });
    const nuevo = { ...titular, nombre: "Juan", apellido: "Gómez", email: "juan@lossatelites.com" };
    await cambiarTitularRegistral(ua.id, a.id, "lossatelites.com", nuevo);
    await expect(cambiarTitularRegistral(ua.id, a.id, "lossatelites.com", nuevo)).rejects.toThrow(/ya hay un cambio de titular en curso/i);
    await esperar();
    expect((await seguimientoDeCompras(a.id))[0]).toMatchObject({ tipo: "titular", enCurso: true, monto: null });
    gd.terminar("DOMAIN_UPDATE_CONTACTS");
    await avanzar(2 * MIN);
    await esperar();
    expect(gd.dominios.get("lossatelites.com")!.contacts).toBeDefined();
    expect(asuntos()).toEqual(["Cambiamos el titular de lossatelites.com"]);
    const c = (await dominiosDeBanda(a.id)).find((x) => x.dominio === "lossatelites.com")!;
    expect(c.renglones.registro).toBe("En Deoco (GoDaddy), a nombre de Juan Gómez");
    expect(c.transferencia!.puedeDesde).toBeInstanceOf(Date);
    await expect(pedirCodigoDeTransferencia(ua.id, a.id, d.id)).rejects.toThrow(/60 días después/);
    // Sin cobro: nada en el gestor.
    expect(await dueno.comercialDominioCobro.count()).toBe(0);
  });
});
