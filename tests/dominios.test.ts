import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/nucleo/db/cliente";
import {
  agregarDominio,
  type ConsultaDns,
  delegacionesPorVencer,
  dominiosDeBanda,
  marcarPrincipal,
  pasarADelegado,
  quitarDominio,
  verificarDominio,
} from "@/nucleo/dominios";
import { CABECERA } from "@/nucleo/tenant/cabeceras";
import { proxy } from "@/proxy";
import { barrer } from "@/nucleo/barrido";
import { bandejaDeSalida, esperarCorreos, vaciarBandeja } from "@/nucleo/correo";
import { dosBandas, dueno } from "./apoyo";
import { CloudflareFalso, NAMESERVERS } from "./cloudflare-falso";

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
      via: "cname",
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
    expect(await verificarDominio(ua.id, a.id, d.id, dnsFalso())).toMatchObject({ verificado: false, via: "zona", sinRegistrar: false });
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

  it("el panel y los estados no cambian: app.<raiz>/b/<slug> no redirige; archivada, sin redirigir", async () => {
    const id = await conectado();
    await marcarPrincipal(ua.id, a.id, id);
    expect((await proxy(pedido("app.deocoartist.com", "/b/banda-a"))).status).toBe(200);
    await dueno.tenant.update({ where: { id: a.id }, data: { estado: "ARCHIVADO" } });
    try {
      // El sitio no responde (lo decide la página: solo abren las entradas o el pedido del fan) y no redirige.
      for (const host of ["banda-a.deocoartist.com", "www.lossatelites.com.ar"]) {
        const r = await proxy(pedido(host));
        expect(r.status).toBe(200);
        expect(r.headers.get("x-middleware-request-x-deoco-banda-cerrada")).toBe("1");
      }
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

describe("delegar (la zona es nuestra; la banda cambia los nameservers)", () => {
  const filas = (tenantId: string) => dueno.dominio.findMany({ where: { tenantId, via: "zona" }, orderBy: { dominio: "asc" } });

  it("crea la zona con los registros del sitio, trae lo que había (el correo) y agrega el dominio y su www", async () => {
    cf.dnsAnterior.set("lossatelites.com", [
      { type: "A", name: "lossatelites.com", content: "192.0.2.50", proxied: false }, // el sitio viejo: se reemplaza
      { type: "CNAME", name: "www.lossatelites.com", content: "viejo.ejemplo.com", proxied: false },
      { type: "MX", name: "lossatelites.com", content: "aspmx.l.google.com", proxied: false }, // el correo: queda
      { type: "TXT", name: "lossatelites.com", content: "v=spf1 include:_spf.google.com ~all", proxied: false },
    ]);
    // Escrito con www: se delega el dominio entero.
    const id = await agregarDominio(ua.id, a.id, "https://www.LosSatelites.com/", "zona");
    const z = cf.zonaDe("lossatelites.com")!;
    // SSL "Full": Cloudflare le habla al servidor por HTTPS (con "Flexible" sería por HTTP).
    expect(z.ajustes).toEqual({ ssl: "full", always_use_https: "on" });
    expect(z.registros!.map((r) => [r.type, r.name, r.content, r.proxied]).sort()).toEqual(
      [
        ["A", "lossatelites.com", "203.0.113.10", true],
        ["CNAME", "www.lossatelites.com", "lossatelites.com", true],
        ["MX", "lossatelites.com", "aspmx.l.google.com", false],
        ["TXT", "lossatelites.com", "v=spf1 include:_spf.google.com ~all", false],
      ].sort(),
    );
    expect((await filas(a.id)).map((f) => [f.dominio, f.verificado, f.proveedorId, f.nameservers])).toEqual([
      ["lossatelites.com", false, z.id, NAMESERVERS],
      ["www.lossatelites.com", false, z.id, NAMESERVERS],
    ]);
    const lista = await dominiosDeBanda(a.id);
    expect(lista.find((x) => x.id === id)).toMatchObject({
      via: "zona",
      estado: "sin-verificar",
      registros: null,
      delegacion: {
        nameservers: NAMESERVERS,
        importados: [
          { tipo: "MX", nombre: "lossatelites.com", valor: "aspmx.l.google.com" },
          { tipo: "TXT", nombre: "lossatelites.com", valor: "v=spf1 include:_spf.google.com ~all" },
        ],
        sinRegistrar: false,
        nicAr: false,
        acompanaA: null,
      },
    });
    expect(lista.find((x) => x.dominio === "www.lossatelites.com")?.delegacion?.acompanaA).toBe("lossatelites.com");
    // Hasta que cambie los nameservers, no resuelve.
    expect((await proxy(pedido("lossatelites.com"))).status).toBe(404);
  });

  it("'Ya cambié los nameservers': le pide a Cloudflare que mire; activa, quedan verificados el dominio y su www", async () => {
    const id = await agregarDominio(ua.id, a.id, "lossatelites.com", "zona");
    expect(await verificarDominio(ua.id, a.id, id)).toEqual({ verificado: false, via: "zona", sinRegistrar: false, sinRespuesta: false });
    expect(cf.activaciones).toEqual([cf.zonaDe("lossatelites.com")!.id]);

    cf.activarZona("lossatelites.com", "pending_validation");
    expect(await verificarDominio(ua.id, a.id, id)).toEqual({ verificado: true });
    expect((await filas(a.id)).map((f) => [f.dominio, f.verificado])).toEqual([
      ["lossatelites.com", true],
      ["www.lossatelites.com", true],
    ]);
    // Los dos muestran el sitio (no son el principal: redirigen al subdominio).
    expect((await proxy(pedido("www.lossatelites.com"))).headers.get("location")).toBe("http://banda-a.deocoartist.com/");
    expect((await proxy(pedido("lossatelites.com"))).status).toBe(307);
    // Principal recién con el certificado universal activo.
    await expect(marcarPrincipal(ua.id, a.id, id)).rejects.toThrow(/todavía se está emitiendo/);
    cf.activarZona("lossatelites.com", "active");
    await marcarPrincipal(ua.id, a.id, id);
    expect((await proxy(pedido("www.lossatelites.com", "/fechas"))).headers.get("location")).toBe("http://lossatelites.com/fechas");

    // Red de seguridad (C1.9): si el principal falla (una revisión ya alcanza), el subdominio y los
    // demás dominios NO redirigen al dominio roto: sirven el sitio ahí mismo.
    expect((await proxy(pedido("banda-a.deocoartist.com", "/fechas"))).status).toBe(307);
    await dueno.dominio.update({ where: { id }, data: { fallasSeguidas: 1 } });
    const sub = await proxy(pedido("banda-a.deocoartist.com", "/fechas"));
    expect(sub.status).toBe(200);
    expect(sub.headers.get("location")).toBeNull();
    expect((await proxy(pedido("www.lossatelites.com"))).headers.get("location")).toBeNull();
    // Se arregla: vuelve a redirigir al principal.
    await dueno.dominio.update({ where: { id }, data: { fallasSeguidas: 0 } });
    expect((await proxy(pedido("banda-a.deocoartist.com"))).status).toBe(307);

    // Baja a un plan sin dominio propio (3.2 núcleo d6): el dominio deja de servirse y vuelve el
    // subdominio; el dominio sigue siendo de la banda y no se suman nuevos.
    await dueno.tenant.update({ where: { id: a.id }, data: { dominiosPropios: false } });
    try {
      const r = await proxy(pedido("lossatelites.com", "/fechas"));
      expect(r.status).toBe(307);
      expect(r.headers.get("location")).toBe("http://banda-a.deocoartist.com/fechas");
      expect((await proxy(pedido("banda-a.deocoartist.com", "/fechas"))).status).toBe(200);
      expect(await dueno.dominio.count({ where: { tenantId: a.id, dominio: "lossatelites.com" } })).toBe(1);
      await expect(agregarDominio(ua.id, a.id, "otrodominio.com")).rejects.toThrow(/Tu plan no incluye dominio propio/);
    } finally {
      await dueno.tenant.update({ where: { id: a.id }, data: { dominiosPropios: true } });
    }
    expect((await proxy(pedido("banda-a.deocoartist.com"))).status).toBe(307);
  });

  it("la revisión lo detecta sola: la banda no tiene que volver a tocar nada", async () => {
    await agregarDominio(ua.id, a.id, "lossatelites.com", "zona");
    const t0 = new Date();
    expect((await barrer({ ahora: t0 })).dominios.delegados).toBe(0);
    cf.activarZona("lossatelites.com");
    // Antes de los 10 minutos no se vuelve a mirar.
    expect((await barrer({ ahora: new Date(t0.getTime() + 60_000) })).dominios.delegados).toBe(0);
    expect((await barrer({ ahora: new Date(t0.getTime() + 11 * 60_000) })).dominios.delegados).toBe(2);
    expect((await filas(a.id)).every((f) => f.verificado)).toBe(true);
    const audit = await dueno.auditoria.findMany({ where: { tenantId: a.id, accion: "dominio.verificado" } });
    expect(audit.map((x) => [x.usuarioId, (x.detalle as { por?: string }).por])).toEqual([
      [null, "revision"],
      [null, "revision"],
    ]);
    // Y un mail de "listo" al titular, uno solo.
    await barrer({ ahora: new Date(t0.getTime() + 30 * 60_000) });
    await esperarCorreos();
    const mails = bandejaDeSalida().filter((m) => m.asunto === "lossatelites.com ya está conectado a Deoco");
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ para: "a@x.com", de: { nombre: "Deoco" } });
    expect(mails[0].texto).toContain("anda en lossatelites.com y en www.lossatelites.com");
  });

  it(".com.ar que todavía no registró: queda esperando; cuando lo registra, aparecen los nameservers", async () => {
    cf.sinRegistrar.add("lossatelites.com.ar");
    const id = await agregarDominio(ua.id, a.id, "lossatelites.com.ar", "zona");
    expect(cf.zonaDe("lossatelites.com.ar")).toBeUndefined();
    expect((await dominiosDeBanda(a.id)).find((x) => x.id === id)?.delegacion).toMatchObject({ sinRegistrar: true, nicAr: true, nameservers: [] });
    expect(await verificarDominio(ua.id, a.id, id)).toMatchObject({ verificado: false, via: "zona", sinRegistrar: true });

    cf.sinRegistrar.delete("lossatelites.com.ar"); // lo registró en nic.ar
    expect(await verificarDominio(ua.id, a.id, id)).toMatchObject({ verificado: false, sinRegistrar: false });
    expect((await dominiosDeBanda(a.id)).find((x) => x.id === id)?.delegacion).toMatchObject({ sinRegistrar: false, nameservers: NAMESERVERS });
  });

  it("una zona es de una sola banda: si otra ya lo está conectando, no queda nada a medias", async () => {
    await agregarDominio(ua.id, a.id, "disputado.com", "zona");
    await expect(agregarDominio(ub.id, b.id, "disputado.com", "zona")).rejects.toThrow(/Otra banda de Deoco ya está conectando disputado.com/);
    expect(await dueno.dominio.count({ where: { tenantId: b.id, dominio: { in: ["disputado.com", "www.disputado.com"] } } })).toBe(0);
    expect(cf.zonas.size).toBe(1);
  });

  it("quitado sin haberse activado, la zona se borra (nada depende de ella); delegar de nuevo crea otra", async () => {
    const id = await agregarDominio(ua.id, a.id, "lossatelites.com", "zona");
    const zona = cf.zonaDe("lossatelites.com")!.id;
    await quitarDominio(ua.id, a.id, id, true);
    expect(cf.zonas.size).toBe(1); // queda www
    const www = await dueno.dominio.findFirstOrThrow({ where: { tenantId: a.id, dominio: "www.lossatelites.com" } });
    await quitarDominio(ua.id, a.id, www.id, true);
    expect(cf.zonas.size).toBe(0);
    await agregarDominio(ua.id, a.id, "lossatelites.com", "zona");
    expect(cf.zonas.size).toBe(1);
    expect((await filas(a.id)).map((f) => f.proveedorId)).toEqual([cf.zonaDe("lossatelites.com")!.id, cf.zonaDe("lossatelites.com")!.id]);
    expect(cf.zonaDe("lossatelites.com")!.id).not.toBe(zona);
  });

  it("no se delega si el dominio o su www ya están en la banda, ni sin la IP del servidor", async () => {
    await agregarDominio(ua.id, a.id, "www.lossatelites.com");
    await expect(agregarDominio(ua.id, a.id, "lossatelites.com", "zona")).rejects.toThrow(/www.lossatelites.com ya está registrado en esta banda/);
    delete process.env.DEOCO_IP_PUBLICA;
    await expect(agregarDominio(ua.id, a.id, "otro.com", "zona")).rejects.toThrow(/todavía no están habilitados/);
    expect(cf.zonas.size).toBe(0);
  });
});

describe("de conectado (CNAME) a delegado, sin corte", () => {
  it("prepara la zona y agrega el dominio sin www; el conectado sigue andando hasta que se activa; el custom hostname se va con el certificado listo", async () => {
    const www = await conectado("www.lossatelites.com");
    await marcarPrincipal(ua.id, a.id, www);
    const hostname = cf.de("www.lossatelites.com")!.id;
    cf.dnsAnterior.set("lossatelites.com", [
      { type: "CNAME", name: "www.lossatelites.com", content: "customers.deocoartist.com", proxied: false },
      { type: "MX", name: "lossatelites.com", content: "aspmx.l.google.com", proxied: false },
    ]);

    await pasarADelegado(ua.id, a.id, www);
    const z = cf.zonaDe("lossatelites.com")!;
    expect(z.registros!.find((r) => r.name === "www.lossatelites.com")).toMatchObject({ type: "CNAME", content: "lossatelites.com", proxied: true });
    const [apex, w] = await dueno.dominio.findMany({ where: { tenantId: a.id, dominio: { in: ["lossatelites.com", "www.lossatelites.com"] } }, orderBy: { dominio: "asc" } });
    expect(apex).toMatchObject({ via: "zona", verificado: false, proveedorId: z.id });
    expect(w).toMatchObject({ via: "cname", verificado: true, esPrincipal: true, proveedorId: hostname, migrandoA: z.id });
    // Sin corte: el principal sigue resolviendo por el CNAME.
    expect((await proxy(pedido("www.lossatelites.com"))).status).toBe(200);
    const lista = await dominiosDeBanda(a.id);
    expect(lista.find((x) => x.dominio === "www.lossatelites.com")).toMatchObject({ estado: "listo", delegacion: { migrando: true, acompanaA: "lossatelites.com" } });
    expect(lista.find((x) => x.dominio === "lossatelites.com")?.delegacion).toMatchObject({ nameservers: NAMESERVERS, importados: [{ tipo: "MX" }] });

    // La banda cambió los nameservers; el certificado de la zona todavía no está.
    cf.activarZona("lossatelites.com", "pending_validation");
    expect(await verificarDominio(ua.id, a.id, apex.id)).toEqual({ verificado: true });
    expect(await dueno.dominio.findUniqueOrThrow({ where: { id: www } })).toMatchObject({
      via: "zona",
      proveedorId: z.id,
      hostnameViejo: hostname,
      migrandoA: null,
      verificado: true,
      esPrincipal: true,
    });
    expect(cf.de("www.lossatelites.com")).toBeDefined(); // todavía: hay quien resuelve con los nameservers viejos
    expect((await proxy(pedido("www.lossatelites.com"))).status).toBe(200);

    // Certificado listo: se borra el custom hostname viejo.
    cf.activarZona("lossatelites.com", "active");
    await marcarPrincipal(ua.id, a.id, apex.id);
    expect(cf.de("www.lossatelites.com")).toBeUndefined();
    expect((await dueno.dominio.findUniqueOrThrow({ where: { id: www } })).hostnameViejo).toBeNull();
    expect((await dueno.auditoria.findMany({ where: { tenantId: a.id, accion: "dominio.delegado" } })).map((x) => x.detalle)).toEqual([
      { dominio: "www.lossatelites.com", desde: "cname" },
    ]);
  });

  it("si otra banda ya está conectando la zona, queda todo como estaba", async () => {
    await agregarDominio(ub.id, b.id, "lossatelites.com", "zona");
    const www = await conectado("www.lossatelites.com");
    await expect(pasarADelegado(ua.id, a.id, www)).rejects.toThrow(/Otra banda de Deoco ya está conectando/);
    expect(await dueno.dominio.findMany({ where: { tenantId: a.id, dominio: { in: ["lossatelites.com", "www.lossatelites.com"] } } })).toMatchObject([
      { dominio: "www.lossatelites.com", via: "cname", migrandoA: null },
    ]);
  });
});

describe("una delegación que nadie completa vence a los 14 días", () => {
  const dias = (n: number, desde = new Date()) => new Date(desde.getTime() + n * 86_400_000);

  it("se avisa dos días antes; vencida, se libera (zona y filas) y otra banda puede pedirla", async () => {
    const id = await agregarDominio(ua.id, a.id, "lossatelites.com", "zona");
    const creado = (await dueno.dominio.findUniqueOrThrow({ where: { id } })).creadoEn;
    expect((await dominiosDeBanda(a.id)).find((x) => x.id === id)?.delegacion?.vence).toEqual(dias(14, creado));
    expect(await delegacionesPorVencer(a.id, dias(11, creado))).toEqual([]);
    expect(await delegacionesPorVencer(a.id, dias(12, creado))).toEqual([{ dominio: "lossatelites.com", vence: dias(14, creado) }]);

    // Dos días antes: mail al titular con los nameservers (uno solo, aunque la revisión pase de nuevo).
    await barrer({ ahora: dias(11.5, creado) });
    await esperarCorreos();
    expect(bandejaDeSalida()).toHaveLength(0);
    await barrer({ ahora: dias(12.1, creado) });
    await barrer({ ahora: dias(13, creado) });
    await esperarCorreos();
    const [aviso, ...otros] = bandejaDeSalida();
    expect(otros).toHaveLength(0);
    expect(aviso).toMatchObject({ para: "a@x.com", asunto: "lossatelites.com: falta cambiar los nameservers" });
    expect(aviso.texto).toContain(`estos dos: ${NAMESERVERS.join(" y ")}`);
    expect(aviso.texto).toMatch(/Si no los cambiás antes del \d+ de \w+, el pedido vence/);
    expect(await dueno.dominio.count({ where: { tenantId: a.id, via: "zona" } })).toBe(2);
    await barrer({ ahora: dias(14.1, creado) });
    expect(await dueno.dominio.count({ where: { tenantId: a.id, via: "zona" } })).toBe(0);
    expect(cf.zonaDe("lossatelites.com")).toBeUndefined();
    expect(await dueno.auditoria.findFirst({ where: { tenantId: a.id, accion: "dominio.delegacion_vencida" } })).toMatchObject({
      usuarioId: null,
      detalle: { dominio: "lossatelites.com", por: "revision" },
    });
    // Disponible para otra banda.
    await agregarDominio(ub.id, b.id, "lossatelites.com", "zona");
    expect(await dueno.dominio.count({ where: { tenantId: b.id, via: "zona" } })).toBe(2);
  });

  it("si se activó, aunque la revisión llegue pasado el plazo, queda verificado (no se libera)", async () => {
    const id = await agregarDominio(ua.id, a.id, "lossatelites.com", "zona");
    const creado = (await dueno.dominio.findUniqueOrThrow({ where: { id } })).creadoEn;
    cf.activarZona("lossatelites.com");
    await barrer({ ahora: dias(15, creado) });
    expect((await dueno.dominio.findUniqueOrThrow({ where: { id } })).verificado).toBe(true);
    expect(cf.zonaDe("lossatelites.com")).toBeDefined();
  });

  it("un .com.ar que nunca registró también vence; un conectado que se estaba pasando queda como estaba", async () => {
    cf.sinRegistrar.add("lossatelites.com.ar");
    const ar = await agregarDominio(ua.id, a.id, "lossatelites.com.ar", "zona");
    const www = await conectado("www.lossatelites.com");
    await pasarADelegado(ua.id, a.id, www);
    const creado = (await dueno.dominio.findUniqueOrThrow({ where: { id: ar } })).creadoEn;
    await barrer({ ahora: dias(15, creado) });
    expect(await dueno.dominio.findMany({ where: { tenantId: a.id, NOT: { dominio: { endsWith: ".deocoartist.com" } } } })).toMatchObject([
      { dominio: "www.lossatelites.com", via: "cname", verificado: true, migrandoA: null },
    ]);
    expect(cf.de("www.lossatelites.com")).toBeDefined();
    expect(cf.zonaDe("lossatelites.com")).toBeUndefined();
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
