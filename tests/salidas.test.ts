import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { barrer } from "@/nucleo/barrido";
import { bandejaDeSalida, esperarCorreos, vaciarBandeja } from "@/nucleo/correo";
import { prisma } from "@/nucleo/db/cliente";
import { agregarDominio, dominiosDeBanda, marcarPrincipal, quitarDominio } from "@/nucleo/dominios";
import { avanzarCompras, dominioPagado, esperarCompras } from "@/nucleo/dominios/compra";
import type { Contacto } from "@/nucleo/dominios/registrador";
import { llevarseElDns, ponerMisNameservers, quedarseEnDeoco, revisarSalidas } from "@/nucleo/dominios/salida";
import { pedirCodigoDeTransferencia, revisarTransferencias } from "@/nucleo/dominios/transferencia";
import { dosBandas, dueno } from "./apoyo";
import { CloudflareFalso } from "./cloudflare-falso";
import { RegistradorFalso } from "./registrador-falso";

// D12: las cinco salidas, de punta a punta y sin el staff en ninguna. Todo lo hace el titular
// desde el panel (estas funciones son las de sus botones) y el barrido; nadie de Deoco toca nada.
//   1. Compró afuera y delegó → se va cambiando los nameservers.
//   2. Compró en Deoco → se lo lleva con el código.
//   3. Tiene un .com.ar → se va desde nic.ar.
//   4. Compró en Deoco y quiere solo el DNS → se lo lleva sin transferir (los nameservers los pone Deoco).
//   5. Conectado por CNAME → borra dos registros y lo quita.
// Y las transiciones: comprado → afuera → delegado → se va; comprado con el DNS afuera → se queda.

process.env.DEOCO_DOMINIO_RAIZ = "deocoartist.com";
const cf = new CloudflareFalso();
const gd = new RegistradorFalso();
const MIN = 60_000;
const DIA = 24 * 60 * MIN;
let a: { id: string };
let ua: { id: string };

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

const filas = () => dueno.dominio.findMany({ where: { tenantId: a.id, NOT: { dominio: { endsWith: ".deocoartist.com" } } }, orderBy: { dominio: "asc" } });
const principal = async () => (await dueno.dominio.findFirstOrThrow({ where: { tenantId: a.id, esPrincipal: true } })).dominio;
const tarjeta = async (dominio: string) => (await dominiosDeBanda(a.id)).find((x) => x.dominio === dominio)!;
const asuntos = async () => (await esperarCorreos(), bandejaDeSalida().map((m) => m.asunto));
let reloj = Date.now();
/** Una vuelta del barrido "más tarde" (cada una, 11 minutos después de la anterior). */
const barrido = async () => {
  reloj += 11 * MIN;
  const r = await barrer({ ahora: new Date(reloj) });
  await esperarCompras();
  return r;
};

/** Delegado (compró afuera, o .com.ar) y activo, como principal. */
async function delegado(dominio: string) {
  const id = await agregarDominio(ua.id, a.id, dominio, "zona");
  cf.activarZona(dominio);
  await barrido();
  const d = await dueno.dominio.findUniqueOrThrow({ where: { id } });
  expect(d.verificado).toBe(true);
  await marcarPrincipal(ua.id, a.id, id);
  return d;
}

/** Comprado en Deoco, listo y principal. */
async function comprado(dominio = "lossatelites.com") {
  await dominioPagado(a.id, {
    dominio,
    anios: 1,
    contacto: { ...titular },
    aceptacion: { fecha: new Date(), ip: "203.0.113.7", claves: ["DNRA"] },
    hacerPrincipal: true,
    cobro: { id: `cobro-${dominio}`, monto: 2_500_000 },
    usuarioId: ua.id,
  });
  await esperarCompras();
  gd.terminar("REGISTER");
  await avanzarCompras(a.id, new Date(Date.now() + 2 * MIN));
  gd.terminar();
  await avanzarCompras(a.id, new Date(Date.now() + 4 * MIN));
  cf.activarZona(dominio);
  await barrido();
  await avanzarCompras(a.id, new Date(Date.now() + 40 * MIN));
  await esperarCompras();
  // Registrado hace más de 60 días (si no, las reglas del registro no dejan transferirlo).
  await dueno.dominioCompra.updateMany({ data: { terminadoEn: new Date(Date.now() - 61 * DIA) } });
  const d = await dueno.dominio.findFirstOrThrow({ where: { tenantId: a.id, dominio } });
  expect(d).toMatchObject({ comprado: true, verificado: true, esPrincipal: true });
  return d;
}

