// Carga de toda la plataforma, contra el build de producción: muchas bandas con sitio, tienda y
// ticketera prendidos, y una mezcla de pedidos a la vez (sitio público, catálogo, fechas, panel
// con sesión: inicio y plan y pago). Sube la concurrencia de a escalones y dice dónde está el
// techo: el primer escalón con errores del servidor o con p95 por encima de 2 s.
import { readFileSync } from "node:fs";
import { request } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conTenant } from "@/nucleo/db/con-tenant";
import { configPool } from "@/nucleo/db/config";
import { publicar } from "../../modulos/sitio/contenido";
import { alCrearBanda } from "../../modulos/comercial/cuenta";
import { crearEvento, crearTipo, publicarEvento } from "../../modulos/ticketera/eventos";
import { CONTRASENA, dueno, limpiar } from "../apoyo";
import { PUERTO, PUERTO_MP } from "./servidor";
import { MercadoPagoFalso } from "../mercadopago-falso";

const BANDAS = 30;
const ESCALONES = [10, 25, 50, 100, 200, 400];
const POR_ESCALON = 600; // pedidos por escalón
const TECHO_P95_MS = 2000;
const mp = new MercadoPagoFalso();
let cookie = "";
const slugs: string[] = [];

type Respuesta = { estado: number; ms: number; cuerpo: string; cabeceras: Record<string, string | string[] | undefined> };
function pedir(host: string, ruta: string, opciones: { metodo?: string; cabeceras?: Record<string, string>; cuerpo?: Buffer } = {}) {
  return new Promise<Respuesta>((ok) => {
    const inicio = Date.now();
    const r = request(
      { host: "127.0.0.1", port: PUERTO, path: ruta, method: opciones.metodo ?? "GET", headers: { host: `${host}:${PUERTO}`, ...opciones.cabeceras }, timeout: 60_000 },
      (res) => {
        let d = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (d += c));
        res.on("end", () => ok({ estado: res.statusCode!, ms: Date.now() - inicio, cuerpo: d, cabeceras: res.headers }));
      },
    );
    r.on("timeout", () => r.destroy(new Error("timeout")));
    r.on("error", () => ok({ estado: 0, ms: Date.now() - inicio, cuerpo: "", cabeceras: {} }));
    r.end(opciones.cuerpo);
  });
}

/** Ingresa por el formulario de /ingresar (server action sin JavaScript) y devuelve la cookie de sesión. */
async function ingresar(email: string) {
  const m = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8")) as { node: Record<string, { exportedName: string; filename: string }> };
  const [id] = Object.entries(m.node).find(([, v]) => v.exportedName === "ingresar" && v.filename.endsWith("ingresar/acciones.ts"))!;
  const fd = new FormData();
  fd.set(`$ACTION_ID_${id}`, "");
  fd.set("volver", "/");
  fd.set("email", email);
  fd.set("contrasena", CONTRASENA);
  const req = new Request("http://x", { method: "POST", body: fd });
  const r = await pedir("app.lvh.me", "/ingresar", { metodo: "POST", cabeceras: { "content-type": req.headers.get("content-type")! }, cuerpo: Buffer.from(await req.arrayBuffer()) });
  const set = [r.cabeceras["set-cookie"] ?? []].flat().find((c) => c.startsWith("deoco.sesion=") || c.startsWith("__Host-deoco.sesion="));
  if (!set) throw new Error(`no se pudo ingresar (HTTP ${r.estado})`);
  return set.split(";")[0];
}

/** La mezcla: lo que hace la gente en un día cualquiera. */
const ETIQUETAS = ["sitio /", "sitio /", "sitio /fechas", "sitio /tienda", "sitio /prensa", "panel inicio", "panel pago", "panel tienda"];
function pedidoNumero(i: number): () => Promise<Respuesta> {
  const slug = slugs[i % slugs.length];
  const sitio = `${slug}.lvh.me`;
  const panel = { cabeceras: { cookie } };
  const mezcla = [
    () => pedir(sitio, "/"),
    () => pedir(sitio, "/"),
    () => pedir(sitio, "/fechas"),
    () => pedir(sitio, "/tienda"),
    () => pedir(sitio, "/prensa"),
    () => pedir("app.lvh.me", `/b/${slug}`, panel),
    () => pedir("app.lvh.me", `/b/${slug}/pago`, panel),
    () => pedir("app.lvh.me", `/b/${slug}/tienda`, panel),
  ];
  return mezcla[i % mezcla.length];
}

const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))];

