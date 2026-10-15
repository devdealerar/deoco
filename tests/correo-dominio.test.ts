import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { barrer } from "@/nucleo/barrido";
import { bandejaDeSalida, enviarCorreo, enviarCorreoDelNucleo, esperarCorreos, vaciarBandeja } from "@/nucleo/correo";
import { prisma } from "@/nucleo/db/cliente";
import { configurarCorreo, correoDeBanda, dominiosParaCorreo, probarCorreo, quitarCorreo } from "@/nucleo/dominios/correo";
import type { Modulo } from "@/nucleo/modulos/contrato";
import { crearRegistro } from "@/nucleo/modulos/registro";
import { dosBandas, dueno } from "./apoyo";
import comercial from "../modulos/comercial";
import { CloudflareFalso } from "./cloudflare-falso";
import { ResendFalso } from "./resend-falso";

// Correo desde el dominio de la banda (D5): envío por Resend, recepción por Email Routing +
// Email Worker en los dominios delegados sin correo propio.

process.env.DEOCO_DOMINIO_RAIZ = "deocoartist.com";
const cf = new CloudflareFalso();
const resend = new ResendFalso();
const tienda: Modulo = { id: "tienda-falsa", nombre: "Tienda", permisos: [] };
const reg = crearRegistro([tienda]);

let a: { id: string };
let ua: { id: string };

