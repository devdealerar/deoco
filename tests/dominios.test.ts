import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/nucleo/db/cliente";
import {
  agregarDominio,
  type ConsultaDns,
  dominiosDeBanda,
  marcarPrincipal,
  registrosDns,
  verificarDominio,
} from "@/nucleo/dominios";
import { CABECERA } from "@/nucleo/tenant/cabeceras";
import { proxy } from "@/proxy";
import { dosBandas, dueno } from "./apoyo";

process.env.DEOCO_DOMINIO_RAIZ = "deoco.com";
process.env.DEOCO_IP_PUBLICA = "203.0.113.10";

let a: { id: string };
let b: { id: string };
let ua: { id: string };
let ub: { id: string };

beforeAll(async () => {
  ({ a, b, ua, ub } = await dosBandas());
});
beforeEach(async () => {
  await dueno.dominio.deleteMany({ where: { NOT: { dominio: { endsWith: ".deoco.com" } } } });
  await dueno.dominio.updateMany({ where: { dominio: { endsWith: ".deoco.com" } }, data: { esPrincipal: true } });
  await dueno.auditoria.deleteMany();
});
afterAll(async () => {
  await prisma.$disconnect();
  await dueno.$disconnect();
});

/** DNS falso: lo que "publicó" cada dominio. */
function dnsFalso(registros: Record<string, { a?: string[]; txt?: string[] }>): ConsultaDns {
  return {
    a: async (h) => registros[h]?.a ?? [],
    txt: async (h) => registros[h]?.txt ?? [],
  };
}

/** El DNS bien configurado para ese dominio de esa banda. */
async function dnsCorrecto(tenantId: string, dominio: string) {
  const d = await dueno.dominio.findFirstOrThrow({ where: { tenantId, dominio } });
  return dnsFalso({
    [dominio]: { a: ["203.0.113.10"] },
    [`_deoco.${dominio}`]: { txt: [`deoco-verificacion=${d.token}`] },
  });
}

const pedido = (host: string, path = "/", extra: Record<string, string> = {}) =>
  new NextRequest(`http://${host}${path}`, { headers: { host, ...extra } });

describe("registros DNS a crear", () => {
  it("el A al servidor y el TXT con el token de esa banda, exactos", async () => {
    const id = await agregarDominio(ua.id, a.id, "https://www.LosSatelites.com.ar/");
    const d = await dueno.dominio.findUniqueOrThrow({ where: { id } });
    expect(d).toMatchObject({ dominio: "www.lossatelites.com.ar", verificado: false, esPrincipal: false });

    const lista = await dominiosDeBanda(a.id, dnsFalso({}));
    const propio = lista.find((x) => x.id === id)!;
    expect(propio.registros?.map(({ tipo, nombre, valor }) => ({ tipo, nombre, valor }))).toEqual([
      { tipo: "A", nombre: "www.lossatelites.com.ar", valor: "203.0.113.10" },
      { tipo: "TXT", nombre: "_deoco.www.lossatelites.com.ar", valor: `deoco-verificacion=${d.token}` },
    ]);
    // El subdominio de la plataforma no pide nada.
    expect(lista.find((x) => x.dominio === "banda-a.deoco.com")).toMatchObject({ dePlataforma: true, registros: null });
  });

  it("sin DEOCO_IP_PUBLICA, la IP es la de app.<raiz>", async () => {
    delete process.env.DEOCO_IP_PUBLICA;
    try {
      await agregarDominio(ua.id, a.id, "lossatelites.com.ar");
      const lista = await dominiosDeBanda(a.id, dnsFalso({ "app.deoco.com": { a: ["198.51.100.7"] } }));
      expect(lista.find((x) => x.dominio === "lossatelites.com.ar")!.registros![0].valor).toBe("198.51.100.7");
    } finally {
      process.env.DEOCO_IP_PUBLICA = "203.0.113.10";
    }
  });

  it("cada banda tiene su propio token", () => {
    const [, txtA] = registrosDns("x.com", "token-a", "1.2.3.4");
    const [, txtB] = registrosDns("x.com", "token-b", "1.2.3.4");
    expect(txtA.valor).not.toBe(txtB.valor);
  });
});

