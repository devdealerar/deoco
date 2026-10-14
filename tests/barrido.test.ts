import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { barrer, segundosDeBarrido, vuelta } from "@/nucleo/barrido";
import { bandejaDeSalida, CORREO_COLGADO_MS, esperarCorreos, vaciarBandeja } from "@/nucleo/correo";
import { dominiosDeBanda, dominiosQueNoApuntan, REVISAR_DOMINIOS_CADA_MS, type ConsultaDns } from "@/nucleo/dominios";
import { prisma } from "@/nucleo/db/cliente";
import { EVENTO_COLGADO_MS, esperarEventos } from "@/nucleo/eventos/bus";
import { dosBandas, dueno } from "./apoyo";

process.env.DEOCO_DOMINIO_RAIZ = "deoco.com";

let a: { id: string };
let b: { id: string };
const IP = "198.51.100.7";
const dnsVacio: ConsultaDns = { a: async (h) => (h.startsWith("app.") ? [IP] : []), txt: async () => [] };

beforeEach(async () => {
  ({ a, b } = await dosBandas());
  vaciarBandeja();
});
afterAll(async () => {
  await esperarEventos();
  await esperarCorreos();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

const correo = (tenantId: string, extra: object = {}) =>
  dueno.correo.create({
    data: { tenantId, moduloId: "tienda", para: "fan@ejemplo.com", nombreRemitente: "Banda", asunto: "Hola", html: "<p>x</p>", texto: "x", ...extra },
  });

describe("barrido de eventos", () => {
  it("retoma los PENDIENTES de todas las bandas (quedaron sin entregar al reiniciarse)", async () => {
    // dosBandas() deja un evento PENDIENTE por banda, como si el proceso hubiera muerto.
    const r = await barrer({ dns: dnsVacio });
    expect(r.bandas).toBe(2);
    const eventos = await dueno.evento.findMany();
    expect(eventos.map((e) => [e.estado, e.intentos, e.tomadoEn])).toEqual([
      ["PROCESADO", 1, null],
      ["PROCESADO", 1, null],
    ]);
    expect((await barrer({ dns: dnsVacio })).bandas).toBe(0); // nada más para retomar
  });

  it("una banda ARCHIVADA no se barre (ni eventos ni correos); una SUSPENDIDA, sí", async () => {
    await dueno.tenant.update({ where: { id: a.id }, data: { estado: "ARCHIVADO" } });
    await dueno.tenant.update({ where: { id: b.id }, data: { estado: "SUSPENDIDO" } });
    await correo(a.id);
    expect((await barrer({ dns: dnsVacio })).bandas).toBe(1); // solo B
    expect((await dueno.evento.findFirstOrThrow({ where: { tenantId: a.id } })).estado).toBe("PENDIENTE");
    expect((await dueno.evento.findFirstOrThrow({ where: { tenantId: b.id } })).estado).toBe("PROCESADO");
    expect((await dueno.correo.findFirstOrThrow({ where: { tenantId: a.id } })).estado).toBe("PENDIENTE");
  });

  it("no entrega dos veces: vueltas en paralelo entregan cada evento una sola vez", async () => {
    await Promise.all([barrer({ dns: dnsVacio }), barrer({ dns: dnsVacio }), vuelta(), vuelta()]);
    await esperarEventos();
    expect((await dueno.evento.findMany()).map((e) => e.intentos)).toEqual([1, 1]);
  });

  it("uno que está entregando otro proceso no se toca; uno colgado se retoma", async () => {
    await dueno.evento.updateMany({ where: { tenantId: a.id }, data: { tomadoEn: new Date() } });
    await dueno.evento.updateMany({ where: { tenantId: b.id }, data: { tomadoEn: new Date(Date.now() - EVENTO_COLGADO_MS - 1000) } });
    await barrer({ dns: dnsVacio });
    expect((await dueno.evento.findFirstOrThrow({ where: { tenantId: a.id } })).estado).toBe("PENDIENTE");
    expect((await dueno.evento.findFirstOrThrow({ where: { tenantId: b.id } })).estado).toBe("PROCESADO");
  });

  it("el orden se respeta: si el primero lo tiene otro, no se adelanta el segundo", async () => {
    await dueno.evento.updateMany({ where: { tenantId: a.id }, data: { tomadoEn: new Date() } });
    await dueno.evento.create({ data: { tenantId: a.id, nombre: "prueba.creada", payload: {} } });
    await barrer({ dns: dnsVacio });
    expect((await dueno.evento.findMany({ where: { tenantId: a.id } })).map((e) => e.estado)).toEqual(["PENDIENTE", "PENDIENTE"]);
  });
});

describe("barrido de correos", () => {
  beforeEach(async () => {
    await dueno.evento.deleteMany();
  });

  it("un PENDIENTE sale; uno de otra banda también, y no sale dos veces", async () => {
    const c1 = await correo(a.id);
    const c2 = await correo(b.id);
    await Promise.all([barrer({ dns: dnsVacio }), barrer({ dns: dnsVacio })]);
    await esperarCorreos();
    expect(bandejaDeSalida().map((m) => m.id).sort()).toEqual([c1.id, c2.id].sort());
    expect((await dueno.correo.findMany()).map((c) => [c.estado, c.intentos])).toEqual([
      ["ENVIADO", 1],
      ["ENVIADO", 1],
    ]);
  });

  it("un FALLIDO se reintenta solo cuando vence su espera; sin `reintentarEn`, no", async () => {
    const ahora = new Date();
    const listo = await correo(a.id, { estado: "FALLIDO", intentos: 1, reintentarEn: new Date(ahora.getTime() - 1000) });
    const todavia = await correo(a.id, { estado: "FALLIDO", intentos: 1, reintentarEn: new Date(ahora.getTime() + 60_000) });
    const aMano = await correo(a.id, { estado: "FALLIDO", intentos: 3 });
    await barrer({ ahora, dns: dnsVacio });
    await esperarCorreos();
    expect(bandejaDeSalida().map((m) => m.id)).toEqual([listo.id]);
    const estado = async (id: string) => (await dueno.correo.findUniqueOrThrow({ where: { id } })).estado;
    expect([await estado(listo.id), await estado(todavia.id), await estado(aMano.id)]).toEqual(["ENVIADO", "FALLIDO", "FALLIDO"]);
  });

  it("uno colgado en ENVIANDO queda FALLIDO sin reintento (no se sabe si salió: mejor no duplicarlo)", async () => {
    const ahora = new Date();
    const colgado = await correo(a.id, { estado: "ENVIANDO", intentos: 1, tomadoEn: new Date(ahora.getTime() - CORREO_COLGADO_MS - 1000) });
    const saliendo = await correo(a.id, { estado: "ENVIANDO", intentos: 1, tomadoEn: new Date(ahora.getTime() - 1000) });
    await barrer({ ahora, dns: dnsVacio });
    await esperarCorreos();
    expect(bandejaDeSalida()).toEqual([]);
    expect(await dueno.correo.findUniqueOrThrow({ where: { id: colgado.id } })).toMatchObject({
      estado: "FALLIDO",
      reintentarEn: null,
      error: expect.stringMatching(/no se sabe si llegó/),
    });
    expect((await dueno.correo.findUniqueOrThrow({ where: { id: saliendo.id } })).estado).toBe("ENVIANDO");
  });

  it("si falla el envío, queda FALLIDO con fecha de reintento; al 3.er fallo, sin reintento", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const original = { ...process.env };
    process.env.DEOCO_CORREO = "smtp";
    process.env.DEOCO_SMTP_URL = "smtp://127.0.0.1:1"; // nadie escucha
    process.env.DEOCO_CORREO_REMITENTE = "tiendas@deoco.com";
    try {
      const c = await correo(a.id);
      await barrer({ dns: dnsVacio });
      await esperarCorreos();
      const f1 = await dueno.correo.findUniqueOrThrow({ where: { id: c.id } });
      expect(f1).toMatchObject({ estado: "FALLIDO", intentos: 1 });
      expect(f1.reintentarEn!.getTime()).toBeGreaterThan(Date.now());
      // Pasa el tiempo: dos vueltas más, cada una cuando vence la espera.
      for (const intentos of [2, 3]) {
        const fila = await dueno.correo.findUniqueOrThrow({ where: { id: c.id } });
        await barrer({ ahora: new Date(fila.reintentarEn!.getTime() + 1), dns: dnsVacio });
        await esperarCorreos();
        expect(await dueno.correo.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ estado: "FALLIDO", intentos });
      }
      expect((await dueno.correo.findUniqueOrThrow({ where: { id: c.id } })).reintentarEn).toBeNull();
    } finally {
      for (const k of ["DEOCO_CORREO", "DEOCO_SMTP_URL", "DEOCO_CORREO_REMITENTE"]) {
        if (original[k] === undefined) delete process.env[k];
        else process.env[k] = original[k];
      }
      vi.restoreAllMocks();
    }
  });
});

