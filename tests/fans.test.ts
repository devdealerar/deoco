import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bandejaDeSalida, esperarCorreos, vaciarBandeja } from "@/nucleo/correo";
import { prisma } from "@/nucleo/db/cliente";
import { conTenant } from "@/nucleo/db/con-tenant";
import { datosDeLaPersona, suprimirDatosDeLaPersona } from "@/nucleo/legal/derechos";
import { contactosEnCsv, confirmarSuscripcion, darDeBaja, metricas, pedirSuscripcion } from "../modulos/fans/contactos";
import { BAJAS_ACEPTABLES, CUPO_INICIAL, cupoDiario, enviarTanda, guardarBorrador, mandarEnvio, marcarAbierta } from "../modulos/fans/envios";
import { avisoBaja } from "../modulos/fans/aviso";
import fans from "../modulos/fans";
import { dueno, escenarioAcceso } from "./apoyo";

// D4: base de fans y newsletter (documento maestro "Newsletter"; docs/privacidad.md §9).

let e: Awaited<ReturnType<typeof escenarioAcceso>>;

const mailA = (para: string) => bandejaDeSalida().filter((m) => m.para === para);
const tokenDe = (texto: string, ruta: string) => texto.match(new RegExp(`${ruta}#([0-9a-f]{64})`))![1];

async function suscriptoConfirmado(email: string) {
  vaciarBandeja();
  await pedirSuscripcion(e.a.id, { email, origen: "formulario" });
  await esperarCorreos();
  expect(await confirmarSuscripcion(e.a.id, tokenDe(mailA(email)[0].texto, "/novedades/confirmar"))).toBe(true);
}

async function pedidoPagado(email: string, novedades: boolean) {
  return dueno.tiendaPedido.create({
    data: {
      tenantId: e.a.id, estado: "PAGADO", nombre: "Lucía Pérez", email, telefono: "341 555-1234", calle: "Córdoba", numero: "1234", ciudad: "Rosario", provincia: "Santa Fe",
      codigoPostal: "2000", subtotal: 1000, envio: 0, envios: [], total: 1000, tokenHash: "h".repeat(64), pagadoEn: new Date(), novedades,
    },
  });
}

const manejador = (evento: string) => fans.eventosEscucha!.find((x) => x.evento === evento)!.manejador;

