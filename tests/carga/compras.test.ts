// Prueba de carga de la apertura de venta: cientos de fans a la vez sobre un cupo chico, por el
// mismo camino que la acción del sitio (intentarComprar). No se sobrevende, nadie recibe un
// error técnico, y los que no entran ven por qué.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { esperarCorreos } from "@/nucleo/correo";
import { prisma } from "@/nucleo/db/cliente";
import { configPool } from "@/nucleo/db/config";
import { esperarEventos } from "@/nucleo/eventos/bus";
import { MENSAJE_SATURACION } from "@/nucleo/publico/errores";
import { guardarSecreto } from "@/nucleo/secretos/carga";
import { intentarComprar } from "../../modulos/ticketera/compras";
import { crearEvento, crearTipo, evento, publicarEvento } from "../../modulos/ticketera/eventos";
import { dueno, escenarioAcceso } from "../apoyo";
import { MercadoPagoFalso } from "../mercadopago-falso";

const mp = new MercadoPagoFalso();
let e: Awaited<ReturnType<typeof escenarioAcceso>>;

async function show(cupo: number) {
  const id = await crearEvento(e.a.id, {
    nombre: "Apertura", fecha: new Date(Date.now() + 30 * 86400_000), lugar: "Estadio", ciudad: "CABA", direccion: "", descripcion: "",
  });
  await crearTipo(e.a.id, id, { nombre: "General", precio: 1500000, cupo, ventaDesde: null, ventaHasta: null });
  await publicarEvento(e.a.id, id, true);
  return (await evento(e.a.id, id))!.tipos[0].id;
}

const fan = (i: number, tipoId: string, cantidad = 1) => ({
  tipoId,
  cantidad,
  nombre: `Fan ${i}`,
  email: `fan${i}@ejemplo.com`,
  asistentes: Array.from({ length: cantidad }, (_, j) => ({ nombre: `Fan ${i}-${j}`, documento: `${30000000 + i * 10 + j}` })),
});

beforeAll(async () => {
  await mp.iniciar();
  process.env.DEOCO_MERCADOPAGO_API = mp.base;
  e = await escenarioAcceso();
});
beforeEach(async () => {
  for (const t of ["ticketeraEntrada", "ticketeraCompra", "ticketeraTipo", "ticketeraEvento"] as const) {
    await (dueno[t] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await dueno.secreto.deleteMany();
  await dueno.moduloTenant.deleteMany({ where: { moduloId: "ticketera" } });
  await dueno.moduloTenant.create({ data: { tenantId: e.a.id, moduloId: "ticketera" } });
  await guardarSecreto(e.multi.id, e.a.id, "pagos", "mercadopago_access_token", "APP_USR-carga");
});
afterAll(async () => {
  await esperarEventos();
  await esperarCorreos();
  await dueno.moduloTenant.deleteMany({ where: { moduloId: "ticketera" } });
  await mp.cerrar();
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("apertura de venta", () => {
  it("400 fans a la vez por 25 lugares: entran 25, los demás ven 'agotada', ninguno un error técnico", async () => {
    const tipoId = await show(25);
    const inicio = Date.now();
    const r = await Promise.all(Array.from({ length: 400 }, (_, i) => intentarComprar(e.a.id, fan(i, tipoId), "https://banda-a.deoco.com")));
    const ms = Date.now() - inicio;
    const ok = r.filter((x) => x.ok);
    const mensajes = new Set(r.flatMap((x) => (x.ok ? [] : [x.error])));
    console.log(`[carga] 400 compras en ${ms} ms (pool ${configPool().max}): ${ok.length} entran; mensajes: ${[...mensajes].join(" | ")}`);
    expect(ok).toHaveLength(25);
    // Solo frases para el fan: agotada (o, si la base se satura, "probá de nuevo").
    expect([...mensajes].every((m) => m === '"General" está agotada.' || m === MENSAJE_SATURACION)).toBe(true);
    expect((await dueno.ticketeraTipo.findUniqueOrThrow({ where: { id: tipoId } })).ocupadas).toBe(25);
    expect(await dueno.ticketeraCompra.count({ where: { tipoId, estado: "RESERVADA" } })).toBe(25);
    expect(mp.preferencias).toHaveLength(25); // nadie sin lugar llegó a la pasarela
  }, 120_000);

  it("300 fans comprando de 1 a 4 por 40 lugares: nunca pasa el cupo y el que no entra sabe cuántas quedan", async () => {
    const tipoId = await show(40);
    const r = await Promise.all(Array.from({ length: 300 }, (_, i) => intentarComprar(e.a.id, fan(i, tipoId, (i % 4) + 1), "https://banda-a.deoco.com")));
    const vendidas = (await dueno.ticketeraCompra.findMany({ where: { tipoId } })).reduce((s, c) => s + c.cantidad, 0);
    const ocupadas = (await dueno.ticketeraTipo.findUniqueOrThrow({ where: { id: tipoId } })).ocupadas;
    expect(ocupadas).toBe(vendidas);
    expect(ocupadas).toBeLessThanOrEqual(40);
    expect(ocupadas).toBeGreaterThan(36); // se llenó (queda, a lo sumo, menos de lo que pidió el último)
    for (const x of r) if (!x.ok) expect(x.error).toMatch(/^"General" está agotada\.$|^De "General" quedan \d+\.$|^Hay mucha gente comprando/);
  }, 120_000);

  it("con la base saturada (todas las conexiones ocupadas), el fan lee 'probá de nuevo', no un error", async () => {
    const tipoId = await show(10);
    const n = configPool().max;
    // Ocupa todo el pool con transacciones largas (como un pico que no da abasto).
    const ocupadas = Array.from({ length: n }, () => prisma.$transaction((tx) => tx.$executeRaw`SELECT pg_sleep(12)`));
    await new Promise((ok) => setTimeout(ok, 500));
    const r = await intentarComprar(e.a.id, fan(1, tipoId), "https://banda-a.deoco.com");
    expect(r).toEqual({ ok: false, error: MENSAJE_SATURACION });
    await Promise.all(ocupadas);
    // Y cuando baja la carga, vuelve a andar.
    expect((await intentarComprar(e.a.id, fan(2, tipoId), "https://banda-a.deoco.com")).ok).toBe(true);
  }, 60_000);
});