beforeAll(async () => {
  ({ a, ua } = await dosBandas());
  await cf.iniciar();
  await resend.iniciar();
});
beforeEach(async () => {
  await dueno.correoDominio.deleteMany();
  await dueno.dominio.deleteMany({ where: { NOT: { dominio: { endsWith: ".deocoartist.com" } } } });
  await dueno.correo.deleteMany();
  await dueno.auditoria.deleteMany();
  vaciarBandeja();
  cf.limpiar();
  cf.usar();
  resend.limpiar();
  resend.usar();
  process.env.DEOCO_CORREO_REMITENTE = "tiendas@deocoartist.com";
});
afterAll(async () => {
  await esperarCorreos();
  await cf.cerrar();
  await resend.cerrar();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

/** Un dominio delegado y activo (zona nuestra), con lo que tenía su DNS. */
async function delegado(dominio = "lossatelites.com", dns: { type: string; name: string; content: string }[] = []) {
  const id = `z-${dominio}`;
  cf.zonas.set(id, {
    id,
    name: dominio,
    status: "active",
    name_servers: [],
    certificado: "active",
    registros: dns.map((r, i) => ({ id: `r${i}`, proxied: false, ...r })),
  });
  return dueno.dominio.create({ data: { tenantId: a.id, dominio, verificado: true, via: "zona", proveedorId: id } });
}

const mailDeLaTienda = () =>
  enviarCorreo(tienda, a.id, { para: "fan@ejemplo.com", asunto: "Tu pedido", html: "<p>Gracias</p>", texto: "Gracias" }, {}, reg);

describe("dirección de envío", () => {
  it("sin dominio propio verificado no hay dónde; sin Resend configurado, no está habilitado", async () => {
    expect(await dominiosParaCorreo(a.id)).toEqual([]);
    await dueno.dominio.create({ data: { tenantId: a.id, dominio: "sinverificar.com", via: "cname" } });
    expect(await dominiosParaCorreo(a.id)).toEqual([]);
    const d = await delegado();
    delete process.env.DEOCO_RESEND_TOKEN;
    await expect(configurarCorreo(ua.id, a.id, { dominioId: d.id, local: "merch" })).rejects.toThrow(/todavía no está habilitado/);
  });

  it("delegado sin correo propio: registros en la zona, recepción prendida y reenvío al titular; verificada, los mails de la banda salen desde ahí", async () => {
    const d = await delegado();
    await dueno.dominio.create({ data: { tenantId: a.id, dominio: "www.lossatelites.com", verificado: true, via: "zona", proveedorId: d.proveedorId } });
    expect(await dominiosParaCorreo(a.id)).toEqual([{ id: d.id, dominio: "lossatelites.com", via: "zona" }]);

    const c = await configurarCorreo(ua.id, a.id, { dominioId: d.id, local: "Merch" });
    expect(c).toMatchObject({ direccion: "merch@lossatelites.com", estado: "pendiente", recepcion: "activa", reenvioA: "a@x.com", cargadosPorDeoco: true });
    const z = cf.zonaDe("lossatelites.com")!;
    expect(z.registros!.map((r) => [r.type, r.name, r.content, r.priority]).filter(([, n]) => n !== "lossatelites.com")).toEqual([
      ["MX", "send.lossatelites.com", "feedback-smtp.us-east-1.amazonses.com", 10],
      ["TXT", "send.lossatelites.com", "v=spf1 include:amazonses.com ~all", undefined],
      ["TXT", "resend._domainkey.lossatelites.com", "p=CLAVE1", undefined],
    ]);
    expect(z.correo).toMatchObject({ prendido: true, reglaTodo: { matchers: [{ type: "all" }], actions: [{ type: "worker", value: ["deoco-reenvio"] }] } });
    expect(cf.kv.get("merch@lossatelites.com")).toBe("a@x.com");
    expect(resend.verificaciones).toEqual([resend.de("lossatelites.com")!.id]);

    // Mientras no se verifica, los mails de la banda salen desde Deoco.
    await mailDeLaTienda();
    await esperarCorreos();
    expect(bandejaDeSalida()[0].de.direccion).toBe("tiendas@deocoartist.com");

    // Resend ve los registros; el barrido lo detecta y avisa al titular.
    resend.verificar("lossatelites.com");
    vaciarBandeja();
    expect((await barrer({ ahora: new Date(Date.now() + 11 * 60_000) })).correos).toBe(1);
    expect((await correoDeBanda(a.id))?.estado).toBe("verificado");
    await mailDeLaTienda();
    await enviarCorreoDelNucleo(a.id, { para: "a@x.com", asunto: "Aviso de Deoco", html: "<p>x</p>", texto: "x", nombreRemitente: "Deoco" });
    // El gestor de cuenta (cuota, dominios) también es Deoco, aunque sea un módulo.
    await enviarCorreo(comercial, a.id, { para: "a@x.com", asunto: "Tu cuota", html: "<p>x</p>", texto: "x", nombreRemitente: "Deoco" });
    await esperarCorreos();
    const salida = bandejaDeSalida();
    expect(salida.find((m) => m.asunto === "Tus mails ya salen desde merch@lossatelites.com")).toMatchObject({ para: "a@x.com", de: { direccion: "tiendas@deocoartist.com" } });
    expect(salida.find((m) => m.asunto === "Tu pedido")?.de).toEqual({ nombre: "Banda A", direccion: "merch@lossatelites.com" });
    // Los avisos de Deoco siguen saliendo desde Deoco.
    expect(salida.find((m) => m.asunto === "Aviso de Deoco")?.de.direccion).toBe("tiendas@deocoartist.com");
    expect(salida.find((m) => m.asunto === "Tu cuota")?.de.direccion).toBe("tiendas@deocoartist.com");
  });

  it("delegado que ya tiene su correo (MX de Google): no se toca la recepción", async () => {
    const d = await delegado("lossatelites.com", [{ type: "MX", name: "lossatelites.com", content: "aspmx.l.google.com" }]);
    const c = await configurarCorreo(ua.id, a.id, { dominioId: d.id, local: "merch", reenvioA: "otro@gmail.com" });
    expect(c.recepcion).toBe("propio");
    expect(cf.zonaDe("lossatelites.com")!.correo).toBeUndefined();
    expect(cf.kv.size).toBe(0);
  });

  it("conectado por CNAME: la banda copia los registros; sin recepción", async () => {
    const d = await dueno.dominio.create({ data: { tenantId: a.id, dominio: "www.lossatelites.com", verificado: true, via: "cname", proveedorId: "ch-1" } });
    const c = await configurarCorreo(ua.id, a.id, { dominioId: d.id, local: "merch" });
    // El dominio de envío es el dominio sin www.
    expect(c).toMatchObject({ direccion: "merch@lossatelites.com", recepcion: "no", cargadosPorDeoco: false });
    expect(c.registros.map((r) => [r.tipo, r.nombre])).toEqual([
      ["MX", "send.lossatelites.com"],
      ["TXT", "send.lossatelites.com"],
      ["TXT", "resend._domainkey.lossatelites.com"],
    ]);
    expect(cf.kv.size).toBe(0);
  });

  it("cambiar la dirección mueve el reenvío y reutiliza el dominio de envío; quitar deja todo como antes", async () => {
    const d = await delegado();
    await configurarCorreo(ua.id, a.id, { dominioId: d.id, local: "merch", reenvioA: "banda@gmail.com" });
    await configurarCorreo(ua.id, a.id, { dominioId: d.id, local: "hola", reenvioA: "banda@gmail.com" });
    expect([...cf.kv.entries()]).toEqual([["hola@lossatelites.com", "banda@gmail.com"]]);
    expect(resend.dominios.size).toBe(1);

    await quitarCorreo(ua.id, a.id);
    expect(await correoDeBanda(a.id)).toBeNull();
    expect(cf.kv.size).toBe(0);
    expect(resend.dominios.size).toBe(0);
    expect((await dueno.auditoria.findMany({ where: { tenantId: a.id, accion: { startsWith: "correo." } } })).map((x) => x.accion).sort()).toEqual([
      "correo.configurado",
      "correo.configurado",
      "correo.quitado",
    ]);
  });

  it("valida la dirección y el destino", async () => {
    const d = await delegado();
    await expect(configurarCorreo(ua.id, a.id, { dominioId: d.id, local: "no válido" })).rejects.toThrow(/solo lleva letras/);
    await expect(configurarCorreo(ua.id, a.id, { dominioId: d.id, local: "merch", reenvioA: "no-es-mail" })).rejects.toThrow(/no parece un email válido/);
    await expect(configurarCorreo(ua.id, a.id, { dominioId: "00000000-0000-0000-0000-000000000000", local: "merch" })).rejects.toThrow(/Elegí un dominio/);
  });

  it("mail de prueba: solo verificada; con recepción, va a la propia dirección (prueba también el reenvío)", async () => {
    const d = await delegado();
    await configurarCorreo(ua.id, a.id, { dominioId: d.id, local: "merch", reenvioA: "banda@gmail.com" });
    await expect(probarCorreo(a.id)).rejects.toThrow(/todavía no está verificada/);
    resend.verificar("lossatelites.com");
    await barrer({ ahora: new Date(Date.now() + 11 * 60_000) });
    await esperarCorreos(); // el aviso de "verificada"
    vaciarBandeja();
    expect(await probarCorreo(a.id)).toEqual({ para: "merch@lossatelites.com", reenviaA: "banda@gmail.com" });
    expect(bandejaDeSalida()).toMatchObject([{ para: "merch@lossatelites.com", de: { nombre: "Banda A", direccion: "merch@lossatelites.com" } }]);
  });
});
