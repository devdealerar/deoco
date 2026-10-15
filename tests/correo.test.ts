import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SMTPServer } from "smtp-server";
import { problemasDeCorreo as problemasDeArranqueCorreo } from "@/nucleo/correo/transporte";
import { bandejaDeSalida, enviarCorreo, enviarCorreoDelNucleo, esperarCorreos, reintentarCorreo, vaciarBandeja } from "@/nucleo/correo";
import { avisarAlTitular } from "@/nucleo/correo/deoco";
import { conTenant } from "@/nucleo/db/con-tenant";
import { prisma } from "@/nucleo/db/cliente";
import type { Modulo } from "@/nucleo/modulos/contrato";
import { crearRegistro } from "@/nucleo/modulos/registro";
import { dosBandas, dueno } from "./apoyo";

const tienda: Modulo = { id: "tienda-falsa", nombre: "Tienda", permisos: [] };
const reg = crearRegistro([tienda]);
const mensaje = {
  para: "fan@ejemplo.com",
  asunto: "Tu pedido #123",
  html: "<p>Gracias por tu compra</p>",
  texto: "Gracias por tu compra",
  responderA: "prensa@banda-a.com",
};
const enviar = (tenantId: string, extra: Partial<typeof mensaje> = {}, opciones = {}) =>
  enviarCorreo(tienda, tenantId, { ...mensaje, ...extra }, opciones, reg);

let a: { id: string };
let b: { id: string };
const entornoOriginal = { ...process.env };

