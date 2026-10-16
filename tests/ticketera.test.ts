import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { atenderAviso } from "@/nucleo/avisos";
import { bandejaDeSalida, esperarCorreos, vaciarBandeja } from "@/nucleo/correo";
import { conTenant } from "@/nucleo/db/con-tenant";
import { prisma } from "@/nucleo/db/cliente";
import { esperarEventos } from "@/nucleo/eventos/bus";
import { guardarSecreto } from "@/nucleo/secretos/carga";
import { conFechasVivas } from "../modulos/sitio/fechas";
import type { ContenidoSitio } from "../modulos/sitio/contenido";
import {
  comprar,
  compraConToken,
  conciliarCompras,
  MAXIMO_POR_COMPRA,
  MAXIMO_POR_EMAIL_Y_SHOW,
  RESERVAS_ABIERTAS_POR_EMAIL,
  RESERVAS_ABIERTAS_POR_IP,
  registrarPago,
  RESERVA_MINUTOS,
} from "../modulos/ticketera/compras";
import { pagosParaDevolver } from "@/nucleo/pagos/registro";
import { guardarFrenos, crearEvento, crearTipo, actualizarTipo, evento, publicarEvento, proximasFechas, cambiarFoto } from "../modulos/ticketera/eventos";
import { resumenPuerta, validarEntrada } from "../modulos/ticketera/puerta";
import { dueno, escenarioAcceso } from "./apoyo";
import { MercadoPagoFalso } from "./mercadopago-falso";

const mp = new MercadoPagoFalso();
const TOKEN_A = "APP_USR-ticketera-a";
const ORIGEN = "https://banda-a.deocoartist.com";
let e: Awaited<ReturnType<typeof escenarioAcceso>>;
let titularB = "";

const EN_UN_MES = new Date(Date.now() + 30 * 86400_000);
const datosShow = (extra: Partial<{ nombre: string; fecha: Date }> = {}) => ({
  nombre: "Gira Satélite", fecha: EN_UN_MES, lugar: "La Trastienda", ciudad: "CABA", direccion: "Balcarce 460", descripcion: "", ...extra,
});
const tipo = { nombre: "General", precio: 1500000, cupo: 3, ventaDesde: null, ventaHasta: null };

/** Show publicado de A con un tipo "General" (cupo 3, $15.000). */
async function showDeA(cupo = 3) {
  const id = await crearEvento(e.a.id, datosShow());
  await crearTipo(e.a.id, id, { ...tipo, cupo });
  await publicarEvento(e.a.id, id, true);
  const ev = (await evento(e.a.id, id))!;
  return { id, tipoId: ev.tipos[0].id };
}

const persona = (i: number) => ({ nombre: `Fan ${i}`, documento: `3000000${i}` });
const compraDe = (tipoId: string, cantidad: number, ahora?: Date, email = "lucia@fan.com", ip: string | null = null) =>
  comprar(e.a.id, { tipoId, cantidad, nombre: "Lucía Fan", email, asistentes: Array.from({ length: cantidad }, (_, i) => persona(i)) }, ORIGEN, ahora, ip);

async function compraPagada(tipoId: string, cantidad: number, cobro: string) {
  const c = await compraDe(tipoId, cantidad);
  const fila = await dueno.ticketeraCompra.findUniqueOrThrow({ where: { id: c.compraId } });
  expect(await registrarPago(e.a.id, "mercadopago", { cobroId: cobro, estado: "aprobado", estadoPasarela: "approved", referencia: c.compraId, monto: fila.total, moneda: "ARS" })).toBe("pagada");
  return c;
}