/** Nadie del staff hizo nada: cada fila de auditoría es del titular o de la plataforma sola. */
async function sinStaff() {
  const filasAuditoria = await dueno.auditoria.findMany({ where: { tenantId: a.id } });
  expect(filasAuditoria.length).toBeGreaterThan(0);
  expect(filasAuditoria.filter((x) => x.usuarioId !== null && x.usuarioId !== ua.id)).toEqual([]);
  expect(await dueno.usuario.count({ where: { esStaff: true } })).toBe(0);
}

beforeAll(async () => {
  ({ a, ua } = await dosBandas());
  await Promise.all([cf.iniciar(), gd.iniciar()]);
});
beforeEach(async () => {
  await esperarCompras();
  for (const t of ["dominioCompra", "registradorCliente", "zonaSaliente", "correoDominio", "auditoria", "correo"] as const) {
    await (dueno[t] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await dueno.dominio.deleteMany({ where: { NOT: { dominio: { endsWith: ".deocoartist.com" } } } });
  await dueno.dominio.updateMany({ where: { dominio: { endsWith: ".deocoartist.com" } }, data: { esPrincipal: true } });
  await dueno.tenant.update({ where: { id: a.id }, data: { estado: "ACTIVO" } });
  vaciarBandeja();
  cf.limpiar();
  cf.usar();
  gd.limpiar();
  gd.usar();
});
afterAll(async () => {
  await esperarCompras();
  await esperarCorreos();
  await Promise.all([cf.cerrar(), gd.cerrar()]);
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("1. compró afuera y delegó: se va cambiando los nameservers", () => {
  it("la lista para su DNS nuevo; cambia los nameservers; la zona se da de baja; el sitio vuelve al subdominio", async () => {
    const d = await delegado("lossatelites.com");
    expect((await tarjeta("lossatelites.com")).renglones).toMatchObject({ registro: "En tu registrador (lo compraste afuera)", dns: "Deoco (Cloudflare)" });
    await llevarseElDns(ua.id, a.id, d.id, { seguirConSitio: false });
    expect(await principal()).toBe("banda-a.deocoartist.com");
    expect((await tarjeta("lossatelites.com")).salida).toMatchObject({ seguirConSitio: false, comprado: null });
    cf.zonas.get(d.proveedorId!)!.status = "moved";
    expect((await barrido()).salidas).toBe(1);
    expect(await filas()).toEqual([]);
    expect(cf.zonaDe("lossatelites.com")).toBeUndefined();
    expect(await asuntos()).toContain("lossatelites.com ya no usa los nameservers de Deoco");
    await sinStaff();
  });
});

describe("2. compró en Deoco: se lo lleva con el código", () => {
  it("pide el código, lo transfiere, queda delegado sin corte; y desde ahí se va como cualquier delegado", async () => {
    const d = await comprado();
    const { codigo } = await pedirCodigoDeTransferencia(ua.id, a.id, d.id);
    expect(codigo).toBe("AUTH-lossatelites.com");
    // El registrador nuevo lo toma: el dominio deja la subcuenta.
    gd.transferidoAfuera("lossatelites.com");
    expect(await revisarTransferencias()).toBe(1);
    const t = await tarjeta("lossatelites.com");
    expect(t).toMatchObject({ comprado: false, via: "zona", verificado: true, esPrincipal: true });
    // Transición: ahora es un delegado y se lleva el DNS cambiando los nameservers en su registrador nuevo.
    await llevarseElDns(ua.id, a.id, d.id, { seguirConSitio: false });
    cf.zonas.get(d.proveedorId!)!.status = "moved";
    expect((await barrido()).salidas).toBe(1);
    expect(await filas()).toEqual([]);
    await sinStaff();
  });
});

describe("3. tiene un .com.ar: se va desde nic.ar", () => {
  it("lo mismo que un delegado; la tarjeta lo manda a nic.ar", async () => {
    const d = await delegado("lossatelites.com.ar");
    expect((await tarjeta("lossatelites.com.ar")).renglones.registro).toBe("En NIC Argentina, a tu nombre");
    await llevarseElDns(ua.id, a.id, d.id, { seguirConSitio: true });
    cf.activar("www.lossatelites.com.ar");
    await barrido();
    expect(await principal()).toBe("www.lossatelites.com.ar");
    cf.zonas.get(d.proveedorId!)!.status = "moved";
    expect((await barrido()).salidas).toBe(1);
    expect((await filas()).map((f) => [f.dominio, f.via])).toEqual([["www.lossatelites.com.ar", "cname"]]);
    await sinStaff();
  });
});

describe("4. compró en Deoco y quiere solo el DNS: se lo lleva sin transferir", () => {
  it("la lista; Deoco pone sus nameservers en el registrador; la zona se va; sigue registrado acá (renueva, código, titular)", async () => {
    const d = await comprado();
    await llevarseElDns(ua.id, a.id, d.id, { seguirConSitio: true });
    expect((await tarjeta("lossatelites.com")).salida!.comprado).toEqual({ nameservers: null, puestos: false });
    await expect(ponerMisNameservers(ua.id, a.id, d.id, ["ns1.otro.com"])).rejects.toThrow(/al menos dos/);
    await expect(ponerMisNameservers(ua.id, a.id, d.id, ["ns1.otro.com", "no válido"])).rejects.toThrow(/no parece un nameserver/);
    const propios = cf.zonaDe("lossatelites.com")!.name_servers;
    await expect(ponerMisNameservers(ua.id, a.id, d.id, propios)).rejects.toThrow(/Me quedo en Deoco/);
    expect(await ponerMisNameservers(ua.id, a.id, d.id, ["NS1.Otro.com.", "ns2.otro.com", ""])).toEqual(["ns1.otro.com", "ns2.otro.com"]);
    await esperarCompras();
    expect((await tarjeta("lossatelites.com")).salida!.comprado).toEqual({ nameservers: ["ns1.otro.com", "ns2.otro.com"], puestos: false });
    gd.terminar("DOMAIN_UPDATE_NAME_SERVERS");
    await avanzarCompras(a.id, new Date(Date.now() + 2 * MIN));
    expect(gd.dominios.get("lossatelites.com")!.nameServers).toEqual(["ns1.otro.com", "ns2.otro.com"]);
    expect((await tarjeta("lossatelites.com")).salida!.comprado).toMatchObject({ puestos: true });

    // www sigue en Deoco por CNAME; cuando se propagan, la zona se va.
    cf.activar("www.lossatelites.com");
    await barrido();
    cf.zonas.get(d.proveedorId!)!.status = "moved";
    expect((await barrido()).salidas).toBe(1);
    expect((await filas()).map((f) => [f.dominio, f.via, f.verificado, f.comprado, f.soloRegistro])).toEqual([
      ["lossatelites.com", null, false, true, true],
      ["www.lossatelites.com", "cname", true, true, false],
    ]);
    expect(await principal()).toBe("www.lossatelites.com");
    const t = await tarjeta("lossatelites.com");
    expect(t).toMatchObject({ estado: "afuera", registros: null, delegacion: null });
    expect(t.renglones).toMatchObject({ registro: "En Deoco (GoDaddy), a nombre de Ana Pérez", dns: "Vos, en tu proveedor" });
    expect(t.venceEn).toBeInstanceOf(Date);
    // Sigue registrado en Deoco: se lo puede llevar con el código.
    expect((await pedirCodigoDeTransferencia(ua.id, a.id, d.id)).codigo).toBe("AUTH-lossatelites.com");
    await sinStaff();
  });

  it("si se arrepiente después de que pusimos sus nameservers, vuelven los de Deoco; si nunca los pasa, a los 90 días sigue todo igual", async () => {
    const d = await comprado();
    const propios = cf.zonaDe("lossatelites.com")!.name_servers;
    await llevarseElDns(ua.id, a.id, d.id, { seguirConSitio: false });
    await ponerMisNameservers(ua.id, a.id, d.id, ["ns1.otro.com", "ns2.otro.com"]);
    await esperarCompras();
    gd.terminar("DOMAIN_UPDATE_NAME_SERVERS");
    await avanzarCompras(a.id, new Date(Date.now() + 2 * MIN));
    await quedarseEnDeoco(ua.id, a.id, d.id);
    await esperarCompras();
    gd.terminar("DOMAIN_UPDATE_NAME_SERVERS");
    await avanzarCompras(a.id, new Date(Date.now() + 4 * MIN));
    expect(gd.dominios.get("lossatelites.com")!.nameServers).toEqual(propios);
    expect(await dueno.zonaSaliente.count()).toBe(0);

    // Pide llevarse el DNS y nunca pasa los nameservers: a los 90 días no se da de baja la zona.
    await llevarseElDns(ua.id, a.id, d.id, { seguirConSitio: false });
    vaciarBandeja();
    await revisarSalidas(new Date(Date.now() + 84 * DIA));
    expect(await asuntos()).toEqual(["lossatelites.com: ¿seguís llevándote el DNS?"]);
    vaciarBandeja();
    await revisarSalidas(new Date(Date.now() + 91 * DIA));
    expect(await dueno.zonaSaliente.count()).toBe(0);
    expect(cf.zonaDe("lossatelites.com")).toBeDefined();
    expect((await filas()).map((f) => [f.dominio, f.via, f.verificado])).toEqual([
      ["lossatelites.com", "zona", true],
      ["www.lossatelites.com", "zona", true],
    ]);
    expect(await asuntos()).toEqual(["lossatelites.com sigue con el DNS en Deoco"]);
    await sinStaff();
  });
});

describe("5. conectado por CNAME: borra dos registros y lo quita", () => {
  it("si es el principal, primero vuelve al subdominio; quitarlo borra el custom hostname", async () => {
    const id = await agregarDominio(ua.id, a.id, "www.lossatelites.com", "cname");
    cf.activar("www.lossatelites.com");
    await dueno.dominio.update({ where: { id }, data: { verificado: true, estadoProveedor: "active", certificado: "active" } });
    await marcarPrincipal(ua.id, a.id, id);
    expect((await tarjeta("www.lossatelites.com")).renglones).toMatchObject({ dns: "Vos, en tu proveedor" });
    await expect(quitarDominio(ua.id, a.id, id, true)).rejects.toThrow(/principal/);
    const sub = await dueno.dominio.findFirstOrThrow({ where: { tenantId: a.id, dominio: "banda-a.deocoartist.com" } });
    await marcarPrincipal(ua.id, a.id, sub.id);
    await quitarDominio(ua.id, a.id, id, true);
    expect(await filas()).toEqual([]);
    expect(cf.de("www.lossatelites.com")).toBeUndefined();
    await sinStaff();
  });
});

describe("con la banda archivada (se fue de Deoco)", () => {
  it("igual se lleva todo: el código, el DNS de un comprado, un delegado y un CNAME", async () => {
    const c = await comprado();
    const d = await delegado("otra.com");
    await dueno.tenant.update({ where: { id: a.id }, data: { estado: "ARCHIVADO" } });
    expect((await pedirCodigoDeTransferencia(ua.id, a.id, c.id)).codigo).toBe("AUTH-lossatelites.com");
    await llevarseElDns(ua.id, a.id, c.id, { seguirConSitio: false });
    await ponerMisNameservers(ua.id, a.id, c.id, ["ns1.otro.com", "ns2.otro.com"]);
    await llevarseElDns(ua.id, a.id, d.id, { seguirConSitio: false });
    expect(await dueno.zonaSaliente.count()).toBe(2);
    await sinStaff();
  });
});
