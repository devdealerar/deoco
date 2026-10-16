import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { conStaffComo } from "@/nucleo/acceso/staff";
import { atenderAvisoPlataforma } from "@/nucleo/avisos";
import { ErrorLimite, usoDeLimites } from "@/nucleo/cuenta";
import { esperarCorreos } from "@/nucleo/correo";
import { prisma } from "@/nucleo/db/cliente";
import { conTenant } from "@/nucleo/db/con-tenant";
import { mesArgentino } from "@/nucleo/fechas";
import { comprarComplemento, guardarComplemento, mesesElegibles, sugerencias } from "../modulos/comercial/complementos";
import { alCrearBanda, asignarPlan, type ComoStaff } from "../modulos/comercial/cuenta";
import { esperarDominios } from "../modulos/comercial/dominios";
import { crearEvento, crearTipo, publicarEvento } from "../modulos/ticketera/eventos";
import { exigirTopeDeImagenes } from "../modulos/sitio/contenido";
import { dueno, escenarioAcceso } from "./apoyo";
import { MercadoPagoFalso } from "./mercadopago-falso";

// D1: eventos por mes, tope de imágenes, excedente de entradas (solo mide) y complementos sueltos
// (3.2 núcleo d2, d5 y d6).

const mp = new MercadoPagoFalso();
const DIA = 86_400_000;
let e: Awaited<ReturnType<typeof escenarioAcceso>>;
let comoStaff: ComoStaff;

const aviso = (pagoId: string) =>
  atenderAvisoPlataforma(
    new Request("http://app.deocoartist.com/avisos/plataforma/comercial/dominio/mercadopago", {
      method: "POST",
      body: JSON.stringify({ type: "payment", data: { id: pagoId } }),
      headers: { "content-type": "application/json" },
    }),
    { moduloId: "comercial", path: "/dominio/mercadopago" },
  );

/** Un show publicado (con un tipo) en `fecha`; tira el ErrorLimite si no entra. */
async function showEn(fecha: Date, nombre = "Show") {
  const id = await crearEvento(e.a.id, { nombre, fecha, lugar: "Club", ciudad: "Rosario", direccion: "", descripcion: "" });
  await crearTipo(e.a.id, id, { nombre: "General", precio: 1_000_000, cupo: 100, ventaDesde: null, ventaHasta: null });
  await publicarEvento(e.a.id, id, true);
  return id;
}

const proximoMes = mesArgentino(new Date(Date.now() + 32 * DIA));
const enProximoMes = (dia: number) => new Date(proximoMes.desde.getTime() + dia * DIA);