beforeAll(async () => {
  ({ a, b } = await dosBandas());
});
beforeEach(async () => {
  await dueno.correo.deleteMany();
  vaciarBandeja();
});
afterEach(() => {
  for (const k of ["DEOCO_CORREO", "DEOCO_SMTP_URL", "DEOCO_CORREO_REMITENTE", "NODE_ENV"]) {
    if (entornoOriginal[k] === undefined) delete process.env[k];
    else Object.assign(process.env, { [k]: entornoOriginal[k] });
  }
  vi.restoreAllMocks();
});
afterAll(async () => {
  await esperarCorreos();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("enviarCorreo", () => {
  it("sale después, a nombre de la banda, desde la dirección de Deoco, con responder-a de la banda", async () => {
    process.env.DEOCO_CORREO_REMITENTE = "tiendas@deocoartist.com";
    const { id, repetido } = await enviar(a.id);
    expect(repetido).toBe(false);
    await esperarCorreos();
    const [m] = bandejaDeSalida();
    expect(m).toMatchObject({
      id,
      de: { nombre: "Banda A", direccion: "tiendas@deocoartist.com" },
      para: "fan@ejemplo.com",
      responderA: "prensa@banda-a.com",
      asunto: "Tu pedido #123",
    });
    expect(await dueno.correo.findUniqueOrThrow({ where: { id } })).toMatchObject({
      estado: "ENVIADO",
      intentos: 1,
      moduloId: "tienda-falsa",
    });
  });

  it("sin responder-a, la respuesta le llega al titular de la banda (nunca a Deoco)", async () => {
    const { id } = await enviarCorreo(tienda, a.id, { para: "fan@ejemplo.com", asunto: "Hola", html: "<p>Hola</p>", texto: "Hola" }, {}, reg);
    await enviarCorreo(tienda, b.id, { para: "fan@ejemplo.com", asunto: "Hola", html: "<p>Hola</p>", texto: "Hola" }, {}, reg);
    await esperarCorreos();
    expect((await dueno.correo.findUniqueOrThrow({ where: { id } })).responderA).toBe("a@x.com");
    expect(bandejaDeSalida().map((m) => m.responderA).sort()).toEqual(["a@x.com", "b@x.com"]);
  });

  it("en la transacción de quien lo pide: si se revierte, no existe ni sale", async () => {
    await expect(
      conTenant(a.id, async (tx) => {
        await enviar(a.id, {}, { tx });
        throw new Error("falló el pedido");
      }),
    ).rejects.toThrow("falló el pedido");
    await esperarCorreos();
    expect(await dueno.correo.count()).toBe(0);
    expect(bandejaDeSalida()).toHaveLength(0);

    await conTenant(a.id, (tx) => enviar(a.id, {}, { tx }));
    await esperarCorreos();
    expect(bandejaDeSalida()).toHaveLength(1);
  });

  it("con `unica`, el mismo correo sale una sola vez (también en una transacción)", async () => {
    expect((await enviar(a.id, {}, { unica: "pedido:1:fan" })).repetido).toBe(false);
    expect((await enviar(a.id, {}, { unica: "pedido:1:fan" })).repetido).toBe(true);
    await conTenant(a.id, async (tx) => {
      expect((await enviar(a.id, {}, { tx, unica: "pedido:1:fan" })).repetido).toBe(true);
      await tx.correo.count(); // la transacción sigue viva
    });
    await esperarCorreos();
    expect(bandejaDeSalida()).toHaveLength(1);
    expect(await dueno.correo.count()).toBe(1);
  });

  it("valida direcciones y frena la inyección de cabeceras", async () => {
    await expect(enviar(a.id, { para: "no es un mail" })).rejects.toThrow(/no es una dirección/);
    await expect(enviar(a.id, { para: "a@b.com, otro@c.com" })).rejects.toThrow(/no es una dirección/);
    await expect(enviar(a.id, { asunto: "Hola\r\nBcc: todos@x.com" })).rejects.toThrow(/saltos de línea/);
    await expect(enviar(a.id, { responderA: "x" })).rejects.toThrow(/responder/);
    await expect(enviarCorreo({ ...tienda }, a.id, mensaje, {}, reg)).rejects.toThrow(/no es un módulo registrado/);
    expect(await dueno.correo.count()).toBe(0);
  });

  it("cada banda ve solo sus correos", async () => {
    await enviar(a.id);
    await esperarCorreos();
    expect(await conTenant(a.id, (tx) => tx.correo.count())).toBe(1);
    expect(await conTenant(b.id, (tx) => tx.correo.count())).toBe(0);
    expect(await prisma.correo.count()).toBe(0); // sin banda, nada
  });

  it("en producción sin transporte configurado, quedan pendientes (no se pierden)", async () => {
    Object.assign(process.env, { NODE_ENV: "production" });
    delete process.env.DEOCO_CORREO;
    const { id } = await enviar(a.id);
    await esperarCorreos();
    expect((await dueno.correo.findUniqueOrThrow({ where: { id } })).estado).toBe("PENDIENTE");
    expect(bandejaDeSalida()).toHaveLength(0);
  });
});

describe("correos del núcleo (de Deoco, sin módulo)", () => {
  it("mismo camino que los de los módulos: fila con origen nucleo, sale después, una sola vez con la misma clave", async () => {
    const r1 = await enviarCorreoDelNucleo(a.id, { ...mensaje, responderA: undefined, nombreRemitente: "Deoco" }, { unica: "aviso-1" });
    const r2 = await enviarCorreoDelNucleo(a.id, { ...mensaje, responderA: undefined, nombreRemitente: "Deoco" }, { unica: "aviso-1" });
    expect(r2).toEqual({ id: r1.id, repetido: true });
    await esperarCorreos();
    expect(bandejaDeSalida()).toHaveLength(1);
    // Sin "responder a": que no le responda al propio titular.
    expect(await dueno.correo.findUniqueOrThrow({ where: { id: r1.id } })).toMatchObject({ moduloId: "nucleo", estado: "ENVIADO", responderA: null, nombreRemitente: "Deoco" });
  });

  it("avisarAlTitular: al titular, con el botón al panel de la banda y la casilla de Deoco para responder", async () => {
    process.env.DEOCO_CUOTA_RESPONDER_A = "hola@deocoartist.com";
    try {
      await avisarAlTitular(a.id, {
        clave: "prueba",
        asunto: (banda) => `${banda}: algo pasó`,
        parrafos: () => ["Primer párrafo con <html>."],
        boton: { texto: "Ir a Dominios", ruta: "/dominios" },
      });
    } finally {
      delete process.env.DEOCO_CUOTA_RESPONDER_A;
    }
    await esperarCorreos();
    const [m] = bandejaDeSalida();
    expect(m).toMatchObject({ para: "a@x.com", asunto: "Banda A: algo pasó", responderA: "hola@deocoartist.com", de: { nombre: "Deoco" } });
    expect(m.html).toContain("Primer párrafo con &lt;html&gt;.");
    expect(m.texto).toMatch(/Ir a Dominios: https?:\/\/app\.[^/]+\/b\/banda-a\/dominios/);
  });
});

describe("SMTP de verdad (servidor local) y reintento", () => {
  it("si el servidor no responde queda FALLIDO con el motivo; al reintentar con el servidor arriba, sale", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const recibidos: string[] = [];
    const servidor = new SMTPServer({
      authOptional: true,
      disabledCommands: ["STARTTLS"],
      onData(stream, _sesion, listo) {
        let datos = "";
        stream.on("data", (c) => (datos += c));
        stream.on("end", () => {
          recibidos.push(datos);
          listo();
        });
      },
    });
    await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
    const puerto = (servidor.server.address() as { port: number }).port;
    process.env.DEOCO_CORREO = "smtp";
    process.env.DEOCO_CORREO_REMITENTE = "tiendas@deocoartist.com";
    try {
      process.env.DEOCO_SMTP_URL = "smtp://127.0.0.1:1"; // nadie escucha
      const { id } = await enviar(a.id);
      await esperarCorreos();
      const fallido = await dueno.correo.findUniqueOrThrow({ where: { id } });
      expect(fallido.estado).toBe("FALLIDO");
      expect(fallido.error).toMatch(/ECONNREFUSED|connect/i);

      process.env.DEOCO_SMTP_URL = `smtp://127.0.0.1:${puerto}`;
      await reintentarCorreo(a.id, id);
      expect(await dueno.correo.findUniqueOrThrow({ where: { id } })).toMatchObject({ estado: "ENVIADO", intentos: 2, error: null });
      expect(recibidos).toHaveLength(1);
      const crudo = recibidos[0];
      expect(crudo).toMatch(/^From: "?Banda A"? <tiendas@deocoartist\.com>/m);
      expect(crudo).toMatch(/^To: fan@ejemplo\.com/m);
      expect(crudo).toMatch(/^Reply-To: prensa@banda-a\.com/m);
      expect(crudo).toMatch(/^Subject: Tu pedido #123/m);
      expect(crudo).toContain(`X-Deoco-Correo: ${id}`);
      await expect(reintentarCorreo(a.id, id)).rejects.toThrow(/no está fallido/);
    } finally {
      await new Promise<void>((ok) => servidor.close(() => ok()));
    }
  });
});

describe("configuración", () => {
  it("smtp exige URL y remitente; un modo desconocido se avisa", () => {
    expect(problemasDeArranqueCorreo({})).toEqual([]);
    expect(problemasDeArranqueCorreo({ DEOCO_CORREO: "memoria" })).toEqual([]);
    expect(problemasDeArranqueCorreo({ DEOCO_CORREO: "smtp" })).toHaveLength(2);
    expect(problemasDeArranqueCorreo({ DEOCO_CORREO: "smtp", DEOCO_SMTP_URL: "http://x", DEOCO_CORREO_REMITENTE: "a@b.com" })).toEqual([
      expect.stringMatching(/smtp:\/\/ o smtps:\/\//),
    ]);
    expect(
      problemasDeArranqueCorreo({ DEOCO_CORREO: "smtp", DEOCO_SMTP_URL: "smtps://u:p@smtp.resend.com:465", DEOCO_CORREO_REMITENTE: "a@b.com" }),
    ).toEqual([]);
    expect(problemasDeArranqueCorreo({ DEOCO_CORREO: "resend" })).toEqual([expect.stringMatching(/no existe/)]);
  });
});
