import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bandejaDeSalida, esperarCorreos, vaciarBandeja } from "@/nucleo/correo";
import { prisma } from "@/nucleo/db/cliente";
import { esperarEventos } from "@/nucleo/eventos/bus";
import { canjearLinkDelFan, emailDeSesion, pedirLinkDelFan } from "@/nucleo/publico/fan";
import { guardarSecreto } from "@/nucleo/secretos/carga";
import { comprar, registrarPago } from "../modulos/ticketera/compras";
import { corregirEmailDeCompra, reenviarEntradas, REENVIOS_POR_DIA } from "../modulos/ticketera/correos";
import { crearEvento, crearTipo, evento, publicarEvento } from "../modulos/ticketera/eventos";
import { validarEntrada } from "../modulos/ticketera/puerta";
import { aceptarTransferencia, cancelarTransferencia, confirmarTransferencia, entradasDelFan, pedirTransferencia, vencerTransferencias } from "../modulos/ticketera/transferencias";
import { dueno, escenarioAcceso } from "./apoyo";
import { MercadoPagoFalso } from "./mercadopago-falso";

// D5: área del fan (documento maestro "Mis compras"; 3.2 público d1).

const mp = new MercadoPagoFalso();
const ORIGEN = "https://banda-a.deocoartist.com";
const EN_UN_MES = new Date(Date.now() + 30 * 86400_000);
let e: Awaited<ReturnType<typeof escenarioAcceso>>;

const tokenDe = (para: string, ruta: string) => {
  const m = [...bandejaDeSalida()].reverse().find((x) => x.para === para && x.texto.includes(ruta));
  return m!.texto.match(new RegExp(`${ruta}#([0-9a-f]{64})`))![1];
};

async function compraPagada(cantidad = 2, email = "lucia@fan.com") {
  const id = await crearEvento(e.a.id, { nombre: "Gira Satélite", fecha: EN_UN_MES, lugar: "La Trastienda", ciudad: "CABA", direccion: "", descripcion: "" });
  await crearTipo(e.a.id, id, { nombre: "General", precio: 1500000, cupo: 10, ventaDesde: null, ventaHasta: null });
  await publicarEvento(e.a.id, id, true);
  const tipoId = (await evento(e.a.id, id))!.tipos[0].id;
  const c = await comprar(e.a.id, { tipoId, cantidad, nombre: "Lucía Fan", email, asistentes: Array.from({ length: cantidad }, (_, i) => ({ nombre: `Fan ${i}`, documento: `3000000${i}` })) }, ORIGEN);
  const fila = await dueno.ticketeraCompra.findUniqueOrThrow({ where: { id: c.compraId } });
  await registrarPago(e.a.id, "mercadopago", { cobroId: `c-${c.compraId}`, estado: "aprobado", estadoPasarela: "approved", referencia: c.compraId, monto: fila.total, moneda: "ARS" });
  await esperarEventos();
  await esperarCorreos();
  return { eventoId: id, compraId: c.compraId, entradas: await dueno.ticketeraEntrada.findMany({ where: { compraId: c.compraId }, orderBy: { nombre: "asc" } }) };
}