beforeAll(async () => {
  await mp.iniciar();
  process.env.DEOCO_MERCADOPAGO_API = mp.base;
  process.env.DEOCO_CUOTA_MP_TOKEN = "APP_USR-DEOCO";
});
beforeEach(async () => {
  e = await escenarioAcceso();
  comoStaff = (accion, fn) => conStaffComo(e.staff.id, accion, fn);
  mp.limpiar();
  await alCrearBanda(e.a.id);
  await asignarPlan(comoStaff, e.a.id, "escenario", {
    precio: null,
    modulos: ["sitio", "tienda", "ticketera"],
    almacenamiento: null,
    topes: { "ticketera.shows-por-mes": 1, "ticketera.entradas-por-mes": 2, "sitio.imagenes": 1 },
  });
});
afterAll(async () => {
  await esperarDominios();
  await esperarCorreos();
  await mp.cerrar();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("eventos por mes", () => {
  it("el tope es por mes calendario: el mismo mes no entra otro; el mes siguiente, sí", async () => {
    await showEn(enProximoMes(5));
    await expect(showEn(enProximoMes(9), "Otro")).rejects.toBeInstanceOf(ErrorLimite);
    const siguiente = mesArgentino(new Date(proximoMes.hasta.getTime() + 5 * DIA)).desde;
    await showEn(new Date(siguiente.getTime() + 2 * DIA), "Al mes siguiente");
  });
});

describe("complemento suelto: un evento puntual que excede el plan", () => {
  it("la banda lo compra para un mes; aprobado el pago, ese mes entra un show más (y solo ese mes)", async () => {
    await showEn(enProximoMes(5));
    const mes = proximoMes.clave;
    expect(mesesElegibles().map((m) => m.clave)).toContain(mes);
    const r = await comprarComplemento(e.a.id, "banda-a", "show-extra", mes, e.multi.id);
    expect(r.monto).toBe(500_000);
    const pref = mp.preferencias.at(-1)!;
    expect(pref.cuerpo).toMatchObject({ binary_mode: true });
    const pagoId = mp.pagar(pref.id);
    expect((await aviso(pagoId)).status).toBe(200);
    await esperarDominios();
    expect(await dueno.limiteExtra.findMany({ where: { tenantId: e.a.id } })).toMatchObject([{ limite: "ticketera.shows-por-mes", cantidad: 1, desde: proximoMes.desde, hasta: proximoMes.hasta }]);
    await showEn(enProximoMes(9), "Con el complemento");
    await expect(showEn(enProximoMes(12), "Tercero")).rejects.toBeInstanceOf(ErrorLimite);
    // El mismo aviso otra vez no suma de nuevo.
    expect((await aviso(pagoId)).status).toBe(200);
    await esperarDominios();
    expect(await dueno.limiteExtra.count({ where: { tenantId: e.a.id } })).toBe(1);
    // No aparece entre los dominios de la banda.
    const { cobrosDeBanda } = await import("../modulos/comercial/dominios");
    expect(await cobrosDeBanda(e.a.id, 30)).toEqual([]);
  });

  it("un pago de otro monto no suma nada (se devuelve)", async () => {
    await comprarComplemento(e.a.id, "banda-a", "show-extra", proximoMes.clave, e.multi.id);
    const pagoId = mp.pagar(mp.preferencias.at(-1)!.id, { monto: 1 });
    await aviso(pagoId);
    await esperarDominios();
    expect(await dueno.limiteExtra.count({ where: { tenantId: e.a.id } })).toBe(0);
    expect(await dueno.comercialDominioPago.findFirstOrThrow({ where: { pagoId } })).toMatchObject({ devolucion: expect.stringMatching(/pendiente|hecha|en-proceso/) });
  });

  it("solo los meses que vienen (este y cinco más), y solo complementos a la venta", async () => {
    await expect(comprarComplemento(e.a.id, "banda-a", "show-extra", "2020-01", e.multi.id)).rejects.toThrow(/Elegí un mes/);
    await guardarComplemento(comoStaff, "show-extra", { nombre: "Un show más", descripcion: "", precio: 500_000, limite: "ticketera.shows-por-mes", cantidad: 1, meses: 1, activo: false });
    await expect(comprarComplemento(e.a.id, "banda-a", "show-extra", proximoMes.clave, e.multi.id)).rejects.toThrow(/no está disponible/);
    await expect(guardarComplemento(comoStaff, "otro", { nombre: "X", descripcion: "", precio: 1, limite: "no.existe", cantidad: 1, meses: 1, activo: true })).rejects.toThrow(/No existe el límite/);
    await guardarComplemento(comoStaff, "show-extra", { nombre: "Un show más este mes", descripcion: "", precio: 500_000, limite: "ticketera.shows-por-mes", cantidad: 1, meses: 1, activo: true });
  });
});

describe("excedente de entradas: se permite, se mide y se sugiere", () => {
  it("vender más entradas que el plan no corta nada; Plan y pago lo muestra con el complemento que lo cubre", async () => {
    const show = await showEn(new Date(Date.now() + 60_000));
    const tipo = await dueno.ticketeraTipo.findFirstOrThrow({ where: { eventoId: show } });
    await dueno.ticketeraCompra.create({
      data: { tenantId: e.a.id, eventoId: show, tipoId: tipo.id, estado: "PAGADA", cantidad: 3, precioUnitario: 100, total: 300, nombre: "Fan", email: "f@x.com", asistentes: [], venceEn: new Date(), tokenHash: "h".repeat(64), pagadaEn: new Date() },
    });
    const uso = (await usoDeLimites(e.a.id)).find((l) => l.id === "ticketera.entradas-por-mes")!;
    expect(uso).toMatchObject({ usados: 3, maximo: 2, excedente: 1, soloMide: true, porMes: true });
    const s = await sugerencias(e.a.id, "escenario");
    expect(s.find((x) => x.limite.id === "ticketera.entradas-por-mes")!.complementos.map((c) => c.id)).toEqual(["entradas-1000"]);
  });
});

describe("tope de imágenes del sitio", () => {
  it("frena sumar una imagen más; las que están no se tocan", async () => {
    const archivo = await dueno.archivo.create({ data: { tenantId: e.a.id, moduloId: "sitio", recurso: "slide", nombre: "a.jpg", tipo: "jpeg", bytes: BigInt(10) } });
    await conTenant(e.a.id, (tx) => exigirTopeDeImagenes(tx, e.a.id));
    await dueno.sitioSlide.create({ data: { tenantId: e.a.id, archivoId: archivo.id, orden: 0 } });
    await expect(conTenant(e.a.id, (tx) => exigirTopeDeImagenes(tx, e.a.id))).rejects.toBeInstanceOf(ErrorLimite);
    expect(await dueno.sitioSlide.count({ where: { tenantId: e.a.id } })).toBe(1);
  });
});
