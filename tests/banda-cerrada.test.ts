import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { rutaAbiertaConBandaCerrada } from "@/nucleo/acceso/banda-cerrada";
import { resolverAcceso } from "@/nucleo/acceso/resolver";
import { crearRegistro, ErrorRegistro } from "@/nucleo/modulos/registro";
import { prisma } from "@/nucleo/db/cliente";
import { dueno, escenarioAcceso } from "./apoyo";

// Con la banda SUSPENDIDA o ARCHIVADA el panel se cierra, salvo las rutas de módulo que
// declaran `conBandaCerrada`: la puerta, mientras haya un show con entradas vendidas que no
// terminó (documento maestro §14: el escaneo sigue hasta que el evento termine).

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
let puerta = "";

/** Un show de A en `fecha`, con `vendidas` entradas pagadas. */
async function show(fecha: Date, vendidas: number) {
  const ev = await dueno.ticketeraEvento.create({ data: { tenantId: e.a.id, nombre: "Show", fecha, lugar: "Sala", ciudad: "CABA" } });
  const t = await dueno.ticketeraTipo.create({ data: { tenantId: e.a.id, eventoId: ev.id, nombre: "General", precio: 100, cupo: 10, ocupadas: vendidas } });
  if (vendidas) {
    const c = await dueno.ticketeraCompra.create({
      data: {
        tenantId: e.a.id, eventoId: ev.id, tipoId: t.id, estado: "PAGADA", cantidad: vendidas, precioUnitario: 100, total: 100 * vendidas,
        nombre: "Fan", email: "fan@x.com", asistentes: [], venceEn: new Date(), token: "t", pagadaEn: new Date(),
      },
    });
    for (let i = 0; i < vendidas; i++) {
      await dueno.ticketeraEntrada.create({ data: { tenantId: e.a.id, compraId: c.id, eventoId: ev.id, tipoId: t.id, nombre: `Fan ${i}`, documento: "30000000", codigo: `COD${ev.id.slice(0, 4)}${i}` } });
    }
  }
  return ev.id;
}

const abierta = async (usuarioId: string, ruta: string) => rutaAbiertaConBandaCerrada((await resolverAcceso(usuarioId, e.a.id))!, ruta);

beforeAll(async () => {
  e = await escenarioAcceso();
  puerta = (await dueno.usuario.create({ data: { email: "puerta@x.com", nombre: "P", hashContrasena: "x" } })).id;
  await dueno.membresia.create({ data: { tenantId: e.a.id, usuarioId: puerta, rol: "PUERTA" } });
  await dueno.moduloTenant.createMany({ data: ["ticketera", "sitio", "tienda"].map((moduloId) => ({ tenantId: e.a.id, moduloId })) });
  await dueno.tenant.update({ where: { id: e.a.id }, data: { estado: "SUSPENDIDO" } });
});
beforeEach(async () => {
  for (const t of ["ticketeraEntrada", "ticketeraCompra", "ticketeraTipo", "ticketeraEvento"] as const) {
    await (dueno[t] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
});
afterAll(async () => {
  await prisma.$disconnect();
  await dueno.$disconnect();
});

describe("la puerta con la banda cerrada", () => {
  it("abre si hay un show por delante con entradas vendidas, para quien valida", async () => {
    const id = await show(new Date(Date.now() + 86400_000), 2);
    expect(await abierta(puerta, "/puerta")).toBe(true);
    expect(await abierta(puerta, `/puerta/${id}`)).toBe(true);
    expect(await abierta(e.multi.id, `/puerta/${id}`)).toBe(true); // el titular también valida
  });

  it("la noche del show sigue abierta (hasta 6 h después de empezar); después, cerrada", async () => {
    const empezo = await show(new Date(Date.now() - 2 * 3600_000), 1);
    expect(await abierta(puerta, `/puerta/${empezo}`)).toBe(true);
    const termino = await show(new Date(Date.now() - 7 * 3600_000), 1);
    expect(await abierta(puerta, `/puerta/${termino}`)).toBe(false);
  });

  it("cerrada si no hay entradas vendidas, para un show ajeno o inexistente", async () => {
    const sinVentas = await show(new Date(Date.now() + 86400_000), 0);
    expect(await abierta(puerta, "/puerta")).toBe(false);
    expect(await abierta(puerta, `/puerta/${sinVentas}`)).toBe(false);
    expect(await abierta(puerta, "/puerta/no-es-un-id")).toBe(false);
    await show(new Date(Date.now() + 86400_000), 1);
    expect(await abierta(puerta, `/puerta/${sinVentas}`)).toBe(false); // hay otro con ventas: este sigue cerrado
  });

  it("nada más se abre: ni las ventas, ni el sitio, ni la tienda, ni para quien no valida", async () => {
    const id = await show(new Date(Date.now() + 86400_000), 2);
    for (const ruta of ["/entradas", `/entradas/${id}`, "/sitio", "/tienda", "/tienda/pedidos", "/no-existe"]) {
      expect(await abierta(e.multi.id, ruta)).toBe(false);
    }
    expect(await abierta(e.editorA.id, `/puerta/${id}`)).toBe(false); // EDITOR no valida
  });

  it("con la ticketera apagada, la puerta tampoco abre", async () => {
    const id = await show(new Date(Date.now() + 86400_000), 2);
    await dueno.moduloTenant.deleteMany({ where: { tenantId: e.a.id, moduloId: "ticketera" } });
    try {
      expect(await abierta(puerta, `/puerta/${id}`)).toBe(false);
    } finally {
      await dueno.moduloTenant.create({ data: { tenantId: e.a.id, moduloId: "ticketera" } });
    }
  });
});

describe("contrato: conBandaCerrada", () => {
  const componente = () => null;
  const abre = async () => true;
  it("en rutas de panel (con permiso: no se abre a cualquier miembro) y del sitio público", () => {
    const base = { id: "uno", nombre: "Uno", permisos: [{ clave: "uno.cosa.ver", rolesPorDefecto: ["TITULAR"] }] };
    expect(() => crearRegistro([{ ...base, rutasPanel: [{ ruta: "/cosa", componente, conBandaCerrada: abre }] }])).toThrow(ErrorRegistro);
    expect(() => crearRegistro([{ ...base, rutasPublicas: [{ ruta: "/cosa", componente, conBandaCerrada: abre }] }])).not.toThrow(); // el pedido del fan
    expect(() => crearRegistro([{ ...base, rutasAdmin: [{ ruta: "/cosa", componente, conBandaCerrada: abre }] }])).toThrow(/solo del panel y del sitio público/);
    expect(() => crearRegistro([{ ...base, rutasPanel: [{ ruta: "/cosa", permiso: "uno.cosa.ver", componente, conBandaCerrada: abre }] }])).not.toThrow();
  });
});