beforeAll(async () => {
  await mp.iniciar();
  process.env.DEOCO_MERCADOPAGO_API = mp.base;
  e = await escenarioAcceso();
});
beforeEach(async () => {
  await esperarEventos();
  await esperarCorreos();
  for (const t of ["ticketeraEntrada", "ticketeraCompra", "ticketeraTipo", "ticketeraEvento", "accesoFan"] as const) {
    await (dueno[t] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await dueno.correo.deleteMany();
  vaciarBandeja();
  await dueno.secreto.deleteMany();
  await dueno.moduloTenant.deleteMany({ where: { moduloId: { in: ["ticketera", "tienda"] } } });
  await dueno.moduloTenant.createMany({ data: [{ tenantId: e.a.id, moduloId: "ticketera" }] });
  await guardarSecreto(e.multi.id, e.a.id, "pagos", "mercadopago_access_token", "APP_USR-fan-a");
});
afterAll(async () => {
  await esperarEventos();
  await esperarCorreos();
  await mp.cerrar();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("link de acceso del fan", () => {
  it("sale solo si el email compró; sirve una vez; pedir otro invalida el anterior", async () => {
    expect(await pedirLinkDelFan(e.a.id, "nadie@fan.com", ORIGEN)).toBe(false);
    await compraPagada(1);
    vaciarBandeja();
    expect(await pedirLinkDelFan(e.a.id, "Lucia@Fan.com", ORIGEN)).toBe(true);
    await esperarCorreos();
    const primero = tokenDe("lucia@fan.com", "/mis-compras");
    // Freno: no otro enseguida.
    expect(await pedirLinkDelFan(e.a.id, "lucia@fan.com", ORIGEN)).toBe(false);
    // Más tarde, uno nuevo: el anterior deja de servir.
    expect(await pedirLinkDelFan(e.a.id, "lucia@fan.com", ORIGEN, new Date(Date.now() + 3 * 60_000))).toBe(true);
    await esperarCorreos();
    const segundo = tokenDe("lucia@fan.com", "/mis-compras");
    expect(await canjearLinkDelFan(e.a.id, primero)).toBeNull();
    const sesion = await canjearLinkDelFan(e.a.id, segundo, new Date(Date.now() + 3 * 60_000));
    expect(sesion).toMatch(/^[0-9a-f]{64}$/);
    expect(await canjearLinkDelFan(e.a.id, segundo)).toBeNull(); // una vez
    expect(await emailDeSesion(e.a.id, sesion)).toBe("lucia@fan.com");
    // La sesión es de este sitio: en otra banda no vale.
    expect(await emailDeSesion(e.b.id, sesion)).toBeNull();
    expect(await emailDeSesion(e.a.id, sesion, new Date(Date.now() + 31 * 86_400_000))).toBeNull();
    // En la base, solo hashes.
    const fila = await dueno.accesoFan.findFirstOrThrow({ where: { linkUsadoEn: { not: null } } });
    expect(fila.sesionHash).not.toBe(sesion);
  });

  it("vence a los 30 minutos", async () => {
    await compraPagada(1);
    vaciarBandeja();
    await pedirLinkDelFan(e.a.id, "lucia@fan.com", ORIGEN);
    await esperarCorreos();
    expect(await canjearLinkDelFan(e.a.id, tokenDe("lucia@fan.com", "/mis-compras"), new Date(Date.now() + 31 * 60_000))).toBeNull();
  });
});

describe("transferir una entrada", () => {
  const destino = { nombre: "Ana Otra", documento: "40111222", email: "ana@fan.com" };

  it("confirma quien la da, acepta quien la recibe: código nuevo, el QR viejo ya no vale", async () => {
    const { eventoId, entradas } = await compraPagada(2);
    const [entrada] = entradas;
    vaciarBandeja();
    await expect(pedirTransferencia(e.a.id, "otro@fan.com", entrada.id, destino, ORIGEN)).rejects.toThrow(/no es tuya/);
    await pedirTransferencia(e.a.id, "lucia@fan.com", entrada.id, destino, ORIGEN);
    await expect(pedirTransferencia(e.a.id, "lucia@fan.com", entrada.id, destino, ORIGEN)).rejects.toThrow(/transferencia en curso/);
    await esperarCorreos();
    // Hasta aceptar, la entrada no cambió.
    expect((await dueno.ticketeraEntrada.findUniqueOrThrow({ where: { id: entrada.id } })).codigo).toBe(entrada.codigo);
    expect(await confirmarTransferencia(e.a.id, tokenDe("lucia@fan.com", "/fechas/transferencia/confirmar"), ORIGEN)).toBe(true);
    await esperarCorreos();
    expect(await aceptarTransferencia(e.a.id, tokenDe("ana@fan.com", "/fechas/transferencia/aceptar"))).toBe(true);
    await esperarCorreos();
    const despues = await dueno.ticketeraEntrada.findUniqueOrThrow({ where: { id: entrada.id } });
    expect(despues).toMatchObject({ nombre: "Ana Otra", documento: "40111222", emailTitular: "ana@fan.com" });
    expect(despues.codigo).not.toBe(entrada.codigo);
    // La puerta: el viejo dice "transferida", el nuevo entra.
    expect(await validarEntrada(e.a.id, eventoId, entrada.codigo, e.multi.id, "intento-viejo-1")).toEqual({ resultado: "transferida" });
    expect((await validarEntrada(e.a.id, eventoId, despues.codigo, e.multi.id, "intento-nuevo-1")).resultado).toBe("valida");
    // Le llegó con su QR; cada una en el área de quien la tiene.
    expect(bandejaDeSalida().find((m) => m.para === "ana@fan.com" && m.asunto.startsWith("Tu entrada"))!.adjuntos).toHaveLength(1);
    expect((await entradasDelFan(e.a.id, "ana@fan.com")).map((x) => x.id)).toEqual([entrada.id]);
    expect((await entradasDelFan(e.a.id, "lucia@fan.com")).map((x) => x.id)).toEqual([entradas[1].id]);
    // El reenvío de la compra ya no lleva la transferida.
    vaciarBandeja();
    expect(await reenviarEntradas(e.a.id, entradas[0].compraId)).toBe(true);
    await esperarCorreos();
    expect(bandejaDeSalida()[0].adjuntos).toHaveLength(1);
  });

  it("si nadie la acepta, vence y la entrada queda intacta; cancelar también", async () => {
    const { entradas } = await compraPagada(2);
    await pedirTransferencia(e.a.id, "lucia@fan.com", entradas[0].id, destino, ORIGEN);
    await esperarCorreos();
    await confirmarTransferencia(e.a.id, tokenDe("lucia@fan.com", "/fechas/transferencia/confirmar"), ORIGEN);
    await esperarCorreos();
    const aceptar = tokenDe("ana@fan.com", "/fechas/transferencia/aceptar");
    await vencerTransferencias(new Date(Date.now() + 73 * 3600_000));
    expect(await aceptarTransferencia(e.a.id, aceptar)).toBe(false);
    expect(await dueno.ticketeraEntrada.findUniqueOrThrow({ where: { id: entradas[0].id } })).toMatchObject({ codigo: entradas[0].codigo, emailTitular: null });
    // Otra, cancelada antes de aceptar.
    const t = await pedirTransferencia(e.a.id, "lucia@fan.com", entradas[1].id, destino, ORIGEN);
    await cancelarTransferencia(e.a.id, "lucia@fan.com", t);
    await expect(cancelarTransferencia(e.a.id, "lucia@fan.com", t)).rejects.toThrow(/ya no está abierta/);
  });

  it("una entrada usada no se transfiere; si se usa mientras tanto, la aceptación no pasa", async () => {
    const { eventoId, entradas } = await compraPagada(2);
    await validarEntrada(e.a.id, eventoId, entradas[0].codigo, e.multi.id, "intento-usada-1");
    await expect(pedirTransferencia(e.a.id, "lucia@fan.com", entradas[0].id, destino, ORIGEN)).rejects.toThrow(/ya se usó/);
    await pedirTransferencia(e.a.id, "lucia@fan.com", entradas[1].id, destino, ORIGEN);
    await esperarCorreos();
    await confirmarTransferencia(e.a.id, tokenDe("lucia@fan.com", "/fechas/transferencia/confirmar"), ORIGEN);
    await esperarCorreos();
    await validarEntrada(e.a.id, eventoId, entradas[1].codigo, e.multi.id, "intento-usada-2");
    expect(await aceptarTransferencia(e.a.id, tokenDe("ana@fan.com", "/fechas/transferencia/aceptar"))).toBe(false);
  });
});

describe("reenviar y corregir el email", () => {
  it("reenviar manda las mismas entradas (sin duplicar ninguna), con tope por día", async () => {
    const { compraId, entradas } = await compraPagada(2);
    vaciarBandeja();
    for (let i = 0; i < REENVIOS_POR_DIA; i++) expect(await reenviarEntradas(e.a.id, compraId)).toBe(true);
    expect(await reenviarEntradas(e.a.id, compraId)).toBe(false);
    await esperarCorreos();
    expect(bandejaDeSalida()).toHaveLength(REENVIOS_POR_DIA);
    expect(bandejaDeSalida()[0].texto).toContain(entradas[0].codigo.slice(0, 5));
    expect(await dueno.ticketeraEntrada.count({ where: { compraId } })).toBe(2);
  });

  it("solo la banda corrige el email, con el comprobante: el link viejo deja de servir", async () => {
    const { compraId } = await compraPagada(1, "lucia@fna.com");
    const antes = await dueno.ticketeraCompra.findUniqueOrThrow({ where: { id: compraId } });
    await expect(corregirEmailDeCompra(e.a.id, compraId, "lucia@fan.com", "", e.multi.id)).rejects.toThrow(/comprobante/);
    vaciarBandeja();
    await corregirEmailDeCompra(e.a.id, compraId, "lucia@fan.com", "MP 123456789", e.multi.id);
    await esperarCorreos();
    const despues = await dueno.ticketeraCompra.findUniqueOrThrow({ where: { id: compraId } });
    expect(despues.email).toBe("lucia@fan.com");
    expect(despues.tokenHash).not.toBe(antes.tokenHash);
    expect(bandejaDeSalida().map((m) => m.para)).toEqual(["lucia@fan.com"]);
    expect(await dueno.auditoria.findFirst({ where: { accion: "ticketera.email_corregido", tenantId: e.a.id } })).toMatchObject({ detalle: { de: "lucia@fna.com", a: "lucia@fan.com", comprobante: "MP 123456789" } });
  });
});
