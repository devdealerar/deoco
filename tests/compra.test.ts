import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { barrer } from "@/nucleo/barrido";
import { bandejaDeSalida, esperarCorreos, vaciarBandeja } from "@/nucleo/correo";
import { prisma } from "@/nucleo/db/cliente";
import { quitarDominio } from "@/nucleo/dominios";
import { avanzarCompras, corregirDatosCompra, dominioPagado, esperarCompras, renovacionPagada } from "@/nucleo/dominios/compra";
import type { Contacto } from "@/nucleo/dominios/registrador";
import { llevarseElDns } from "@/nucleo/dominios/salida";
import { dosBandas, dueno } from "./apoyo";
import { CloudflareFalso, NAMESERVERS } from "./cloudflare-falso";
import { RegistradorFalso } from "./registrador-falso";
import comercial from "../modulos/comercial";
import tienda from "../modulos/tienda";

// La compra de un dominio ya pagada (D8): la máquina de estados, contra Cloudflare y GoDaddy falsos.

process.env.DEOCO_DOMINIO_RAIZ = "deocoartist.com";
const cf = new CloudflareFalso();
const gd = new RegistradorFalso();
let a: { id: string };
let ua: { id: string };
const MIN = 60_000;
const HORA = 60 * MIN;

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
const pedido = (extra: object = {}) => ({
  dominio: "lossatelites.com",
  anios: 1,
  contacto: { ...titular },
  aceptacion: { fecha: new Date("2026-10-15T12:00:00Z"), ip: "203.0.113.7", claves: ["DNRA"] },
  hacerPrincipal: true,
  cobro: { id: "cobro-1", monto: 2500000 },
  usuarioId: ua.id,
  ...extra,
});

