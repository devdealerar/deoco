import { createHmac } from "node:crypto";
import { request } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { esperarEventos } from "@/nucleo/eventos/bus";
import { prenderModulo } from "@/nucleo/modulos/encendido";
import { guardarSecreto } from "@/nucleo/secretos/carga";
import { dueno, escenarioAcceso } from "../apoyo";
import { dominiosDeDesarrollo } from "./navegador";
import { PUERTO } from "./servidor";

let e: Awaited<ReturnType<typeof escenarioAcceso>>;
const TOKEN = "token-e2e-de-la-pasarela-0002";

/** POST crudo al servidor de desarrollo, con el Host que elijamos (sin navegador). */
function enviar(host: string, path: string, cuerpo: string, cabeceras: Record<string, string> = {}) {
  return new Promise<{ estado: number; cuerpo: string; ms: number }>((ok, mal) => {
    const inicio = Date.now();
    const r = request({ host: "127.0.0.1", port: PUERTO, path, method: "POST", headers: { host: `${host}:${PUERTO}`, ...cabeceras } }, (res) => {
      let datos = "";
      res.on("data", (c) => (datos += c));
      res.on("end", () => ok({ estado: res.statusCode!, cuerpo: datos, ms: Date.now() - inicio }));
    });
    r.on("error", mal);
    r.end(cuerpo);
  });
}

beforeAll(async () => {
  e = await escenarioAcceso();
  await dominiosDeDesarrollo(e.a, e.b);
  await prenderModulo(e.staff.id, e.a.id, "prueba");
  await guardarSecreto(e.multi.id, e.a.id, "prueba", "token", TOKEN);
});
afterAll(async () => {
  await esperarEventos();
  await dueno.moduloTenant.deleteMany();
  await dueno.secreto.deleteMany();
  await dueno.$disconnect();
});

describe("avisos externos por HTTP real", () => {
  it("en app.<raiz>: la banda la resuelve el núcleo, responde rápido y no duplica", async () => {
    const cuerpo = '{"id":"pago-e2e"}';
    const firma = createHmac("sha256", TOKEN).update(cuerpo).digest("hex");
    const path = `/avisos/${e.a.id}/prueba/pago`;
    await enviar("app.lvh.me", path, "{}", { "x-firma": "00" }); // next dev compila la ruta en el primer pedido
    const r1 = await enviar("app.lvh.me", path, cuerpo, { "x-firma": firma, "content-type": "application/json" });
    expect([r1.estado, JSON.parse(r1.cuerpo)]).toEqual([200, { recibido: true, repetido: false }]);
    expect(r1.ms).toBeLessThan(1500); // el suscripto de prueba tarda 1,5 s y no se lo espera
    const r2 = await enviar("app.lvh.me", path, cuerpo, { "x-firma": firma });
    expect(JSON.parse(r2.cuerpo)).toEqual({ recibido: true, repetido: true });
    expect(await dueno.evento.count({ where: { tenantId: e.a.id, claveUnica: "pago:pago-e2e" } })).toBe(1);
  });

  it("firma inválida → 401; con el módulo apagado se atiende igual (es plata que ya se movió): responde el módulo", async () => {
    expect((await enviar("app.lvh.me", `/avisos/${e.a.id}/prueba/pago`, '{"id":"x"}', { "x-firma": "00" })).estado).toBe(401);
    // B tiene el módulo apagado: el aviso llega al módulo, que contesta que B no cargó su token.
    expect((await enviar("app.lvh.me", `/avisos/${e.b.id}/prueba/pago`, '{"id":"x"}')).estado).toBe(409);
    // Una banda que no existe, 404.
    expect((await enviar("app.lvh.me", `/avisos/00000000-0000-4000-8000-000000000000/prueba/pago`, '{"id":"x"}')).estado).toBe(404);
  });

  it("en el host de una banda, /avisos no existe", async () => {
    expect((await enviar("banda-a.lvh.me", `/avisos/${e.a.id}/prueba/pago`, '{"id":"x"}')).estado).toBe(404);
  });
});