beforeAll(async () => {
  await mp.iniciar(PUERTO_MP);
  await limpiar();
  const { hashearContrasena } = await import("@/nucleo/auth/contrasena");
  const titular = await dueno.usuario.create({ data: { email: "carga@x.com", nombre: "Carga", hashContrasena: await hashearContrasena(CONTRASENA) } });
  for (let n = 0; n < BANDAS; n++) {
    const slug = `carga-${n}`;
    const t = await dueno.tenant.create({ data: { nombre: `Banda ${n}`, slug } });
    await dueno.dominio.create({ data: { tenantId: t.id, dominio: `${slug}.lvh.me`, esPrincipal: true, verificado: true } });
    await dueno.membresia.create({ data: { tenantId: t.id, usuarioId: titular.id, rol: "TITULAR" } });
    await dueno.moduloTenant.create({ data: { tenantId: t.id, moduloId: "comercial" } });
    await alCrearBanda(t.id); // prueba de Medium: sitio + tienda
    await dueno.moduloTenant.create({ data: { tenantId: t.id, moduloId: "ticketera" } });
    await conTenant(t.id, (tx) => publicar(tx, t.id, titular.id));
    const show = await crearEvento(t.id, { nombre: `Gira ${n}`, fecha: new Date(Date.now() + 10 * 86_400_000), lugar: "Club", ciudad: "Rosario", direccion: "", descripcion: "" });
    await crearTipo(t.id, show, { nombre: "General", precio: 1000000, cupo: 200, ventaDesde: null, ventaHasta: null });
    await publicarEvento(t.id, show, true);
    slugs.push(slug);
  }
  cookie = await ingresar("carga@x.com");
}, 600_000);
afterAll(async () => {
  await mp.cerrar();
  await dueno.$disconnect();
});

describe(`toda la plataforma: ${BANDAS} bandas, mezcla de sitio, tienda, fechas y panel`, () => {
  it("sube la concurrencia hasta encontrar el techo", async () => {
    // Calienta cada tipo de página y mide cuánto tarda cada una sola (sin competencia).
    for (let i = 0; i < 8; i++) await pedidoNumero(i)();
    const solo = new Map<string, number[]>();
    for (let i = 0; i < 80; i++) {
      const r = await pedidoNumero(i)();
      solo.set(ETIQUETAS[i % 8], [...(solo.get(ETIQUETAS[i % 8]) ?? []), r.ms]);
    }
    console.log(`[carga plataforma] de a uno (p50 ms): ${JSON.stringify(Object.fromEntries([...solo].map(([k, v]) => [k, pct(v, 0.5)])))}`);
    const filas: { concurrencia: number; rps: number; p50: number; p95: number; max: number; errores: number; noOk: Record<string, number> }[] = [];
    for (const concurrencia of ESCALONES) {
      const tiempos: number[] = [];
      const noOk = new Map<number, number>();
      let siguiente = 0;
      const inicio = Date.now();
      await Promise.all(
        Array.from({ length: concurrencia }, async () => {
          while (siguiente < POR_ESCALON) {
            const r = await pedidoNumero(siguiente++)();
            tiempos.push(r.ms);
            if (r.estado !== 200) noOk.set(r.estado, (noOk.get(r.estado) ?? 0) + 1);
          }
        }),
      );
      const seg = (Date.now() - inicio) / 1000;
      const errores = [...noOk.entries()].filter(([e]) => e === 0 || e >= 500).reduce((s, [, n]) => s + n, 0);
      filas.push({ concurrencia, rps: Math.round(POR_ESCALON / seg), p50: pct(tiempos, 0.5), p95: pct(tiempos, 0.95), max: Math.max(...tiempos), errores, noOk: Object.fromEntries(noOk) });
      console.log(`[carga plataforma] ${JSON.stringify(filas.at(-1))}`);
      if (errores > POR_ESCALON * 0.05) break; // ya se cayó: no tiene sentido seguir subiendo
    }
    const techo = filas.find((f) => f.errores > 0 || f.p95 > TECHO_P95_MS);
    console.log(
      `[carga plataforma] pool ${configPool().max} conexiones · techo: ${techo ? `${techo.concurrencia} a la vez (p95 ${techo.p95} ms, ${techo.errores} errores)` : `no se alcanzó con ${ESCALONES.at(-1)}`}`,
    );
    // Lo que se exige: hasta 50 a la vez (mucho más que el uso normal), sin errores y con p95 < 2 s.
    for (const f of filas.filter((x) => x.concurrencia <= 50)) {
      expect(f.errores).toBe(0);
      expect(f.p95).toBeLessThan(TECHO_P95_MS);
    }
    // Ningún pedido devolvió algo que no sea 200 por otra razón que la saturación.
    for (const f of filas) expect(Object.keys(f.noOk).every((e) => e === "0" || Number(e) >= 500)).toBe(true);
  }, 900_000);
});
