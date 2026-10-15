import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/nucleo/db/cliente";
import {
  agregarDominio,
  type ConsultaDns,
  dominiosDeBanda,
  marcarPrincipal,
  quitarDominio,
  verificarDominio,
} from "@/nucleo/dominios";
import { CABECERA } from "@/nucleo/tenant/cabeceras";
import { proxy } from "@/proxy";
import { dosBandas, dueno } from "./apoyo";
import { CloudflareFalso } from "./cloudflare-falso";

process.env.DEOCO_DOMINIO_RAIZ = "deocoartist.com";

const cf = new CloudflareFalso();
let a: { id: string };
let b: { id: string };
let ua: { id: string };
let ub: { id: string };

beforeAll(async () => {
  ({ a, b, ua, ub } = await dosBandas());
  await cf.iniciar();
  cf.usar();
});
beforeEach(async () => {
  await dueno.dominio.deleteMany({ where: { NOT: { dominio: { endsWith: ".deocoartist.com" } } } });
  await dueno.dominio.updateMany({ where: { dominio: { endsWith: ".deocoartist.com" } }, data: { esPrincipal: true } });
  await dueno.auditoria.deleteMany();
  cf.limpiar();
  cf.usar();
});
afterAll(async () => {
  await cf.cerrar();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

/** DNS falso: los TXT que "publicó" cada nombre. */
function dnsFalso(txt: Record<string, string[]> = {}): ConsultaDns {
  return { txt: async (h) => txt[h] ?? [] };
}

/** El TXT de esa banda para ese dominio, publicado. */
async function txtDe(tenantId: string, dominio: string) {
  const d = await dueno.dominio.findFirstOrThrow({ where: { tenantId, dominio } });
  return dnsFalso({ [`_deoco.${dominio}`]: [`deoco-verificacion=${d.token}`] });
}

/** Agrega, "crea los registros" (Cloudflare lo activa con certificado) y verifica. */
async function conectado(dominio = "www.lossatelites.com.ar", ssl = "active") {
  const id = await agregarDominio(ua.id, a.id, dominio);
  cf.activar(dominio, { ssl });
  expect(await verificarDominio(ua.id, a.id, id, await txtDe(a.id, dominio))).toEqual({ verificado: true });
  return id;
}

const pedido = (host: string, path = "/", extra: Record<string, string> = {}) =>
  new NextRequest(`http://${host}${path}`, { headers: { host, ...extra } });

describe("agregar: el custom hostname y los registros a crear", () => {
  it("crea el custom hostname en Cloudflare y muestra el CNAME y el TXT exactos", async () => {
    const id = await agregarDominio(ua.id, a.id, "https://www.LosSatelites.com.ar/");
    const d = await dueno.dominio.findUniqueOrThrow({ where: { id } });
    expect(d).toMatchObject({ dominio: "www.lossatelites.com.ar", verificado: false, esPrincipal: false, via: "cname", estadoProveedor: "pending" });
    expect(cf.de("www.lossatelites.com.ar")?.id).toBe(d.proveedorId);

    const lista = await dominiosDeBanda(a.id);
    const propio = lista.find((x) => x.id === id)!;
    expect(propio.estado).toBe("sin-verificar");
    expect(propio.registros?.map(({ tipo, nombre, valor }) => ({ tipo, nombre, valor }))).toEqual([
      { tipo: "CNAME", nombre: "www.lossatelites.com.ar", valor: "customers.deocoartist.com" },
      { tipo: "TXT", nombre: "_deoco.www.lossatelites.com.ar", valor: `deoco-verificacion=${d.token}` },
    ]);
    // El subdominio de la plataforma no pide nada.
    expect(lista.find((x) => x.dominio === "banda-a.deocoartist.com")).toMatchObject({ dePlataforma: true, estado: "plataforma", registros: null });
  });

  it("los registros extra que pide Cloudflare se guardan para mostrarlos si tarda", async () => {
    const id = await agregarDominio(ua.id, a.id, "www.lossatelites.com.ar");
    cf.de("www.lossatelites.com.ar")!.ssl.validation_records = [{ txt_name: "_acme-challenge.www.lossatelites.com.ar", txt_value: "abc" }];
    await verificarDominio(ua.id, a.id, id, dnsFalso());
    const [propio] = (await dominiosDeBanda(a.id)).filter((x) => x.id === id);
    expect(propio.validacion).toMatchObject([{ tipo: "TXT", nombre: "_acme-challenge.www.lossatelites.com.ar", valor: "abc" }]);
  });

  it("sin Cloudflare configurado no se puede agregar (y no queda nada a medias)", async () => {
    delete process.env.DEOCO_CLOUDFLARE_TOKEN;
    await expect(agregarDominio(ua.id, a.id, "www.lossatelites.com.ar")).rejects.toThrow(/todavía no están habilitados/);
    expect(await dueno.dominio.count({ where: { dominio: "www.lossatelites.com.ar" } })).toBe(0);
  });

  it("un dominio que Cloudflare rechaza no queda en la lista", async () => {
    cf.rechazados.add("raro.lossatelites.com.ar");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(agregarDominio(ua.id, a.id, "raro.lossatelites.com.ar")).rejects.toThrow(/No pudimos conectar raro.lossatelites.com.ar/);
    vi.restoreAllMocks();
    expect(await dueno.dominio.count({ where: { dominio: "raro.lossatelites.com.ar" } })).toBe(0);
  });

  it("Cloudflare caído al agregar: el dominio queda y Verificar crea el custom hostname", async () => {
    cf.fallas.push(503);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const id = await agregarDominio(ua.id, a.id, "www.lossatelites.com.ar");
    vi.restoreAllMocks();
    expect((await dueno.dominio.findUniqueOrThrow({ where: { id } })).proveedorId).toBeNull();
    expect(cf.de("www.lossatelites.com.ar")).toBeUndefined();
    expect(await verificarDominio(ua.id, a.id, id, dnsFalso())).toMatchObject({ verificado: false, faltaCname: true });
    expect((await dueno.dominio.findUniqueOrThrow({ where: { id } })).proveedorId).toBe(cf.de("www.lossatelites.com.ar")!.id);
  });
});

describe("verificar", () => {
  it("sin verificar NO resuelve el sitio; con CNAME (Cloudflare activo) y TXT, sí", async () => {
    const id = await agregarDominio(ua.id, a.id, "www.lossatelites.com.ar");
    expect((await proxy(pedido("www.lossatelites.com.ar"))).status).toBe(404);

    cf.activar("www.lossatelites.com.ar", { ssl: "pending_validation" });
    const r = await verificarDominio(ua.id, a.id, id, await txtDe(a.id, "www.lossatelites.com.ar"));
    expect(r).toEqual({ verificado: true });
    const res = await proxy(pedido("www.lossatelites.com.ar"));
    // No es el principal: redirige al subdominio (el principal), que sí resuelve.
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://banda-a.deocoartist.com/");

    const fila = await dueno.dominio.findUniqueOrThrow({ where: { id } });
    expect(fila).toMatchObject({ verificado: true, estadoProveedor: "active", certificado: "pending_validation" });
    expect(fila.verificadoEn).toBeInstanceOf(Date);
    expect((await dominiosDeBanda(a.id)).find((x) => x.id === id)).toMatchObject({ estado: "certificado", registros: null });
    const audit = await dueno.auditoria.findMany({ where: { tenantId: a.id }, orderBy: { fecha: "asc" } });
    expect(audit.map((x) => [x.accion, x.usuarioId])).toEqual([
      ["dominio.agregado", ua.id],
      ["dominio.verificado", ua.id],
    ]);
  });

  it("dice qué falta: el CNAME (Cloudflare no lo ve), el TXT, o los dos", async () => {
    const id = await agregarDominio(ua.id, a.id, "www.lossatelites.com.ar");
    expect(await verificarDominio(ua.id, a.id, id, dnsFalso())).toEqual({
      verificado: false,
      faltaCname: true,
      faltaTxt: true,
      destino: "customers.deocoartist.com",
      sinRespuesta: false,
    });
    expect(await verificarDominio(ua.id, a.id, id, await txtDe(a.id, "www.lossatelites.com.ar"))).toMatchObject({ faltaCname: true, faltaTxt: false });
    cf.activar("www.lossatelites.com.ar");
    const otroToken = dnsFalso({ "_deoco.www.lossatelites.com.ar": ["deoco-verificacion=otro-token"] });
    expect(await verificarDominio(ua.id, a.id, id, otroToken)).toMatchObject({ faltaCname: false, faltaTxt: true });
    expect((await dueno.dominio.findUniqueOrThrow({ where: { id } })).verificado).toBe(false);
  });

  it("Cloudflare no responde: lo dice, sin verificar", async () => {
    const id = await agregarDominio(ua.id, a.id, "www.lossatelites.com.ar");
    cf.fallas.push(503);
    expect(await verificarDominio(ua.id, a.id, id, await txtDe(a.id, "www.lossatelites.com.ar"))).toMatchObject({ verificado: false, sinRespuesta: true });
  });

  it("si Cloudflare borró el custom hostname, Verificar lo crea de nuevo", async () => {
    const id = await agregarDominio(ua.id, a.id, "www.lossatelites.com.ar");
    const viejo = cf.de("www.lossatelites.com.ar")!.id;
    cf.hostnames.clear();
    await verificarDominio(ua.id, a.id, id, dnsFalso());
    const nuevo = cf.de("www.lossatelites.com.ar")!.id;
    expect(nuevo).not.toBe(viejo);
    expect((await dueno.dominio.findUniqueOrThrow({ where: { id } })).proveedorId).toBe(nuevo);
  });

  it("dos bandas registran el mismo dominio: comparten el custom hostname; lo gana la que tiene el TXT; después, nadie más", async () => {
    const deA = await agregarDominio(ua.id, a.id, "disputado.com");
    const deB = await agregarDominio(ub.id, b.id, "disputado.com");
    expect(cf.hostnames.size).toBe(1);
    cf.activar("disputado.com");
    const dnsDeB = await txtDe(b.id, "disputado.com");

    // A no puede verificarlo con el DNS que configuró B, aunque el CNAME llegue a Deoco.
    expect(await verificarDominio(ua.id, a.id, deA, dnsDeB)).toMatchObject({ verificado: false, faltaCname: false, faltaTxt: true });
    expect(await verificarDominio(ub.id, b.id, deB, dnsDeB)).toEqual({ verificado: true });

    // Aunque A también publicara su TXT, un dominio verificado es de una sola banda.
    const tokenA = (await dueno.dominio.findUniqueOrThrow({ where: { id: deA } })).token;
    const tokenB = (await dueno.dominio.findUniqueOrThrow({ where: { id: deB } })).token;
    const ambos = dnsFalso({ "_deoco.disputado.com": [`deoco-verificacion=${tokenA}`, `deoco-verificacion=${tokenB}`] });
    await expect(verificarDominio(ua.id, a.id, deA, ambos)).rejects.toThrow(/ya está verificado por otra banda/);
    const res = await proxy(pedido("disputado.com"));
    expect(res.headers.get("location")).toBe("http://banda-b.deocoartist.com/");
  });

  it("delegado (zona nuestra): verificado cuando la zona está activa, sin TXT", async () => {
    const d = await dueno.dominio.create({ data: { tenantId: a.id, dominio: "lossatelites.com", via: "zona", proveedorId: "zona-1" } });
    cf.zonas.set("zona-1", { id: "zona-1", status: "pending", name_servers: ["ana.ns.cloudflare.com", "bob.ns.cloudflare.com"], certificado: null });
    expect(await verificarDominio(ua.id, a.id, d.id, dnsFalso())).toMatchObject({ verificado: false, faltaCname: true, faltaTxt: false });
    cf.zonas.set("zona-1", { ...cf.zonas.get("zona-1")!, status: "active", certificado: "pending_validation" });
    expect(await verificarDominio(ua.id, a.id, d.id, dnsFalso())).toEqual({ verificado: true });
    await expect(marcarPrincipal(ua.id, a.id, d.id)).rejects.toThrow(/certificado de https:\/\/lossatelites.com todavía se está emitiendo/);
    cf.zonas.get("zona-1")!.certificado = "active";
    await marcarPrincipal(ua.id, a.id, d.id);
    expect((await dueno.dominio.findUniqueOrThrow({ where: { id: d.id } })).esPrincipal).toBe(true);
  });

  it("una banda no puede verificar ni marcar dominios de otra", async () => {
    const deB = await agregarDominio(ub.id, b.id, "deb.com");
    await expect(verificarDominio(ua.id, a.id, deB, await txtDe(b.id, "deb.com"))).rejects.toThrow(/no es de esta banda/);
    await expect(marcarPrincipal(ua.id, a.id, deB)).rejects.toThrow(/no es de esta banda/);
  });
});

describe("principal", () => {
  it("sin verificar no puede ser principal", async () => {
    const id = await agregarDominio(ua.id, a.id, "www.lossatelites.com.ar");
    await expect(marcarPrincipal(ua.id, a.id, id)).rejects.toThrow(/todavía no está verificado/);
    // La base tampoco lo deja (aunque alguien saltee la función).
    await expect(dueno.dominio.update({ where: { id }, data: { esPrincipal: true } })).rejects.toThrow();
  });

  it("listo y principal: el subdominio queda de respaldo y redirige con la misma ruta", async () => {
    const id = await conectado();
    expect((await dominiosDeBanda(a.id)).find((x) => x.id === id)?.estado).toBe("listo");
    await marcarPrincipal(ua.id, a.id, id);

    const principales = await dueno.dominio.findMany({ where: { tenantId: a.id, esPrincipal: true } });
    expect(principales.map((p) => p.dominio)).toEqual(["www.lossatelites.com.ar"]);

    const directo = await proxy(pedido("www.lossatelites.com.ar", "/prensa"));
    expect(directo.status).toBe(200);
    expect(directo.headers.get(`x-middleware-request-${CABECERA.tenantId}`)).toBe(a.id);

    const viejo = await proxy(pedido("banda-a.deocoartist.com", "/prensa?foto=2", { "x-forwarded-proto": "https" }));
    expect(viejo.status).toBe(307);
    expect(viejo.headers.get("location")).toBe("https://www.lossatelites.com.ar/prensa?foto=2");

    // Con puerto (desarrollo), lo conserva.
    const conPuerto = await proxy(pedido("banda-a.deocoartist.com:3000", "/"));
    expect(conPuerto.headers.get("location")).toBe("http://www.lossatelites.com.ar:3000/");
  });

  it("el panel y los estados no cambian: app.<raiz>/b/<slug> no redirige; archivada, 404 sin redirigir", async () => {
    const id = await conectado();
    await marcarPrincipal(ua.id, a.id, id);
    expect((await proxy(pedido("app.deocoartist.com", "/b/banda-a"))).status).toBe(200);
    await dueno.tenant.update({ where: { id: a.id }, data: { estado: "ARCHIVADO" } });
    try {
      expect((await proxy(pedido("banda-a.deocoartist.com"))).status).toBe(404);
      expect((await proxy(pedido("www.lossatelites.com.ar"))).status).toBe(404);
    } finally {
      await dueno.tenant.update({ where: { id: a.id }, data: { estado: "ACTIVO" } });
    }
  });

  it("sin certificado, o con el CNAME caído, no se marca principal y explica por qué (según Cloudflare, en el momento)", async () => {
    const id = await conectado("www.lossatelites.com.ar", "pending_validation");
    await expect(marcarPrincipal(ua.id, a.id, id)).rejects.toThrow(/todavía se está emitiendo/);
    cf.activar("www.lossatelites.com.ar", { status: "moved", ssl: "active" });
    await expect(marcarPrincipal(ua.id, a.id, id)).rejects.toThrow(/El CNAME de tu dominio dejó de apuntar a Deoco/);
    cf.fallas.push(503);
    await expect(marcarPrincipal(ua.id, a.id, id)).rejects.toThrow(/No pudimos consultar el estado del dominio/);
    expect((await dueno.dominio.findUniqueOrThrow({ where: { id } })).esPrincipal).toBe(false);
    // Cloudflare emitió el certificado: ahora sí.
    cf.activar("www.lossatelites.com.ar");
    await marcarPrincipal(ua.id, a.id, id);
    expect((await dueno.dominio.findUniqueOrThrow({ where: { id } })).esPrincipal).toBe(true);
  });

  it("volver al subdominio no consulta a Cloudflare (lo cubre el comodín)", async () => {
    const id = await conectado();
    await marcarPrincipal(ua.id, a.id, id);
    const sub = await dueno.dominio.findFirstOrThrow({ where: { dominio: "banda-a.deocoartist.com" } });
    const antes = cf.pedidos.length;
    await marcarPrincipal(ua.id, a.id, sub.id);
    expect(cf.pedidos.length).toBe(antes);
    expect((await dueno.dominio.findUniqueOrThrow({ where: { id: sub.id } })).esPrincipal).toBe(true);
  });

  it("la otra banda no se entera", async () => {
    const id = await conectado();
    await marcarPrincipal(ua.id, a.id, id);
    expect((await proxy(pedido("banda-b.deocoartist.com"))).status).toBe(200);
  });
});

describe("quitar", () => {
  it("con confirmación; deja de resolver y queda en la auditoría", async () => {
    const id = await conectado();
    await expect(quitarDominio(ua.id, a.id, id, false)).rejects.toThrow(/confirmalo: deja de mostrar el sitio/);
    await quitarDominio(ua.id, a.id, id, true);
    expect(await dueno.dominio.findUnique({ where: { id } })).toBeNull();
    expect((await proxy(pedido("www.lossatelites.com.ar"))).status).toBe(404);
    // Y su custom hostname, en Cloudflare.
    expect(cf.de("www.lossatelites.com.ar")).toBeUndefined();
    const audit = await dueno.auditoria.findMany({ where: { tenantId: a.id }, orderBy: { fecha: "asc" } });
    expect(audit.map((x) => x.accion)).toEqual(["dominio.agregado", "dominio.verificado", "dominio.quitado"]);
  });

  it("el principal no se quita sin elegir otro antes", async () => {
    const id = await conectado();
    await marcarPrincipal(ua.id, a.id, id);
    await expect(quitarDominio(ua.id, a.id, id, true)).rejects.toThrow(/elegí otro como principal antes/);
    const sub = await dueno.dominio.findFirstOrThrow({ where: { dominio: "banda-a.deocoartist.com" } });
    await marcarPrincipal(ua.id, a.id, sub.id);
    await quitarDominio(ua.id, a.id, id, true);
    expect(await dueno.dominio.count({ where: { tenantId: a.id } })).toBe(1);
  });

  it("el subdominio de Deoco nunca se quita", async () => {
    const sub = await dueno.dominio.findFirstOrThrow({ where: { dominio: "banda-a.deocoartist.com" } });
    await dueno.dominio.update({ where: { id: sub.id }, data: { esPrincipal: false } });
    await expect(quitarDominio(ua.id, a.id, sub.id, true)).rejects.toThrow(/no se puede quitar/);
  });

  it("un dominio que otra banda también registró: se quita de esta, el custom hostname queda para la otra", async () => {
    const deA = await agregarDominio(ua.id, a.id, "disputado.com");
    await agregarDominio(ub.id, b.id, "disputado.com");
    await quitarDominio(ua.id, a.id, deA, true);
    expect(cf.de("disputado.com")).toBeDefined();
    const deB = await dueno.dominio.findFirstOrThrow({ where: { tenantId: b.id, dominio: "disputado.com" } });
    await quitarDominio(ub.id, b.id, deB.id, true);
    expect(cf.de("disputado.com")).toBeUndefined();
  });

  it("no quita dominios de otra banda", async () => {
    const deB = await agregarDominio(ub.id, b.id, "deb.com");
    await expect(quitarDominio(ua.id, a.id, deB, true)).rejects.toThrow(/no es de esta banda/);
  });
});
