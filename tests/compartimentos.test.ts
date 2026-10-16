import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conTenant, ErrorBandaOcupada, ocupacionDeBanda } from "@/nucleo/db/con-tenant";
import { prisma } from "@/nucleo/db/cliente";
import { esSaturacion } from "@/nucleo/publico/errores";
import { dosBandas, dueno } from "./apoyo";

// Compartimentos por banda (C3): el pico de una banda no se lleva todas las conexiones del pool.
// Con DEOCO_DB_CONEXIONES_POR_BANDA=2, la banda A tiene dos transacciones a la vez como mucho; la
// B sigue atendiendo aunque A esté llena.

let e: Awaited<ReturnType<typeof dosBandas>>;
const antes = process.env.DEOCO_DB_CONEXIONES_POR_BANDA;
beforeAll(async () => {
  e = await dosBandas();
  process.env.DEOCO_DB_CONEXIONES_POR_BANDA = "2";
});
afterAll(async () => {
  process.env.DEOCO_DB_CONEXIONES_POR_BANDA = antes;
  await prisma.$disconnect();
  await dueno.$disconnect();
});

const lenta = (ms: number) => (tx: Parameters<Parameters<typeof conTenant>[1]>[0]) => tx.$executeRawUnsafe(`SELECT pg_sleep(${ms / 1000})`);

describe("compartimentos por banda", () => {
  it("una banda llena espera su turno; la otra no espera", async () => {
    const a = [conTenant(e.a.id, lenta(400)), conTenant(e.a.id, lenta(400)), conTenant(e.a.id, lenta(10))];
    await new Promise((r) => setTimeout(r, 50));
    expect(ocupacionDeBanda(e.a.id)).toEqual({ activas: 2, esperando: 1 });
    const t0 = Date.now();
    await conTenant(e.b.id, lenta(10)); // B no espera a A
    expect(Date.now() - t0).toBeLessThan(300);
    await Promise.all(a);
    expect(ocupacionDeBanda(e.a.id)).toEqual({ activas: 0, esperando: 0 });
  });

  it("una transacción dentro de otra de la misma banda no pide otro turno (no se traba)", async () => {
    const anidadas = Array.from({ length: 2 }, () => conTenant(e.a.id, async () => conTenant(e.a.id, (tx) => tx.$queryRaw`SELECT 1`)));
    await expect(Promise.all(anidadas)).resolves.toHaveLength(2);
  });

  it("si la espera se agota: ErrorBandaOcupada, que para el público es 'probá de nuevo'", async () => {
    expect(esSaturacion(new ErrorBandaOcupada())).toBe(true);
  });
});