beforeAll(async () => {
  e = await escenarioAcceso();
  await dueno.moduloTenant.createMany({ data: ["fans", "tienda", "ticketera"].map((moduloId) => ({ tenantId: e.a.id, moduloId })), skipDuplicates: true });
});
beforeEach(async () => {
  await esperarCorreos();
  await dueno.$executeRawUnsafe(`TRUNCATE "fans_contacto", "fans_envio", "fans_compra", "fans_entrega", "supresion_datos" CASCADE`);
  vaciarBandeja();
});
afterAll(async () => {
  await esperarCorreos();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("suscripción con doble confirmación", () => {
  it("queda pendiente hasta abrir el link; se guarda la prueba del consentimiento", async () => {
    await pedirSuscripcion(e.a.id, { email: "Lucia@Fan.com", nombre: "Lucía", origen: "formulario" });
    await esperarCorreos();
    const c = await dueno.fansContacto.findFirstOrThrow({ where: { tenantId: e.a.id } });
    expect(c).toMatchObject({ email: "lucia@fan.com", newsletter: "pendiente", consentimientoOrigen: "formulario del sitio" });
    expect(c.consentimiento).toContain("Me puedo dar de baja");
    expect(c.confirmarHash).toMatch(/^[0-9a-f]{64}$/);
    const token = tokenDe(mailA("lucia@fan.com")[0].texto, "/novedades/confirmar");
    expect(c.confirmarHash).not.toContain(token); // nunca en claro
    expect(await confirmarSuscripcion(e.a.id, "0".repeat(64))).toBe(false);
    expect(await confirmarSuscripcion(e.a.id, token)).toBe(true);
    expect((await dueno.fansContacto.findFirstOrThrow({ where: { id: c.id } })).newsletter).toBe("confirmado");
    // El link sirve una vez.
    expect(await confirmarSuscripcion(e.a.id, token)).toBe(false);
  });

  it("el link vence; pedirlo de nuevo manda uno nuevo y el viejo deja de servir", async () => {
    await pedirSuscripcion(e.a.id, { email: "lucia@fan.com", origen: "formulario" });
    await esperarCorreos();
    const viejo = tokenDe(mailA("lucia@fan.com")[0].texto, "/novedades/confirmar");
    expect(await confirmarSuscripcion(e.a.id, viejo, new Date(Date.now() + 8 * 86_400_000))).toBe(false);
    // El freno: dentro de los 10 minutos no se manda otro (nadie llena la casilla de nadie).
    await pedirSuscripcion(e.a.id, { email: "lucia@fan.com", origen: "formulario" });
    await esperarCorreos();
    expect(mailA("lucia@fan.com")).toHaveLength(1);
    await dueno.fansContacto.updateMany({ data: { pedidoEn: new Date(Date.now() - 11 * 60_000) } });
    await pedirSuscripcion(e.a.id, { email: "lucia@fan.com", origen: "formulario" });
    await esperarCorreos();
    const nuevo = tokenDe(mailA("lucia@fan.com")[1].texto, "/novedades/confirmar");
    expect(await confirmarSuscripcion(e.a.id, viejo)).toBe(false);
    expect(await confirmarSuscripcion(e.a.id, nuevo)).toBe(true);
  });

  it("quien pidió borrar sus datos no vuelve a la base", async () => {
    await suscriptoConfirmado("lucia@fan.com");
    await suprimirDatosDeLaPersona(e.a.id, "lucia@fan.com");
    expect((await datosDeLaPersona(e.a.id, "lucia@fan.com")).find((s) => s.titulo === "Base de fans y newsletter")).toBeUndefined();
    await pedirSuscripcion(e.a.id, { email: "lucia@fan.com", origen: "formulario" });
    expect(await dueno.fansContacto.count({ where: { email: "lucia@fan.com" } })).toBe(0);
  });

  it("la base de una banda no se ve desde otra", async () => {
    await suscriptoConfirmado("lucia@fan.com");
    expect(await conTenant(e.b.id, (tx) => tx.fansContacto.count())).toBe(0);
  });
});

describe("compradores", () => {
  it("una compra pagada suma al comprador una vez; con la casilla tildada, pide la confirmación", async () => {
    const p = await pedidoPagado("comprador@fan.com", true);
    await manejador("pedido.pagado")({ id: "x", nombre: "pedido.pagado", tenantId: e.a.id, usuarioId: null, fecha: new Date(), payload: { pedidoId: p.id } });
    await manejador("pedido.pagado")({ id: "x", nombre: "pedido.pagado", tenantId: e.a.id, usuarioId: null, fecha: new Date(), payload: { pedidoId: p.id } });
    await esperarCorreos();
    const c = await dueno.fansContacto.findFirstOrThrow({ where: { email: "comprador@fan.com" } });
    expect(c).toMatchObject({ compras: 1, origen: "tienda", provincia: "Santa Fe", newsletter: "pendiente", consentimientoOrigen: "casilla en la compra (tienda)" });
    expect(mailA("comprador@fan.com").some((m) => m.asunto.startsWith("Confirmá"))).toBe(true);
    // Sin la casilla: está en la base, pero no recibe el newsletter.
    const q = await pedidoPagado("otro@fan.com", false);
    await manejador("pedido.pagado")({ id: "y", nombre: "pedido.pagado", tenantId: e.a.id, usuarioId: null, fecha: new Date(), payload: { pedidoId: q.id } });
    expect((await dueno.fansContacto.findFirstOrThrow({ where: { email: "otro@fan.com" } })).newsletter).toBe("no");
    const m = await metricas(e.a.id);
    expect(m).toMatchObject({ total: 2, suscriptos: 0, pendientes: 1, conCompra: 2, repiten: 0 });
    expect(m.provincias).toEqual([{ provincia: "Santa Fe", cantidad: 2 }]);
  });
});

describe("envíos", () => {
  it("le llega a los confirmados, con baja en un clic (enlace y List-Unsubscribe); aperturas y bajas cuentan", async () => {
    await suscriptoConfirmado("uno@fan.com");
    await suscriptoConfirmado("dos@fan.com");
    await pedirSuscripcion(e.a.id, { email: "sin-confirmar@fan.com", origen: "formulario" });
    await esperarCorreos();
    const id = await guardarBorrador(e.a.id, e.multi.id, { asunto: "Gira de verano", cuerpo: "Hola!\n\nSalimos de gira." });
    vaciarBandeja();
    expect(await mandarEnvio(e.a.id, id, e.multi.id)).toEqual({ destinatarios: 2 });
    await enviarTanda(e.a.id);
    await esperarCorreos();
    expect(bandejaDeSalida().map((m) => m.para).sort()).toEqual(["dos@fan.com", "uno@fan.com"]);
    const mail = mailA("uno@fan.com")[0];
    expect(mail.html).toContain("<p>Salimos de gira.</p>");
    expect(mail.texto).toContain("Podés darte de baja cuando quieras");
    expect(mail.cabeceras?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const directa = mail.cabeceras!["List-Unsubscribe"].slice(1, -1);
    // Un segundo intento no duplica.
    await enviarTanda(e.a.id);
    await esperarCorreos();
    expect(bandejaDeSalida()).toHaveLength(2);
    expect((await dueno.fansEnvio.findUniqueOrThrow({ where: { id } })).estado).toBe("ENVIADO");

    const entrega = await dueno.fansEntrega.findFirstOrThrow({ where: { contacto: { email: "uno@fan.com" } } });
    await marcarAbierta(e.a.id, entrega.id);
    await marcarAbierta(e.a.id, entrega.id);
    const url = new URL(directa);
    const r = await avisoBaja({ tenantId: e.a.id, metodo: "POST", params: { entrega: url.pathname.split("/").pop()! }, consulta: url.searchParams, cabeceras: new Headers(), cuerpo: new Uint8Array(), texto: () => "", json: () => null });
    expect(r.estado).toBeUndefined();
    const despues = await dueno.fansEntrega.findUniqueOrThrow({ where: { id: entrega.id } });
    expect(despues.abiertaEn).not.toBeNull();
    expect(despues.bajaEn).not.toBeNull();
    expect((await dueno.fansContacto.findFirstOrThrow({ where: { email: "uno@fan.com" } })).newsletter).toBe("baja");
    // El link del cuerpo (después de "#") también da de baja (idempotente).
    expect(await darDeBaja(e.a.id, mailA("dos@fan.com")[0].texto.match(/\/novedades\/baja\?e=[0-9a-f-]+#([0-9a-f]{64})/)![1])).toBe(true);
    expect(await darDeBaja(e.a.id, "f".repeat(64))).toBe(false);
  });

  it("el cupo del día: lo que no entra sale mañana; quien se da de baja antes no lo recibe", async () => {
    for (let i = 0; i < 3; i++) await suscriptoConfirmado(`f${i}@fan.com`);
    const id = await guardarBorrador(e.a.id, e.multi.id, { asunto: "Nuevo disco", cuerpo: "Ya salió." });
    // Hoy ya salieron casi todos los del cupo (entregas de un envío anterior).
    const viejo = await dueno.fansEnvio.create({ data: { tenantId: e.a.id, asunto: "Antes", cuerpo: "x", estado: "ENVIADO" } });
    const { cupo } = await cupoDiario(e.a.id);
    expect(cupo).toBe(CUPO_INICIAL.deoco);
    const relleno = await Promise.all(Array.from({ length: cupo - 1 }, (_, i) => dueno.fansContacto.create({ data: { tenantId: e.a.id, email: `r${i}@x.com`, origen: "formulario" } })));
    await dueno.fansEntrega.createMany({ data: relleno.map((r) => ({ tenantId: e.a.id, envioId: viejo.id, contactoId: r.id, estado: "ENVIADA", enviadaEn: new Date() })) });

    vaciarBandeja();
    await mandarEnvio(e.a.id, id, e.multi.id);
    await enviarTanda(e.a.id);
    await esperarCorreos();
    expect(bandejaDeSalida().map((m) => `${m.para}:${m.asunto}`)).toHaveLength(1); // entró uno solo
    expect((await dueno.fansEnvio.findUniqueOrThrow({ where: { id } })).estado).toBe("ENVIANDO");
    // Se da de baja uno de los que faltan.
    const falta = await dueno.fansEntrega.findFirstOrThrow({ where: { envioId: id, estado: "PENDIENTE" }, include: { contacto: true } });
    await conTenant(e.a.id, (tx) => tx.fansContacto.update({ where: { id: falta.contactoId }, data: { newsletter: "baja" } }));
    // Mañana.
    await enviarTanda(e.a.id, new Date(Date.now() + 86_400_000));
    await esperarCorreos();
    expect(bandejaDeSalida()).toHaveLength(2);
    expect(bandejaDeSalida().some((m) => m.para === falta.contacto.email)).toBe(false);
    expect((await dueno.fansEnvio.findUniqueOrThrow({ where: { id } })).estado).toBe("ENVIADO");
  });

  it("el cupo crece con cada semana con pocas bajas y vuelve al inicial con muchas", async () => {
    const envio = await dueno.fansEnvio.create({ data: { tenantId: e.a.id, asunto: "a", cuerpo: "b", estado: "ENVIADO" } });
    const contactos = await Promise.all(Array.from({ length: 100 }, (_, i) => dueno.fansContacto.create({ data: { tenantId: e.a.id, email: `s${i}@x.com`, origen: "formulario" } })));
    const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000);
    // Hace una semana: 100 enviados, 1 baja (1 %): buena.
    await dueno.fansEntrega.createMany({ data: contactos.map((c, i) => ({ tenantId: e.a.id, envioId: envio.id, contactoId: c.id, estado: "ENVIADA", enviadaEn: hace(3), bajaEn: i === 0 ? hace(3) : null })) });
    expect((await cupoDiario(e.a.id)).cupo).toBe(CUPO_INICIAL.deoco * 2);
    // Con más bajas que el umbral, no crece.
    await dueno.fansEntrega.updateMany({ where: { envioId: envio.id, contactoId: { in: contactos.slice(0, Math.ceil(100 * BAJAS_ACEPTABLES) + 1).map((c) => c.id) } }, data: { bajaEn: hace(3) } });
    expect((await cupoDiario(e.a.id)).cupo).toBe(CUPO_INICIAL.deoco);
  });
});

describe("datos del fan y exportación", () => {
  it("el fan ve lo suyo (con la prueba del consentimiento); la exportación lo lleva sin los tokens", async () => {
    await suscriptoConfirmado("lucia@fan.com");
    const datos = await datosDeLaPersona(e.a.id, "lucia@fan.com");
    const fila = datos.find((s) => s.titulo === "Base de fans y newsletter")!.filas[0];
    expect(fila).toMatchObject({ email: "lucia@fan.com", newsletter: "confirmado", desde: "formulario del sitio" });
    const csv = await contactosEnCsv(e.a.id);
    expect(csv).toContain("lucia@fan.com");
    expect(csv).not.toMatch(/Hash|Cifrado/);
  });
});