describe("revisión periódica de dominios propios", () => {
  beforeEach(async () => {
    await dueno.evento.deleteMany();
    process.env.DEOCO_IP_PUBLICA = IP;
  });

  const propio = (tenantId: string, dominio: string, extra: object = {}) =>
    dueno.dominio.create({ data: { tenantId, dominio, verificado: true, ...extra } });
  const dnsCon = (apuntan: string[]): ConsultaDns => ({ a: async (h) => (apuntan.includes(h) ? [IP] : ["203.0.113.9"]), txt: async () => [] });

  it("dos revisiones seguidas sin apuntar: queda marcado y la banda lo ve; el sitio no se despublica", async () => {
    await propio(a.id, "losbuenos.com");
    await propio(b.id, "otrabanda.com");
    const t0 = new Date();
    const r1 = await barrer({ ahora: t0, dns: dnsCon(["otrabanda.com"]) });
    expect(r1.dominios).toEqual({ revisados: 2, noApuntan: 0 }); // una sola falla puede ser el DNS tardando
    expect(await dominiosQueNoApuntan(a.id)).toEqual([]);

    // Antes de que toque revisar de nuevo, no se revisa.
    expect((await barrer({ ahora: new Date(t0.getTime() + 60_000), dns: dnsCon([]) })).dominios.revisados).toBe(0);

    const t1 = new Date(t0.getTime() + REVISAR_DOMINIOS_CADA_MS + 1000);
    const r2 = await barrer({ ahora: t1, dns: dnsCon(["otrabanda.com"]) });
    expect(r2.dominios).toEqual({ revisados: 2, noApuntan: 1 });
    expect(await dominiosQueNoApuntan(a.id)).toEqual([{ dominio: "losbuenos.com", desde: t1 }]);
    expect(await dominiosQueNoApuntan(b.id)).toEqual([]);
    const d = await dueno.dominio.findFirstOrThrow({ where: { dominio: "losbuenos.com" } });
    expect(d.verificado).toBe(true); // sigue resolviendo: no se despublica
    const [lista] = (await dominiosDeBanda(a.id, dnsVacio)).filter((x) => x.dominio === "losbuenos.com");
    expect(lista.noApunta).toEqual({ desde: t1, registroA: expect.objectContaining({ tipo: "A", valor: IP }) });

    // La banda lo corrige: la próxima revisión lo desmarca sola.
    const t2 = new Date(t1.getTime() + REVISAR_DOMINIOS_CADA_MS + 1000);
    await barrer({ ahora: t2, dns: dnsCon(["losbuenos.com", "otrabanda.com"]) });
    expect(await dominiosQueNoApuntan(a.id)).toEqual([]);
  });

  it("no revisa los dominios de una banda ARCHIVADA", async () => {
    await propio(a.id, "losbuenos.com");
    await propio(b.id, "otrabanda.com");
    await dueno.tenant.update({ where: { id: a.id }, data: { estado: "ARCHIVADO" } });
    expect((await barrer({ dns: dnsCon(["otrabanda.com"]) })).dominios).toEqual({ revisados: 1, noApuntan: 0 });
    expect((await dueno.dominio.findFirstOrThrow({ where: { dominio: "losbuenos.com" } })).revisadoEn).toBeNull();
  });

  it("no revisa los sin verificar ni los subdominios de la plataforma, y sin IP no marca nada", async () => {
    await propio(a.id, "sinverificar.com", { verificado: false });
    expect((await barrer({ dns: dnsCon([]) })).dominios.revisados).toBe(0);
    await propio(a.id, "losbuenos.com");
    delete process.env.DEOCO_IP_PUBLICA;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await barrer({ dns: { a: async () => [], txt: async () => [] } })).dominios.revisados).toBe(0);
    vi.restoreAllMocks();
  });
});

describe("configuración", () => {
  it("DEOCO_BARRIDO_SEGUNDOS: 60 por defecto, mínimo 5", () => {
    expect(segundosDeBarrido({})).toBe(60);
    expect(segundosDeBarrido({ DEOCO_BARRIDO_SEGUNDOS: "30" })).toBe(30);
    expect(segundosDeBarrido({ DEOCO_BARRIDO_SEGUNDOS: "1" })).toBe(60);
    expect(segundosDeBarrido({ DEOCO_BARRIDO_SEGUNDOS: "x" })).toBe(60);
  });
});