beforeAll(async () => {
  await mp.iniciar();
  process.env.DEOCO_MERCADOPAGO_API = mp.base;
  e = await escenarioAcceso();
  titularB = (await dueno.usuario.findUniqueOrThrow({ where: { email: "b@x.com" } })).id;
});
beforeEach(async () => {
  await esperarEventos();
  await esperarCorreos();
  mp.limpiar();
  for (const t of ["ticketeraEntrada", "ticketeraCompra", "ticketeraTipo", "ticketeraEvento"] as const) {
    await (dueno[t] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await dueno.evento.deleteMany();
  await dueno.correo.deleteMany();
  await dueno.cobroDuplicado.deleteMany();
  vaciarBandeja();
  await dueno.secreto.deleteMany();
  await dueno.moduloTenant.deleteMany({ where: { moduloId: { in: ["ticketera", "sitio"] } } });
  await dueno.moduloTenant.createMany({ data: [{ tenantId: e.a.id, moduloId: "ticketera" }, { tenantId: e.b.id, moduloId: "ticketera" }] });
  await guardarSecreto(e.multi.id, e.a.id, "pagos", "mercadopago_access_token", TOKEN_A);
});
afterAll(async () => {
  await esperarEventos();
  await esperarCorreos();
  await dueno.moduloTenant.deleteMany({ where: { moduloId: "ticketera" } });
  await mp.cerrar();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("panel: shows y tipos", () => {
  it("publicar exige un tipo; el cupo no baja de lo vendido; validaciones", async () => {
    const id = await crearEvento(e.a.id, datosShow());
    await expect(publicarEvento(e.a.id, id, true)).rejects.toThrow(/al menos un tipo/);
    await expect(crearTipo(e.a.id, id, { ...tipo, precio: 0 })).rejects.toThrow(/mayor a cero/);
    await expect(crearTipo(e.a.id, id, { ...tipo, ventaDesde: EN_UN_MES, ventaHasta: new Date() })).rejects.toThrow(/anterior a la de cierre/);
    await crearTipo(e.a.id, id, tipo);
    await publicarEvento(e.a.id, id, true);
    const t = (await evento(e.a.id, id))!.tipos[0];
    await compraPagada(t.id, 2, "c1");
    await expect(actualizarTipo(e.a.id, t.id, { ...tipo, cupo: 1 })).rejects.toThrow(/no puede ser menor.*\(2\)/);
    await actualizarTipo(e.a.id, t.id, { ...tipo, cupo: 5 });
    expect((await evento(e.a.id, id))!.tipos[0]).toMatchObject({ cupo: 5, vendidas: 2, reservadas: 0, disponibles: 3, venta: "abierta" });
    // Un show de A no existe para B.
    expect(await evento(e.b.id, id)).toBeNull();
  });

  it("la foto es pública solo con el show publicado", async () => {
    const id = await crearEvento(e.a.id, datosShow());
    const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#333" } }).png().toBuffer();
    await cambiarFoto(e.a.id, id, { nombre: "afiche.png", datos: png });
    const foto = async () => (await dueno.archivo.findFirstOrThrow({ where: { moduloId: "ticketera" } })).publico;
    expect(await foto()).toBe(false);
    await crearTipo(e.a.id, id, tipo);
    await publicarEvento(e.a.id, id, true);
    expect(await foto()).toBe(true);
  });
});

describe("compra y cupo", () => {
  it("reserva el cupo y crea el cobro en la cuenta de la banda (sus credenciales)", async () => {
    const { tipoId } = await showDeA();
    const r = await compraDe(tipoId, 2);
    expect(r.redireccion).toMatch(/\/checkout\?pref=/);
    const [pref] = mp.preferencias;
    expect(pref.token).toBe(TOKEN_A);
    expect(pref.cuerpo).toMatchObject({
      external_reference: r.compraId,
      items: [{ title: "Gira Satélite · General", quantity: 2, unit_price: 15000, currency_id: "ARS" }],
      notification_url: expect.stringMatching(new RegExp(`/avisos/${e.a.id}/ticketera/pago/mercadopago$`)),
    });
    // La pasarela guarda estas direcciones: sin el token de las entradas.
    expect((pref.cuerpo as { back_urls: { success: string } }).back_urls.success).toBe(`${ORIGEN}/fechas/compra/${r.compraId}?resultado=exito`);
    expect(JSON.stringify(pref.cuerpo)).not.toContain(r.token);
    expect((await dueno.ticketeraTipo.findUniqueOrThrow({ where: { id: tipoId } })).ocupadas).toBe(2);
  });

  it("compras a la vez no sobrevenden: la base corta en el cupo", async () => {
    const { tipoId } = await showDeA(5);
    const resultados = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => compraDe(tipoId, 1, undefined, `fan${i}@x.com`)));
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(resultados.filter((r) => r.status === "rejected").map((r) => String((r as PromiseRejectedResult).reason.message))).toEqual(
      Array(3).fill('"General" está agotada.'),
    );
    expect((await dueno.ticketeraTipo.findUniqueOrThrow({ where: { id: tipoId } })).ocupadas).toBe(5);
    // Aunque el código se saltee el control, la base no deja pasar el cupo.
    await expect(conTenant(e.a.id, (tx) => tx.$executeRaw`UPDATE ticketera_tipo SET ocupadas = ocupadas + 1 WHERE id = ${tipoId}::uuid`)).rejects.toThrow(/ticketera_tipo_cupo/);
  });

  it("una reserva sin pagar vence y libera su lugar; si paga tarde y hay lugar, entra; si no, a revisión", async () => {
    const { tipoId } = await showDeA(2);
    const antes = new Date(Date.now() - (RESERVA_MINUTOS + 1) * 60_000);
    const vieja = await compraDe(tipoId, 2, antes);
    await expect(compraDe(tipoId, 1, new Date(antes.getTime() + 60_000))).rejects.toThrow(/agotada/);
    // Ahora: la vieja venció y libera los 2.
    const nueva = await compraDe(tipoId, 1);
    expect((await dueno.ticketeraCompra.findUniqueOrThrow({ where: { id: vieja.compraId } })).estado).toBe("VENCIDA");
    expect((await dueno.ticketeraTipo.findUniqueOrThrow({ where: { id: tipoId } })).ocupadas).toBe(1);
    // La vieja paga tarde: pide 2, queda 1 → a revisión (la banda devuelve el pago).
    const pago = (id: string, cobro: string, monto: number) => registrarPago(e.a.id, "mercadopago", { cobroId: cobro, estado: "aprobado", estadoPasarela: "approved", referencia: id, monto, moneda: "ARS" });
    expect(await pago(vieja.compraId, "tarde-1", 3000000)).toBe("en-revision");
    expect((await dueno.ticketeraCompra.findUniqueOrThrow({ where: { id: vieja.compraId } })).observacion).toMatch(/no queda cupo/);
    expect(await pago(nueva.compraId, "ok-1", 1500000)).toBe("pagada");
    expect((await dueno.ticketeraTipo.findUniqueOrThrow({ where: { id: tipoId } })).ocupadas).toBe(1);
  });

  it("fuera de la ventana de venta, sin pasarela o con datos incompletos, no se compra", async () => {
    const id = await crearEvento(e.a.id, datosShow());
    await crearTipo(e.a.id, id, { ...tipo, ventaDesde: new Date(Date.now() + 86400_000), ventaHasta: null });
    await publicarEvento(e.a.id, id, true);
    const t = (await evento(e.a.id, id))!.tipos[0];
    expect(t.venta).toBe("antes");
    await expect(compraDe(t.id, 1)).rejects.toThrow(/todavía no empezó/);
    const { tipoId } = await showDeA();
    await expect(comprar(e.a.id, { tipoId, cantidad: 2, nombre: "L", email: "x", asistentes: [persona(1)] }, ORIGEN)).rejects.toThrow(
      /Completá tu nombre.*Revisá tu email.*Cada entrada va a nombre/,
    );
    await dueno.secreto.deleteMany();
    await expect(compraDe(tipoId, 1)).rejects.toThrow(/no está disponible/);
  });
});

describe("cuota impaga (escalera): las ventas siguen hasta SUSPENDIDO; lo ya cobrado, siempre", () => {
  it("en SOLO_LECTURA se vende; en SUSPENDIDO no se abre ninguna venta, pero un pago en curso se registra", async () => {
    const { tipoId } = await showDeA(5);
    try {
      await dueno.tenant.update({ where: { id: e.a.id }, data: { estado: "SOLO_LECTURA" } });
      await expect(compraDe(tipoId, 1, undefined, "uno@x.com")).resolves.toHaveProperty("redireccion");
      const enCurso = await compraDe(tipoId, 1, undefined, "dos@x.com");
      await dueno.tenant.update({ where: { id: e.a.id }, data: { estado: "SUSPENDIDO" } });
      await expect(compraDe(tipoId, 1, undefined, "tres@x.com")).rejects.toThrow(/No pudimos abrir el pago/);
      const fila = await dueno.ticketeraCompra.findUniqueOrThrow({ where: { id: enCurso.compraId } });
      expect(await registrarPago(e.a.id, "mercadopago", { cobroId: "p-susp", estado: "aprobado", estadoPasarela: "approved", referencia: enCurso.compraId, monto: fila.total, moneda: "ARS" })).toBe("pagada");
    } finally {
      await dueno.tenant.update({ where: { id: e.a.id }, data: { estado: "ACTIVO" } });
    }
  });
});

describe("pago: entradas nominadas, QR por mail y página para verlas", () => {
  it("pagada: una entrada por persona con su código, mail con un QR por entrada, una sola vez", async () => {
    const { tipoId } = await showDeA();
    const c = await compraPagada(tipoId, 2, "p-1");
    await esperarEventos();
    await esperarCorreos();
    const entradas = await dueno.ticketeraEntrada.findMany({ orderBy: { nombre: "asc" } });
    expect(entradas.map((x) => [x.nombre, x.documento])).toEqual([["Fan 0", "30000000"], ["Fan 1", "30000001"]]);
    // Firmado: 10 al azar + 10 de firma de la banda (modulos/ticketera/firma.ts).
    expect(entradas.every((x) => /^[A-HJ-NP-Z2-9]{20}$/.test(x.codigo))).toBe(true);
    const [m] = bandejaDeSalida();
    expect(m).toMatchObject({ para: "lucia@fan.com", asunto: "Tus entradas · Gira Satélite · Banda A" });
    // Quien responde le escribe a la banda (su titular), no a Deoco.
    expect(["a@x.com", "multi@x.com"]).toContain(m.responderA);
    expect(m.adjuntos!.map((a) => [a.cid, a.tipo])).toEqual(entradas.map((x) => [`qr-${x.codigo}`, "image/png"]));
    expect(m.adjuntos![0].contenido.subarray(1, 4).toString()).toBe("PNG");
    for (const x of entradas) expect(m.html).toContain(`src="cid:qr-${x.codigo}"`);
    // En el mail, el token va después de "#": nunca llega a un servidor.
    expect(m.texto).toContain(`/fechas/compra/${c.compraId}#${c.token}`);
    // Aviso repetido: nada nuevo.
    const total = (await dueno.ticketeraCompra.findUniqueOrThrow({ where: { id: c.compraId } })).total;
    expect(await registrarPago(e.a.id, "mercadopago", { cobroId: "p-1", estado: "aprobado", estadoPasarela: "approved", referencia: c.compraId, monto: total, moneda: "ARS" })).toBe("ya-pagada");
    // Otro pago aprobado de la misma compra: queda anotado para devolver.
    expect(await registrarPago(e.a.id, "mercadopago", { cobroId: "p-2", estado: "aprobado", estadoPasarela: "approved", referencia: c.compraId, monto: total, moneda: "ARS" })).toBe("duplicado");
    // Como en la tienda: una fila en cobro_duplicado (del núcleo), no texto en la observación.
    expect(await registrarPago(e.a.id, "mercadopago", { cobroId: "p-2", estado: "aprobado", estadoPasarela: "approved", referencia: c.compraId, monto: total, moneda: "ARS" })).toBe("duplicado");
    expect((await dueno.cobroDuplicado.findMany()).map((x) => [x.moduloId, x.referencia, x.cobroId, x.monto, x.moneda])).toEqual([["ticketera", c.compraId, "p-2", total, "ARS"]]);
    expect((await dueno.ticketeraCompra.findUniqueOrThrow({ where: { id: c.compraId } })).observacion).toBeNull();
    expect(await dueno.ticketeraEntrada.count()).toBe(2);
    // La página de las entradas: solo con el token.
    expect(await compraConToken(e.a.id, c.compraId, c.token)).toMatchObject({ estado: "PAGADA", entradas: [{}, {}] });
    expect(await compraConToken(e.a.id, c.compraId, "x".repeat(32))).toBeNull();
    expect(await compraConToken(e.b.id, c.compraId, c.token)).toBeNull();
  });

  it("monto distinto → a revisión y libera el lugar; una compra de A no se registra en B", async () => {
    const { tipoId } = await showDeA();
    const c = await compraDe(tipoId, 1);
    expect(await registrarPago(e.b.id, "mercadopago", { cobroId: "z", estado: "aprobado", estadoPasarela: "approved", referencia: c.compraId, monto: 1500000, moneda: "ARS" })).toBe("ajeno");
    expect(await registrarPago(e.a.id, "mercadopago", { cobroId: "z", estado: "aprobado", estadoPasarela: "approved", referencia: c.compraId, monto: 100, moneda: "ARS" })).toBe("en-revision");
    expect((await dueno.ticketeraTipo.findUniqueOrThrow({ where: { id: tipoId } })).ocupadas).toBe(0);
    expect(await dueno.ticketeraEntrada.count()).toBe(0);
  });

  it("el aviso de la pasarela llega al módulo y el núcleo consulta la API", async () => {
    const { tipoId } = await showDeA();
    const c = await compraDe(tipoId, 1);
    mp.pagos.set("777", { status: "approved", external_reference: c.compraId, transaction_amount: 15000, currency_id: "ARS", token: TOKEN_A });
    const r = await atenderAviso(
      new Request(`http://app.deocoartist.com/avisos/${e.a.id}/ticketera/pago/mercadopago`, { method: "POST", body: JSON.stringify({ type: "payment", data: { id: "777" } }) }),
      { tenantId: e.a.id, moduloId: "ticketera", path: "/pago/mercadopago" },
    );
    expect(await r.json()).toEqual({ resultado: "pagada" });
  });
});

describe("puerta", () => {
  it("válida una vez; la segunda dice cuándo entró; el reintento del mismo intento es válida; otro show; inválida", async () => {
    const { id, tipoId } = await showDeA();
    await compraPagada(tipoId, 2, "q-1");
    const [x, y] = await dueno.ticketeraEntrada.findMany({ orderBy: { nombre: "asc" } });
    const ahora = new Date("2026-11-20T23:40:00Z");
    expect(await validarEntrada(e.a.id, id, x.codigo.toLowerCase().replace(/(.{5})/, "$1-"), e.multi.id, "intento-uno", ahora)).toEqual({
      resultado: "valida", nombre: "Fan 0", documento: "30000000", tipo: "General",
    });
    // Se perdió la respuesta por mala señal: el teléfono reintenta el mismo intento.
    expect((await validarEntrada(e.a.id, id, x.codigo, e.multi.id, "intento-uno")).resultado).toBe("valida");
    // Otro teléfono, otro intento: ya entró, y a qué hora.
    expect(await validarEntrada(e.a.id, id, x.codigo, e.multi.id, "intento-dos")).toEqual({
      resultado: "ya-validada", nombre: "Fan 0", tipo: "General", validadaEn: ahora.toISOString(),
    });
    expect((await validarEntrada(e.a.id, id, "ZZZZZZZZZZ", e.multi.id, "intento-tres")).resultado).toBe("invalida");
    const otro = await crearEvento(e.a.id, datosShow({ nombre: "Otra noche" }));
    expect(await validarEntrada(e.a.id, otro, y.codigo, e.multi.id, "intento-cuatro")).toEqual({ resultado: "otro-show", show: "Gira Satélite" });
    // De otra banda, no existe.
    expect((await validarEntrada(e.b.id, id, y.codigo, titularB, "intento-cinco")).resultado).toBe("invalida");
    expect(await resumenPuerta(e.a.id, id)).toEqual({ vendidas: 2, entraron: 1, faltan: 1, porTipo: [{ nombre: "General", vendidas: 2, entraron: 1 }] });
  });

  it("dos teléfonos con el mismo QR a la vez: entra uno solo", async () => {
    const { id, tipoId } = await showDeA();
    await compraPagada(tipoId, 1, "q-2");
    const [x] = await dueno.ticketeraEntrada.findMany();
    const r = await Promise.all(Array.from({ length: 6 }, (_, i) => validarEntrada(e.a.id, id, x.codigo, e.multi.id, `telefono-${i}-xx`)));
    expect(r.filter((v) => v.resultado === "valida")).toHaveLength(1);
    expect(r.filter((v) => v.resultado === "ya-validada")).toHaveLength(5);
  });
});

describe("el sitio muestra las fechas de la ticketera (consulta), o las cargadas a mano", () => {
  const contenido = {
    home: { fechas: [{ fecha: "2026-12-01", lugar: "Cargada a mano", ciudad: "Rosario", link: null }] },
  } as unknown as ContenidoSitio;

  it("prendida: sus shows publicados y las cargadas a mano; apagada: las de siempre", async () => {
    const { id } = await showDeA();
    await crearEvento(e.a.id, datosShow({ nombre: "Borrador" })); // no publicado: no se ve
    expect(await proximasFechas(e.a.id, {})).toEqual([
      { id, nombre: "Gira Satélite", fecha: EN_UN_MES.toISOString(), lugar: "La Trastienda", ciudad: "CABA", url: `/fechas/${id}`, agotado: false },
    ]);
    // Conviven: los shows de la ticketera y las cargadas a mano (un show que vende otro, uno
    // gratis), por fecha. Prender la ticketera no borra del sitio lo que la banda ya cargó.
    const vivas = await conFechasVivas(e.a.id, contenido);
    expect(vivas.home.fechas).toEqual([
      { fecha: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), lugar: "La Trastienda", ciudad: "CABA", link: `/fechas/${id}` },
      ...contenido.home.fechas,
    ]);
    await dueno.moduloTenant.deleteMany({ where: { tenantId: e.a.id, moduloId: "ticketera" } });
    expect((await conFechasVivas(e.a.id, contenido)).home.fechas).toEqual(contenido.home.fechas);
  });

  it("la misma fecha cargada a mano y en la ticketera (mismo día y sala) aparece una vez: la de la ticketera", async () => {
    const { id } = await showDeA();
    const dia = (await conFechasVivas(e.a.id, { home: { fechas: [] } } as unknown as ContenidoSitio)).home.fechas[0].fecha;
    const conRepetida = {
      home: { fechas: [{ fecha: dia, lugar: "la trastienda", ciudad: "CABA", link: "https://otra.com" }, ...contenido.home.fechas] },
    } as unknown as ContenidoSitio;
    expect((await conFechasVivas(e.a.id, conRepetida)).home.fechas.map((f) => [f.lugar, f.link])).toEqual([
      ["La Trastienda", `/fechas/${id}`],
      ["Cargada a mano", null],
    ]);
  });
});

describe("C1: lo que pierde plata", () => {
  const aprobado = (id: string, cobro: string, monto: number) => ({ cobroId: cobro, estado: "aprobado" as const, estadoPasarela: "approved", referencia: id, monto, moneda: "ARS" });

  it("el cobro vence con la reserva y solo acepta medios inmediatos", async () => {
    const { tipoId } = await showDeA(5);
    const c = await compraDe(tipoId, 1);
    const pref = mp.preferencias.at(-1)!.cuerpo as Record<string, unknown>;
    const fila = await dueno.ticketeraCompra.findUniqueOrThrow({ where: { id: c.compraId } });
    expect(pref).toMatchObject({ binary_mode: true, expires: true, expiration_date_to: fila.venceEn.toISOString() });
    expect(fila.venceEn.getTime() - fila.creadoEn.getTime()).toBeLessThanOrEqual(RESERVA_MINUTOS * 60_000 + 1000);
  });

  it("acaparamiento: tope por compra, reservas abiertas por email y por IP, y entradas por persona y show", async () => {
    const { tipoId } = await showDeA(100);
    await expect(compraDe(tipoId, MAXIMO_POR_COMPRA + 1)).rejects.toThrow(new RegExp(`de 1 a ${MAXIMO_POR_COMPRA}`));
    for (let i = 0; i < RESERVAS_ABIERTAS_POR_EMAIL; i++) await compraDe(tipoId, 1);
    await expect(compraDe(tipoId, 1)).rejects.toThrow(/Ya tenés compras esperando el pago/);
    for (let i = 0; i < RESERVAS_ABIERTAS_POR_IP; i++) await compraDe(tipoId, 1, undefined, `ip${i}@x.com`, "200.1.2.3");
    await expect(compraDe(tipoId, 1, undefined, "otra@x.com", "200.1.2.3")).rejects.toThrow(/Ya tenés compras esperando el pago/);
    // La IP no se guarda: solo su hash.
    expect((await dueno.ticketeraCompra.findMany({ where: { ipHash: { not: null } } })).every((x) => x.ipHash !== "200.1.2.3" && x.ipHash!.length === 64)).toBe(true);
    // Por persona y show, sumando lo pagado: 12.
    for (let i = 0; i < 2; i++) {
      const c = await compraDe(tipoId, MAXIMO_POR_COMPRA, undefined, "mucho@x.com");
      expect(await registrarPago(e.a.id, "mercadopago", aprobado(c.compraId, `m-${i}`, MAXIMO_POR_COMPRA * 1500000))).toBe("pagada");
    }
    expect(MAXIMO_POR_COMPRA * 2).toBe(MAXIMO_POR_EMAIL_Y_SHOW);
    await expect(compraDe(tipoId, 1, undefined, "mucho@x.com")).rejects.toThrow(/hasta 12 entradas por persona y ya llegaste/);
  });

  it("los frenos se configuran por show (una banda grande quiere otros números), acotados", async () => {
    const { id, tipoId } = await showDeA(100);
    await guardarFrenos(e.a.id, id, { reservaMinutos: 15, maxPorCompra: 10, maxPorPersona: 20, reservasPorEmail: 3, reservasPorIp: null });
    const c = await compraDe(tipoId, 10, undefined, "grande@x.com");
    const fila = await dueno.ticketeraCompra.findUniqueOrThrow({ where: { id: c.compraId } });
    expect(Math.round((fila.venceEn.getTime() - fila.creadoEn.getTime()) / 60_000)).toBe(15);
    await expect(compraDe(tipoId, 11, undefined, "grande2@x.com")).rejects.toThrow(/de 1 a 10/);
    await compraDe(tipoId, 1, undefined, "grande@x.com");
    await compraDe(tipoId, 1, undefined, "grande@x.com"); // tercera reserva abierta del mismo email: este show deja 3
    // Fuera de rango, ni la app ni la base lo aceptan.
    await expect(guardarFrenos(e.a.id, id, { reservaMinutos: 120, maxPorCompra: null, maxPorPersona: null, reservasPorEmail: null, reservasPorIp: null })).rejects.toThrow(/de 5 a 30 minutos/);
    await expect(dueno.ticketeraEvento.update({ where: { id }, data: { maxPorCompra: 500 } })).rejects.toThrow(/ticketera_evento_frenos/);
    // Vacío vuelve a los de la plataforma.
    await guardarFrenos(e.a.id, id, { reservaMinutos: null, maxPorCompra: null, maxPorPersona: null, reservasPorEmail: null, reservasPorIp: null });
    await expect(compraDe(tipoId, MAXIMO_POR_COMPRA + 1, undefined, "otro@x.com")).rejects.toThrow(new RegExp(`de 1 a ${MAXIMO_POR_COMPRA}`));
  });

  it("pago tardío: después del cierre de la venta (o empezado el show) no se acepta y queda para devolver", async () => {
    const { id, tipoId } = await showDeA(5);
    const c = await compraDe(tipoId, 1);
    await dueno.ticketeraEvento.update({ where: { id }, data: { fecha: new Date(Date.now() - 60_000) } }); // empezó
    expect(await registrarPago(e.a.id, "mercadopago", aprobado(c.compraId, "tarde-show", 1500000))).toBe("tardio");
    expect((await dueno.ticketeraCompra.findUniqueOrThrow({ where: { id: c.compraId } })).estado).not.toBe("PAGADA");
    expect(await dueno.ticketeraEntrada.count()).toBe(0);
    expect(await pagosParaDevolver(e.a.id, { pendientes: true })).toMatchObject([{ motivo: "tardio", cobroId: "tarde-show", moduloId: "ticketera" }]);
    // Cerrada la preventa, igual.
    await dueno.ticketeraEvento.update({ where: { id }, data: { fecha: EN_UN_MES } });
    const otra = await compraDe(tipoId, 1, undefined, "pre@x.com");
    await dueno.ticketeraTipo.update({ where: { id: tipoId }, data: { ventaHasta: new Date(Date.now() - 1000) } });
    expect(await registrarPago(e.a.id, "mercadopago", aprobado(otra.compraId, "tarde-pre", 1500000))).toBe("tardio");
  });

  it("devolución o contracargo: la compra queda DEVUELTA, las entradas no entran en la puerta y el lugar vuelve", async () => {
    const { id, tipoId } = await showDeA(5);
    const c = await compraPagada(tipoId, 2, "pago-1");
    const [entrada] = await dueno.ticketeraEntrada.findMany({ where: { compraId: c.compraId } });
    expect(await registrarPago(e.a.id, "mercadopago", { ...aprobado(c.compraId, "pago-1", 3000000), estado: "devuelto", estadoPasarela: "charged_back" })).toBe("devuelto");
    expect(await dueno.ticketeraCompra.findUniqueOrThrow({ where: { id: c.compraId } })).toMatchObject({ estado: "DEVUELTA", contracargo: true });
    expect((await validarEntrada(e.a.id, id, entrada.codigo, e.multi.id, "intento-1")).resultado).toBe("invalida");
    expect((await dueno.ticketeraTipo.findUniqueOrThrow({ where: { id: tipoId } })).ocupadas).toBe(0);
  });

  it("conciliación: un pago aprobado cuyo aviso se perdió se registra en el barrido", async () => {
    const { tipoId } = await showDeA(5);
    const c = await compraDe(tipoId, 2);
    const pref = mp.preferencias.at(-1)!;
    mp.pagar(pref.id, { monto: 30000 }); // pagó, y el aviso nunca llegó
    await dueno.ticketeraCompra.update({ where: { id: c.compraId }, data: { creadoEn: new Date(Date.now() - 5 * 60_000) } });
    await conciliarCompras();
    expect((await dueno.ticketeraCompra.findUniqueOrThrow({ where: { id: c.compraId } })).estado).toBe("PAGADA");
    expect(await dueno.ticketeraEntrada.count({ where: { compraId: c.compraId } })).toBe(2);
    // Repetirlo no cambia nada.
    await conciliarCompras(new Date(Date.now() + 10 * 60_000));
    expect(await dueno.ticketeraEntrada.count({ where: { compraId: c.compraId } })).toBe(2);
  });

  it("foto fiscal de la compra al pagarse, con el DNI o CUIT si lo dio", async () => {
    const { tipoId } = await showDeA(5);
    const c = await comprar(e.a.id, { tipoId, cantidad: 1, nombre: "Lucía Fan", email: "fiscal@x.com", documento: "20-30111222-3", asistentes: [persona(1)] }, ORIGEN);
    expect(await registrarPago(e.a.id, "mercadopago", aprobado(c.compraId, "fis-1", 1500000))).toBe("pagada");
    expect((await dueno.ticketeraCompra.findUniqueOrThrow({ where: { id: c.compraId } })).fiscal).toMatchObject({
      comprador: { email: "fiscal@x.com", documento: "20301112223" }, total: 1500000, renglones: [{ cantidad: 1, precioUnitario: 1500000, importe: 1500000 }],
    });
  });

  it("el token del fan nunca está en claro en la base: hash para comprobar y cifrado para el link", async () => {
    const { tipoId } = await showDeA(5);
    const c = await compraDe(tipoId, 1, undefined, "tok@x.com");
    const fila = await dueno.ticketeraCompra.findUniqueOrThrow({ where: { id: c.compraId } });
    expect(JSON.stringify({ ...fila, tokenCifrado: Buffer.from(fila.tokenCifrado!).toString("hex") })).not.toContain(c.token);
    expect(await compraConToken(e.a.id, c.compraId, c.token)).not.toBeNull();
    expect(await compraConToken(e.a.id, c.compraId, fila.tokenHash)).toBeNull(); // el hash no abre nada
  });
});