beforeAll(async () => {
  ({ a, ua } = await dosBandas());
  await cf.iniciar();
  await gd.iniciar();
});
beforeEach(async () => {
  await esperarCompras();
  await dueno.dominioCompra.deleteMany();
  await dueno.registradorCliente.deleteMany();
  await dueno.zonaSaliente.deleteMany();
  await dueno.dominio.deleteMany({ where: { NOT: { dominio: { endsWith: ".deocoartist.com" } } } });
  await dueno.dominio.updateMany({ where: { dominio: { endsWith: ".deocoartist.com" } }, data: { esPrincipal: true } });
  await dueno.auditoria.deleteMany();
  await dueno.correo.deleteMany();
  vaciarBandeja();
  cf.limpiar();
  cf.usar();
  gd.limpiar();
  gd.usar();
});
afterAll(async () => {
  await esperarCompras();
  await esperarCorreos();
  await cf.cerrar();
  await gd.cerrar();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

const compra = () => dueno.dominioCompra.findFirstOrThrow({ where: { tenantId: a.id } });
const RECIBIDO = "Recibimos tu pago: estamos registrando lossatelites.com";
const mails = async () => (await esperarCorreos(), bandejaDeSalida().map((m) => m.asunto));
/** Una vuelta de la compra "más tarde" (lo que haría el barrido). */
const despues = async (ms: number) => avanzarCompras(a.id, new Date(Date.now() + ms));

describe("alta", () => {
  it("pagado → subcuenta → registrado a nombre del titular → zona → nameservers de Cloudflare → activo → principal → listo", async () => {
    expect(await dominioPagado(comercial, a.id, pedido())).toMatchObject({ repetida: false });
    await esperarCompras();
    // Subcuenta creada y registro pedido (202): esperando a GoDaddy.
    expect(await dueno.registradorCliente.findFirstOrThrow({ where: { tenantId: a.id } })).toMatchObject({ registrador: "GoDaddy" });
    expect(await compra()).toMatchObject({ paso: "registrar", estado: "en-curso", operacion: { id: "lossatelites.com|REGISTER", estado: "en-curso" } });

    gd.terminar("REGISTER");
    await despues(2 * MIN);
    // Registrado; zona creada con el sitio; nameservers pedidos.
    expect(gd.dominios.get("lossatelites.com")).toBeDefined();
    expect(cf.zonaDe("lossatelites.com")).toBeDefined();
    expect((await dueno.dominio.findMany({ where: { tenantId: a.id, comprado: true }, orderBy: { dominio: "asc" } })).map((d) => [d.dominio, d.via, d.verificado])).toEqual([
      ["lossatelites.com", "zona", false],
      ["www.lossatelites.com", "zona", false],
    ]);
    expect(await compra()).toMatchObject({ paso: "nameservers" });

    gd.terminar();
    await despues(4 * MIN);
    expect(gd.dominios.get("lossatelites.com")?.nameServers).toEqual(NAMESERVERS);
    expect(await compra()).toMatchObject({ paso: "activacion" });

    // Cloudflare ve los nameservers (lo verifica la revisión de delegaciones) y el certificado.
    cf.activarZona("lossatelites.com");
    await barrer({ ahora: new Date(Date.now() + 20 * MIN) });
    await esperarCompras(); // las compras corren aparte del barrido
    const c = await compra();
    expect(c).toMatchObject({ estado: "listo", paso: "listo" });
    expect(c.venceEn).toBeInstanceOf(Date);
    expect((await dueno.dominio.findFirstOrThrow({ where: { tenantId: a.id, esPrincipal: true } })).dominio).toBe("lossatelites.com");
    // El del pago y el de la compra (no el de "cambiaste los nameservers" de una delegación).
    expect(await mails()).toEqual([RECIBIDO, "lossatelites.com ya es tuyo"]);
    expect(bandejaDeSalida()[1].texto).toContain("quedó registrado a nombre de Ana Pérez");
    expect(bandejaDeSalida()[0].texto).toContain("/b/banda-a/dominios/compras");
    expect((await dueno.auditoria.findMany({ where: { tenantId: a.id }, orderBy: { fecha: "asc" } })).map((x) => x.accion)).toEqual(
      expect.arrayContaining(["dominio.compra_pagada", "dominio.registrado", "dominio.verificado", "dominio.principal_marcado", "dominio.compra_lista"]),
    );
  });

  it("un cobro, una compra: el mismo aviso de pago dos veces no compra dos veces", async () => {
    const r1 = await dominioPagado(comercial, a.id, pedido());
    const r2 = await dominioPagado(comercial, a.id, pedido());
    expect(r2).toEqual({ compraId: r1.compraId, repetida: true });
    await esperarCompras();
    expect(await dueno.dominioCompra.count()).toBe(1);
    expect(gd.pedidos.filter((p) => p.ruta.endsWith("/register"))).toHaveLength(1);
  });

  it("alguien lo registró en el medio: falla, el pago se devuelve y se avisa", async () => {
    gd.tomados.add("lossatelites.com");
    await dominioPagado(comercial, a.id, pedido());
    await esperarCompras();
    expect(await compra()).toMatchObject({ estado: "fallido", motivo: "no-disponible", devolucion: "pendiente" });
    expect(await mails()).toEqual([RECIBIDO, "No pudimos registrar lossatelites.com"]);
    expect(bandejaDeSalida()[1].texto).toContain("Alguien registró lossatelites.com antes que nosotros. Te devolvemos el pago completo.");
  });

  it("sin saldo en la cuenta de Deoco: reintenta (el staff lo ve); al recargar, sigue; 24 h sin poder, devolución", async () => {
    gd.sinSaldo = true;
    await dominioPagado(comercial, a.id, pedido());
    await esperarCompras();
    expect(await compra()).toMatchObject({ estado: "en-curso", paso: "registrar", motivo: "sin-saldo", intentos: 1 });
    gd.sinSaldo = false;
    await despues(16 * MIN);
    expect(await compra()).toMatchObject({ estado: "en-curso", motivo: null, operacion: { estado: "en-curso" } });

    // Otra compra que nunca consigue saldo: a las 24 h, devolución.
    await dueno.dominioCompra.deleteMany();
    await dueno.registradorCliente.deleteMany();
    gd.limpiar();
    gd.sinSaldo = true;
    await dominioPagado(comercial, a.id, pedido({ cobro: { id: "cobro-2", monto: 1 } }));
    await esperarCompras();
    await dueno.dominioCompra.updateMany({ data: { primerFalloEn: new Date(Date.now() - 25 * HORA) } });
    await despues(16 * MIN);
    expect(await compra()).toMatchObject({ estado: "fallido", motivo: "sin-saldo", devolucion: "pendiente" });
  });

  it("un dato del titular que el registrador no acepta: espera a la banda (y le avisa); corregido, sigue", async () => {
    await dominioPagado(comercial, a.id, pedido({ contacto: { ...titular, telefono: "1145678900" } }));
    await esperarCompras();
    const c = await compra();
    expect(c).toMatchObject({ estado: "datos", campo: "telefono" });
    expect(await mails()).toEqual([RECIBIDO, "Revisá un dato para registrar lossatelites.com"]);
    await corregirDatosCompra(a.id, c.id, titular);
    await esperarCompras();
    expect(await compra()).toMatchObject({ estado: "en-curso", paso: "registrar", operacion: { estado: "en-curso" } });
  });

  it("ya registrado, si Cloudflare falla nunca se devuelve: se sigue intentando", async () => {
    await dominioPagado(comercial, a.id, pedido());
    await esperarCompras();
    gd.terminar("REGISTER");
    cf.fallas.push(503, 503, 503, 503);
    await despues(2 * MIN);
    expect(await compra()).toMatchObject({ estado: "en-curso", paso: "zona", motivo: "temporal" });
    await dueno.dominioCompra.updateMany({ data: { primerFalloEn: new Date(Date.now() - 30 * HORA) } });
    cf.fallas.push(503, 503, 503, 503);
    await despues(3 * HORA);
    expect(await compra()).toMatchObject({ estado: "en-curso", paso: "zona", devolucion: null });
  });

  it("con la zona activa, la compra la verifica sola (sin esperar la revisión de delegaciones, que es cada 10 min)", async () => {
    await dominioPagado(comercial, a.id, pedido({ hacerPrincipal: false }));
    await esperarCompras();
    gd.terminar("REGISTER");
    await despues(2 * MIN);
    gd.terminar();
    await despues(4 * MIN);
    expect(await compra()).toMatchObject({ paso: "activacion" });
    cf.activarZona("lossatelites.com");
    await despues(7 * MIN);
    expect(await compra()).toMatchObject({ estado: "listo" });
    expect(await dueno.dominio.count({ where: { tenantId: a.id, comprado: true, verificado: true } })).toBe(2);
  });

  it("solo el gestor de cuenta (el que cobra) puede decir que está pago: otro módulo no registra nada", async () => {
    await expect(dominioPagado(tienda, a.id, pedido())).rejects.toThrow(/no es el gestor de cuenta/);
    await expect(renovacionPagada(tienda, a.id, { dominio: "lossatelites.com", anios: 1, cobro: { id: "x", monto: 1 }, usuarioId: null })).rejects.toThrow(/no es el gestor/);
    expect(await dueno.dominioCompra.count()).toBe(0);
  });

  it("un paso tomado por otro proceso no corre dos veces", async () => {
    await dominioPagado(comercial, a.id, pedido());
    await esperarCompras();
    gd.terminar("REGISTER");
    await dueno.dominioCompra.updateMany({ data: { tomadoEn: new Date() } });
    await despues(2 * MIN);
    expect(await compra()).toMatchObject({ paso: "registrar" });
  });
});

describe("después", () => {
  async function comprado() {
    await dominioPagado(comercial, a.id, pedido({ hacerPrincipal: false }));
    await esperarCompras();
    gd.terminar("REGISTER");
    await despues(2 * MIN);
    gd.terminar();
    await despues(4 * MIN);
    cf.activarZona("lossatelites.com");
    await barrer({ ahora: new Date(Date.now() + 20 * MIN) });
    await esperarCompras(); // las compras corren aparte del barrido
    expect(await compra()).toMatchObject({ estado: "listo" });
  }

  it("renovación pagada: el vencimiento pasa un año", async () => {
    await comprado();
    const antes = (await compra()).venceEn!;
    await renovacionPagada(comercial, a.id, { dominio: "lossatelites.com", anios: 1, cobro: { id: "cobro-ren", monto: 1 }, usuarioId: ua.id });
    await esperarCompras();
    gd.terminar("RENEW");
    await despues(2 * MIN);
    const ren = await dueno.dominioCompra.findFirstOrThrow({ where: { tipo: "renovacion" } });
    expect(ren.estado).toBe("listo");
    expect(ren.venceEn!.getUTCFullYear()).toBe(antes.getUTCFullYear() + 1);
    expect((await mails()).at(-1)).toBe("Renovamos lossatelites.com");
  });

  it("un comprado no se quita (se lleva con el código), pero sí se puede llevar solo el DNS (D12)", async () => {
    await comprado();
    const d = await dueno.dominio.findFirstOrThrow({ where: { dominio: "lossatelites.com" } });
    await expect(quitarDominio(ua.id, a.id, d.id, true)).rejects.toThrow(/código de transferencia/);
    await llevarseElDns(ua.id, a.id, d.id, { seguirConSitio: true });
    expect(await dueno.zonaSaliente.count({ where: { dominio: "lossatelites.com", seLlevaElDns: true } })).toBe(1);
  });

  it("esperando los nameservers más de 14 días no se libera (los pone la compra)", async () => {
    await dominioPagado(comercial, a.id, pedido());
    await esperarCompras();
    gd.terminar("REGISTER");
    await despues(2 * MIN);
    await dueno.dominio.updateMany({ where: { comprado: true }, data: { creadoEn: new Date(Date.now() - 20 * 24 * HORA) } });
    await barrer();
    await esperarCompras();
    expect(await dueno.dominio.count({ where: { comprado: true } })).toBe(2);
    expect(cf.zonaDe("lossatelites.com")).toBeDefined();
  });
});
