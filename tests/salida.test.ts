import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { barrer } from "@/nucleo/barrido";
import { bandejaDeSalida, esperarCorreos, vaciarBandeja } from "@/nucleo/correo";
import { prisma } from "@/nucleo/db/cliente";
import { agregarDominio, dominiosDeBanda, quitarDominio } from "@/nucleo/dominios";
import { enFormatoBind, llevarseElDns, quedarseEnDeoco } from "@/nucleo/dominios/salida";
import { proxy } from "@/proxy";
import { dosBandas, dueno } from "./apoyo";
import { CloudflareFalso } from "./cloudflare-falso";

// Salir de Deoco con un dominio delegado (D6), sin que nadie de Deoco haga nada.

process.env.DEOCO_DOMINIO_RAIZ = "deocoartist.com";
const cf = new CloudflareFalso();
let a: { id: string };
let ua: { id: string };
const DIA = 86_400_000;

beforeAll(async () => {
  ({ a, ua } = await dosBandas());
  await cf.iniciar();
});
beforeEach(async () => {
  await dueno.zonaSaliente.deleteMany();
  await dueno.correoDominio.deleteMany();
  await dueno.dominio.deleteMany({ where: { NOT: { dominio: { endsWith: ".deocoartist.com" } } } });
  await dueno.dominio.updateMany({ where: { dominio: { endsWith: ".deocoartist.com" } }, data: { esPrincipal: true } });
  await dueno.auditoria.deleteMany();
  await dueno.correo.deleteMany();
  vaciarBandeja();
  cf.limpiar();
  cf.usar();
});
afterAll(async () => {
  await esperarCorreos();
  await cf.cerrar();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

const pedido = (host: string, path = "/") => new NextRequest(`https://${host}${path}`, { headers: { host, "x-forwarded-proto": "https" } });
const filas = () => dueno.dominio.findMany({ where: { tenantId: a.id, NOT: { dominio: { endsWith: ".deocoartist.com" } } }, orderBy: { dominio: "asc" } });
const principal = async () => (await dueno.dominio.findFirstOrThrow({ where: { tenantId: a.id, esPrincipal: true } })).dominio;

/** Un dominio delegado y activo, con el sitio, el correo de Google, el envío de Resend y la recepción de Deoco; principal. */
async function delegado(apex = "lossatelites.com") {
  const zonaId = `z-${apex}`;
  cf.zonas.set(zonaId, {
    id: zonaId,
    name: apex,
    status: "active",
    name_servers: ["ana.ns.cloudflare.com", "bob.ns.cloudflare.com"],
    certificado: "active",
    registros: [
      { id: "r1", type: "A", name: apex, content: "203.0.113.10", proxied: true },
      { id: "r2", type: "CNAME", name: `www.${apex}`, content: apex, proxied: true },
      { id: "r3", type: "MX", name: apex, content: "aspmx.l.google.com", proxied: false, priority: 1 },
      { id: "r4", type: "TXT", name: apex, content: "v=spf1 include:_spf.google.com ~all", proxied: false },
      { id: "r5", type: "MX", name: `send.${apex}`, content: "feedback-smtp.us-east-1.amazonses.com", proxied: false, priority: 10 },
      { id: "r6", type: "MX", name: apex, content: "route1.mx.cloudflare.net", proxied: false, priority: 13 },
    ],
  });
  await dueno.dominio.updateMany({ where: { tenantId: a.id }, data: { esPrincipal: false } });
  const ap = await dueno.dominio.create({ data: { tenantId: a.id, dominio: apex, verificado: true, via: "zona", proveedorId: zonaId, esPrincipal: true, estadoProveedor: "active", certificado: "active" } });
  await dueno.dominio.create({ data: { tenantId: a.id, dominio: `www.${apex}`, verificado: true, via: "zona", proveedorId: zonaId, estadoProveedor: "active", certificado: "active" } });
  return { id: ap.id, zonaId };
}

describe("llevarse el DNS, siguiendo con el sitio en Deoco", () => {
  it("la lista para el DNS nuevo; www se valida antes por CNAME; al irse los nameservers, la zona se da de baja y el sitio sigue sin cortarse", async () => {
    const { id, zonaId } = await delegado();
    await dueno.correoDominio.create({ data: { tenantId: a.id, dominioId: id, dominio: "lossatelites.com", local: "merch", recepcion: "activa", envioEstado: "verificado" } });
    await llevarseElDns(ua.id, a.id, id, { seguirConSitio: true });

    // El custom hostname de www, por TXT, validado desde nuestra zona (los nameservers todavía son nuestros).
    const h = cf.de("www.lossatelites.com")!;
    expect(h.ssl.method).toBe("txt");
    expect(cf.zonaDe("lossatelites.com")!.registros!.filter((r) => r.type === "TXT" && r.name.startsWith("_")).map((r) => r.name).sort()).toEqual([
      "_acme-challenge.www.lossatelites.com",
      "_cf-custom-hostname.www.lossatelites.com",
    ]);
    const lista = await dominiosDeBanda(a.id);
    const salida = lista.find((x) => x.id === id)!.salida!;
    // Lo que va al DNS nuevo: el CNAME de www y lo suyo; nada de lo que solo sirve con la zona en Deoco.
    expect(salida.registros.map((r) => [r.tipo, r.nombre, r.valor])).toEqual([
      ["CNAME", "www.lossatelites.com", "customers.deocoartist.com"],
      ["MX", "lossatelites.com", "aspmx.l.google.com"],
      ["TXT", "lossatelites.com", "v=spf1 include:_spf.google.com ~all"],
      ["MX", "send.lossatelites.com", "feedback-smtp.us-east-1.amazonses.com"],
    ]);
    expect(salida).toMatchObject({ seguirConSitio: true, pierdeRecepcion: "merch@lossatelites.com", acompanaA: null });
    expect(enFormatoBind(salida.registros)).toContain("lossatelites.com.\t300\tIN\tMX\t1 aspmx.l.google.com.");
    expect(lista.find((x) => x.dominio === "www.lossatelites.com")?.salida?.acompanaA).toBe("lossatelites.com");
    expect(await principal()).toBe("lossatelites.com");

    // Cloudflare validó el hostname: www pasa a CNAME y a principal (el dominio sin www lo redirige la banda).
    cf.activar("www.lossatelites.com");
    const t0 = new Date();
    await barrer({ ahora: t0 });
    expect((await filas()).map((f) => [f.dominio, f.via, f.verificado])).toEqual([
      ["lossatelites.com", "zona", true],
      ["www.lossatelites.com", "cname", true],
    ]);
    expect(await principal()).toBe("www.lossatelites.com");
    expect((await proxy(pedido("www.lossatelites.com"))).status).toBe(200);
    // Las renovaciones del certificado ya no dependen de TXT en un DNS que no va a ser nuestro.
    expect(cf.de("www.lossatelites.com")!.ssl.method).toBe("http");

    // La banda cambió los nameservers: la zona se da de baja; el sitio sigue en www.
    cf.zonas.get(zonaId)!.status = "moved";
    expect((await barrer({ ahora: new Date(t0.getTime() + 11 * 60_000) })).salidas).toBe(1);
    expect(cf.zonaDe("lossatelites.com")).toBeUndefined();
    expect((await filas()).map((f) => f.dominio)).toEqual(["www.lossatelites.com"]);
    expect(await dueno.zonaSaliente.count()).toBe(0);
    expect((await proxy(pedido("www.lossatelites.com"))).status).toBe(200);
    expect((await dueno.auditoria.findMany({ where: { tenantId: a.id }, orderBy: { fecha: "asc" } })).map((x) => x.accion)).toEqual([
      "dominio.saliendo",
      "dominio.conectado_por_cname",
      "dominio.salio",
    ]);
    await esperarCorreos();
    expect(bandejaDeSalida().map((m) => m.asunto)).toEqual(["lossatelites.com ya no usa los nameservers de Deoco"]);
  });

  it("si los nameservers se van antes de que el hostname se valide, www pasa igual (uno nuevo, por HTTP: alcanza con el CNAME)", async () => {
    const { id, zonaId } = await delegado();
    await llevarseElDns(ua.id, a.id, id, { seguirConSitio: true });
    const viejo = cf.de("www.lossatelites.com")!.id;
    cf.zonas.get(zonaId)!.status = "moved";
    await barrer();
    const nuevo = cf.de("www.lossatelites.com")!;
    expect(nuevo.id).not.toBe(viejo);
    expect(nuevo.ssl.method).toBe("http");
    expect((await filas()).map((f) => [f.dominio, f.via, f.proveedorId])).toEqual([["www.lossatelites.com", "cname", nuevo.id]]);
    expect(await principal()).toBe("www.lossatelites.com");
  });
});

describe("llevarse el DNS sin el sitio", () => {
  it("el principal vuelve ya al subdominio; al irse los nameservers, la zona y el dominio se van", async () => {
    const { id, zonaId } = await delegado();
    await llevarseElDns(ua.id, a.id, id, { seguirConSitio: false });
    expect(await principal()).toBe("banda-a.deocoartist.com");
    expect(cf.hostnames.size).toBe(0);
    expect((await dominiosDeBanda(a.id)).find((x) => x.id === id)?.salida?.registros.some((r) => r.tipo === "CNAME")).toBe(false);
    cf.zonas.get(zonaId)!.status = "moved";
    await barrer();
    expect(await filas()).toEqual([]);
    expect(cf.zonas.size).toBe(0);
    expect((await proxy(pedido("banda-a.deocoartist.com"))).status).toBe(200);
  });

  it("'Me quedo en Deoco' cancela (y borra el hostname que se había preparado)", async () => {
    const { id } = await delegado();
    await llevarseElDns(ua.id, a.id, id, { seguirConSitio: true });
    await quedarseEnDeoco(ua.id, a.id, id);
    expect(await dueno.zonaSaliente.count()).toBe(0);
    expect(cf.hostnames.size).toBe(0);
    expect((await dominiosDeBanda(a.id)).find((x) => x.id === id)?.salida).toBeNull();
  });
});

describe("90 días", () => {
  it("si nunca cambia los nameservers: aviso una semana antes (uno solo) y baja a los 90 días", async () => {
    const { id } = await delegado();
    await llevarseElDns(ua.id, a.id, id, { seguirConSitio: false });
    const desde = (await dueno.zonaSaliente.findFirstOrThrow()).desde;
    const dia = (n: number) => new Date(desde.getTime() + n * DIA);
    await barrer({ ahora: dia(82) });
    await barrer({ ahora: dia(83.1) });
    await barrer({ ahora: dia(85) });
    await esperarCorreos();
    expect(bandejaDeSalida().map((m) => m.asunto)).toEqual([expect.stringMatching(/^lossatelites\.com: el \d+ de \w+ damos de baja su DNS en Deoco$/)]);
    expect(cf.zonas.size).toBe(1);
    await barrer({ ahora: dia(90.1) });
    expect(cf.zonas.size).toBe(0);
    expect(await filas()).toEqual([]);
    await esperarCorreos();
    expect(bandejaDeSalida().at(-1)?.asunto).toBe("Dimos de baja el DNS de lossatelites.com en Deoco");
  });
});

describe("quitar un delegado", () => {
  it("verificado: la zona sigue 90 días (su correo sigue andando); si lo vuelve a delegar, se queda", async () => {
    const { id, zonaId } = await delegado();
    await dueno.dominio.update({ where: { id }, data: { esPrincipal: false } });
    await dueno.dominio.updateMany({ where: { tenantId: a.id, dominio: "banda-a.deocoartist.com" }, data: { esPrincipal: true } });
    await expect(quitarDominio(ua.id, a.id, id, false)).rejects.toThrow(/Su DNS sigue en Deoco 90 días/);
    await quitarDominio(ua.id, a.id, id, true);
    expect(await dueno.zonaSaliente.count()).toBe(0); // queda www
    const www = await dueno.dominio.findFirstOrThrow({ where: { dominio: "www.lossatelites.com" } });
    await quitarDominio(ua.id, a.id, www.id, true);
    expect(await dueno.zonaSaliente.findFirstOrThrow()).toMatchObject({ zonaId, seLlevaElDns: false });
    expect(cf.zonas.has(zonaId)).toBe(true);

    await agregarDominio(ua.id, a.id, "lossatelites.com", "zona");
    expect(await dueno.zonaSaliente.count()).toBe(0);
    expect((await filas()).map((f) => f.proveedorId)).toEqual([zonaId, zonaId]);
  });

  it("sin verificar (la zona nunca se activó): se borra ya", async () => {
    const id = await agregarDominio(ua.id, a.id, "lossatelites.com", "zona");
    const www = await dueno.dominio.findFirstOrThrow({ where: { dominio: "www.lossatelites.com" } });
    await quitarDominio(ua.id, a.id, id, true);
    await quitarDominio(ua.id, a.id, www.id, true);
    expect(cf.zonas.size).toBe(0);
    expect(await dueno.zonaSaliente.count()).toBe(0);
  });
});
