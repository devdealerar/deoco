import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/nucleo/db/cliente";
import { codigoFirmado, firmaValida, formatearCodigo, nuevoCodigo } from "../modulos/ticketera/firma";
import { validarEntrada } from "../modulos/ticketera/puerta";
import { dueno, escenarioAcceso } from "./apoyo";

// El QR de cada entrada es único y FIRMADO (documento maestro §9): la puerta verifica la firma
// (HMAC con DEOCO_CLAVE_QR, por banda) antes de tocar la base. Para contar las veces que la
// puerta toca la base, se envuelve conTenant.
const tocadas = vi.hoisted(() => ({ n: 0 }));
vi.mock("@/nucleo/db/con-tenant", async (original) => {
  const m = await original<typeof import("@/nucleo/db/con-tenant")>();
  return { ...m, conTenant: ((...args: Parameters<typeof m.conTenant>) => (tocadas.n++, m.conTenant(...args))) as typeof m.conTenant };
});

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
let eventoId = "";

/** Una entrada pagada de A para el show, con este código guardado tal cual. */
async function entrada(codigo: string) {
  const t = await dueno.ticketeraTipo.findFirstOrThrow({ where: { eventoId } });
  const c = await dueno.ticketeraCompra.create({
    data: {
      tenantId: e.a.id, eventoId, tipoId: t.id, estado: "PAGADA", cantidad: 1, precioUnitario: 100, total: 100,
      nombre: "Fan", email: "fan@x.com", asistentes: [], venceEn: new Date(), token: "t", pagadaEn: new Date(),
    },
  });
  await dueno.ticketeraEntrada.create({ data: { tenantId: e.a.id, compraId: c.id, eventoId, tipoId: t.id, nombre: "Fan", documento: "30000000", codigo } });
}

beforeAll(async () => {
  e = await escenarioAcceso();
  const ev = await dueno.ticketeraEvento.create({ data: { tenantId: e.a.id, nombre: "Show", fecha: new Date(Date.now() + 86400_000), lugar: "Sala", ciudad: "CABA" } });
  eventoId = ev.id;
  await dueno.ticketeraTipo.create({ data: { tenantId: e.a.id, eventoId, nombre: "General", precio: 100, cupo: 10 } });
});
beforeEach(async () => {
  await dueno.ticketeraEntrada.deleteMany();
  await dueno.ticketeraCompra.deleteMany();
  tocadas.n = 0;
});
afterAll(async () => {
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("código firmado", () => {
  it("20 caracteres: 10 al azar y 10 de firma; la firma es de la banda", () => {
    const c = codigoFirmado(e.a.id, nuevoCodigo());
    expect(c).toMatch(/^[A-HJ-NP-Z2-9]{20}$/);
    expect(firmaValida(e.a.id, c)).toBe(true);
    expect(firmaValida(e.b.id, c)).toBe(false); // el de otra banda no pasa
    const otro = c.slice(0, 10) + (c[10] === "A" ? "B" : "A") + c.slice(11);
    expect(firmaValida(e.a.id, otro)).toBe(false);
    expect(formatearCodigo(c)).toBe(`${c.slice(0, 5)}-${c.slice(5, 10)}-${c.slice(10, 15)}-${c.slice(15)}`);
  });

  it("sin DEOCO_CLAVE_QR (o corta) no firma: mejor no vender que vender sin firma", () => {
    const antes = process.env.DEOCO_CLAVE_QR;
    try {
      delete process.env.DEOCO_CLAVE_QR;
      expect(() => codigoFirmado(e.a.id, nuevoCodigo())).toThrow(/DEOCO_CLAVE_QR/);
      process.env.DEOCO_CLAVE_QR = Buffer.alloc(16).toString("base64");
      expect(() => codigoFirmado(e.a.id, nuevoCodigo())).toThrow(/DEOCO_CLAVE_QR/);
    } finally {
      process.env.DEOCO_CLAVE_QR = antes;
    }
  });
});

describe("la puerta verifica la firma antes de tocar la base", () => {
  it("un código inventado con el formato correcto se rechaza por firma, sin llegar a la base", async () => {
    const inventado = nuevoCodigo() + nuevoCodigo();
    expect(await validarEntrada(e.a.id, eventoId, inventado, e.multi.id, "intento-uno")).toEqual({ resultado: "invalida" });
    expect(tocadas.n).toBe(0);
  });

  it("uno real (con guiones o en minúsculas) pasa y queda ingresado", async () => {
    const c = codigoFirmado(e.a.id, nuevoCodigo());
    await entrada(c);
    expect((await validarEntrada(e.a.id, eventoId, formatearCodigo(c).toLowerCase(), e.multi.id, "intento-uno")).resultado).toBe("valida");
    expect(tocadas.n).toBe(1);
    expect((await dueno.ticketeraEntrada.findFirstOrThrow({ where: { codigo: c } })).validadaEn).not.toBeNull();
  });

  it("uno real de otra banda tampoco llega a la base", async () => {
    const deB = codigoFirmado(e.b.id, nuevoCodigo());
    expect(await validarEntrada(e.a.id, eventoId, deB, e.multi.id, "intento-uno")).toEqual({ resultado: "invalida" });
    expect(tocadas.n).toBe(0);
  });

  it("transición: un código viejo de 10 caracteres sin firma, si existe, sigue entrando", async () => {
    const viejo = nuevoCodigo();
    await entrada(viejo);
    expect((await validarEntrada(e.a.id, eventoId, viejo, e.multi.id, "intento-uno")).resultado).toBe("valida");
    // Uno viejo inventado: no existe (para el formato viejo no hay firma: se busca).
    expect((await validarEntrada(e.a.id, eventoId, nuevoCodigo(), e.multi.id, "intento-dos")).resultado).toBe("invalida");
  });

  it("cualquier otro largo, ni se busca", async () => {
    for (const c of ["", "ABC", nuevoCodigo() + "X", nuevoCodigo() + nuevoCodigo() + "X"]) {
      expect((await validarEntrada(e.a.id, eventoId, c, e.multi.id, "intento-uno")).resultado).toBe("invalida");
    }
    expect(tocadas.n).toBe(0);
  });
});