describe("verificar", () => {
  it("sin verificar NO resuelve el sitio; verificado, sí", async () => {
    const id = await agregarDominio(ua.id, a.id, "lossatelites.com.ar");
    expect((await proxy(pedido("lossatelites.com.ar"))).status).toBe(404);

    const r = await verificarDominio(ua.id, a.id, id, await dnsCorrecto(a.id, "lossatelites.com.ar"));
    expect(r).toEqual({ verificado: true });
    const res = await proxy(pedido("lossatelites.com.ar"));
    // No es el principal: redirige al subdominio (el principal), que sí resuelve.
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://banda-a.deoco.com/");

    const fila = await dueno.dominio.findUniqueOrThrow({ where: { id } });
    expect(fila.verificado).toBe(true);
    expect(fila.verificadoEn).toBeInstanceOf(Date);
    const audit = await dueno.auditoria.findMany({ where: { tenantId: a.id }, orderBy: { fecha: "asc" } });
    expect(audit.map((x) => [x.accion, x.usuarioId])).toEqual([
      ["dominio.agregado", ua.id],
      ["dominio.verificado", ua.id],
    ]);
  });

  it("dice qué falta: sin registros, A a otra IP, TXT con otro token", async () => {
    const id = await agregarDominio(ua.id, a.id, "lossatelites.com.ar");
    expect(await verificarDominio(ua.id, a.id, id, dnsFalso({}))).toMatchObject({
      verificado: false,
      faltaA: true,
      faltaTxt: true,
      ipsEncontradas: [],
    });
    const mal = dnsFalso({
      "lossatelites.com.ar": { a: ["192.0.2.1"] },
      "_deoco.lossatelites.com.ar": { txt: ["deoco-verificacion=otro-token"] },
    });
    expect(await verificarDominio(ua.id, a.id, id, mal)).toMatchObject({
      verificado: false,
      faltaA: true,
      faltaTxt: true,
      ipEsperada: "203.0.113.10",
      ipsEncontradas: ["192.0.2.1"],
    });
    expect((await dueno.dominio.findUniqueOrThrow({ where: { id } })).verificado).toBe(false);
  });

  it("con el A pero sin el TXT no alcanza (apuntar a Deoco no prueba que el dominio sea tuyo)", async () => {
    const id = await agregarDominio(ua.id, a.id, "lossatelites.com.ar");
    const soloA = dnsFalso({ "lossatelites.com.ar": { a: ["203.0.113.10"] } });
    expect(await verificarDominio(ua.id, a.id, id, soloA)).toMatchObject({ verificado: false, faltaA: false, faltaTxt: true });
  });

  it("dos bandas registran el mismo dominio: lo gana la que tiene el TXT; después, nadie más", async () => {
    const deA = await agregarDominio(ua.id, a.id, "disputado.com");
    const deB = await agregarDominio(ub.id, b.id, "disputado.com");
    const dnsDeB = await dnsCorrecto(b.id, "disputado.com");

    // A no puede verificarlo con el DNS que configuró B.
    expect(await verificarDominio(ua.id, a.id, deA, dnsDeB)).toMatchObject({ verificado: false, faltaTxt: true });
    expect(await verificarDominio(ub.id, b.id, deB, dnsDeB)).toEqual({ verificado: true });

    // Aunque A también publicara su TXT, un dominio verificado es de una sola banda.
    const ambos = dnsFalso({
      "disputado.com": { a: ["203.0.113.10"] },
      "_deoco.disputado.com": {
        txt: [
          `deoco-verificacion=${(await dueno.dominio.findUniqueOrThrow({ where: { id: deA } })).token}`,
          `deoco-verificacion=${(await dueno.dominio.findUniqueOrThrow({ where: { id: deB } })).token}`,
        ],
      },
    });
    await expect(verificarDominio(ua.id, a.id, deA, ambos)).rejects.toThrow(/ya está verificado por otra banda/);
    const res = await proxy(pedido("disputado.com"));
    expect(res.headers.get("location")).toBe("http://banda-b.deoco.com/");
  });

  it("una banda no puede verificar ni marcar dominios de otra", async () => {
    const deB = await agregarDominio(ub.id, b.id, "deb.com");
    await expect(verificarDominio(ua.id, a.id, deB, await dnsCorrecto(b.id, "deb.com"))).rejects.toThrow(/no es de esta banda/);
    await expect(marcarPrincipal(ua.id, a.id, deB)).rejects.toThrow(/no es de esta banda/);
  });
});

describe("principal", () => {
  it("sin verificar no puede ser principal", async () => {
    const id = await agregarDominio(ua.id, a.id, "lossatelites.com.ar");
    await expect(marcarPrincipal(ua.id, a.id, id)).rejects.toThrow(/todavía no está verificado/);
    // La base tampoco lo deja (aunque alguien saltee la función).
    await expect(dueno.dominio.update({ where: { id }, data: { esPrincipal: true } })).rejects.toThrow();
  });

  it("verificado y principal: el subdominio queda de respaldo y redirige con la misma ruta", async () => {
    const id = await agregarDominio(ua.id, a.id, "lossatelites.com.ar");
    await verificarDominio(ua.id, a.id, id, await dnsCorrecto(a.id, "lossatelites.com.ar"));
    await marcarPrincipal(ua.id, a.id, id);

    const principales = await dueno.dominio.findMany({ where: { tenantId: a.id, esPrincipal: true } });
    expect(principales.map((p) => p.dominio)).toEqual(["lossatelites.com.ar"]);

    const directo = await proxy(pedido("lossatelites.com.ar", "/prensa"));
    expect(directo.status).toBe(200);
    expect(directo.headers.get(`x-middleware-request-${CABECERA.tenantId}`)).toBe(a.id);

    const viejo = await proxy(pedido("banda-a.deoco.com", "/prensa?foto=2", { "x-forwarded-proto": "https" }));
    expect(viejo.status).toBe(307);
    expect(viejo.headers.get("location")).toBe("https://lossatelites.com.ar/prensa?foto=2");

    // Con puerto (desarrollo), lo conserva.
    const conPuerto = await proxy(pedido("banda-a.deoco.com:3000", "/"));
    expect(conPuerto.headers.get("location")).toBe("http://lossatelites.com.ar:3000/");
  });

  it("el panel y los estados no cambian: app.<raiz>/b/<slug> no redirige; archivada, 404 sin redirigir", async () => {
    const id = await agregarDominio(ua.id, a.id, "lossatelites.com.ar");
    await verificarDominio(ua.id, a.id, id, await dnsCorrecto(a.id, "lossatelites.com.ar"));
    await marcarPrincipal(ua.id, a.id, id);
    expect((await proxy(pedido("app.deoco.com", "/b/banda-a"))).status).toBe(200);
    await dueno.tenant.update({ where: { id: a.id }, data: { estado: "ARCHIVADO" } });
    try {
      expect((await proxy(pedido("banda-a.deoco.com"))).status).toBe(404);
      expect((await proxy(pedido("lossatelites.com.ar"))).status).toBe(404);
    } finally {
      await dueno.tenant.update({ where: { id: a.id }, data: { estado: "ACTIVO" } });
    }
  });

  it("la otra banda no se entera", async () => {
    const id = await agregarDominio(ua.id, a.id, "lossatelites.com.ar");
    await verificarDominio(ua.id, a.id, id, await dnsCorrecto(a.id, "lossatelites.com.ar"));
    await marcarPrincipal(ua.id, a.id, id);
    expect((await proxy(pedido("banda-b.deoco.com"))).status).toBe(200);
  });
});
