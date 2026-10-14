// Apertura de venta por HTTP, contra el build de producción: cientos de fans cargan la página
// del show y compran a la vez (la misma acción del servidor que dispara el formulario).
// No se sobrevende, ninguna respuesta es un error del servidor, y cada fan que no entra recibe
// una frase ("agotada" o "probá de nuevo").
import { readFileSync } from "node:fs";
import { request } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prenderModulo } from "@/nucleo/modulos/encendido";
import { guardarSecreto } from "@/nucleo/secretos/carga";
import { crearEvento, crearTipo, evento, publicarEvento } from "../../modulos/ticketera/eventos";
import { dueno, escenarioAcceso } from "../apoyo";
import { dominiosDeDesarrollo } from "../e2e/navegador";
import { MercadoPagoFalso } from "../mercadopago-falso";
import { PUERTO, PUERTO_MP } from "./servidor";

const mp = new MercadoPagoFalso();
const HOST = `banda-a.lvh.me:${PUERTO}`;
const CUPO = 30;
const FANS = 300;
let showId = "";
let tipoId = "";

function pedir(metodo: "GET" | "POST", ruta: string, cabeceras: Record<string, string> = {}, cuerpo?: Buffer) {
  return new Promise<{ estado: number; texto: string; ms: number }>((ok, mal) => {
    const inicio = Date.now();
    const r = request({ host: "127.0.0.1", port: PUERTO, path: ruta, method: metodo, headers: { host: HOST, ...cabeceras } }, (res) => {
      let d = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (d += c));
      res.on("end", () => ok({ estado: res.statusCode!, texto: d, ms: Date.now() - inicio }));
    });
    r.on("error", mal);
    r.end(cuerpo);
  });
}

/** Id de la acción `comprarAccion` en el build (manifiesto de server actions de Next). */
function idDeAccion(nombre: string, archivo: string) {
  const m = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8")) as {
    node: Record<string, { exportedName: string; filename: string }>;
  };
  const [id] = Object.entries(m.node).find(([, v]) => v.exportedName === nombre && v.filename === archivo)!;
  return id;
}

/** Lo que manda el formulario de compra: (estadoAnterior, FormData), codificado como lo hace React. */
async function cuerpoDeCompra(i: number) {
  const { encodeReply } = await import("next/dist/compiled/react-server-dom-webpack/client.node");
  const fd = new FormData();
  fd.set("tipoId", tipoId);
  fd.set("cantidad", "1");
  fd.set("nombre", `Fan ${i}`);
  fd.set("email", `fan${i}@ejemplo.com`);
  fd.set("asistente-0-nombre", `Fan ${i}`);
  fd.set("asistente-0-documento", `${30000000 + i}`);
  const cuerpo = (await encodeReply([{}, fd])) as FormData;
  const req = new Request("http://x", { method: "POST", body: cuerpo });
  return { tipo: req.headers.get("content-type")!, datos: Buffer.from(await req.arrayBuffer()) };
}

const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)];

beforeAll(async () => {
  await mp.iniciar(PUERTO_MP);
  const e = await escenarioAcceso();
  await dominiosDeDesarrollo(e.a, e.b);
  for (const t of ["ticketeraEntrada", "ticketeraCompra", "ticketeraTipo", "ticketeraEvento"] as const) {
    await (dueno[t] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await prenderModulo(e.staff.id, e.a.id, "ticketera");
  await guardarSecreto(e.multi.id, e.a.id, "pagos", "mercadopago_access_token", "APP_USR-carga-http");
  showId = await crearEvento(e.a.id, { nombre: "Apertura", fecha: new Date(Date.now() + 30 * 86400_000), lugar: "Estadio", ciudad: "CABA", direccion: "", descripcion: "" });
  await crearTipo(e.a.id, showId, { nombre: "General", precio: 1500000, cupo: CUPO, ventaDesde: null, ventaHasta: null });
  await publicarEvento(e.a.id, showId, true);
  tipoId = (await evento(e.a.id, showId))!.tipos[0].id;
});
afterAll(async () => {
  await mp.cerrar();
  await dueno.$disconnect();
});

describe(`apertura de venta por HTTP (producción): ${FANS} fans, ${CUPO} lugares`, () => {
  it("todos cargan la página del show; ninguna respuesta es un error", async () => {
    await pedir("GET", `/fechas/${showId}`); // calienta
    const r = await Promise.all(Array.from({ length: FANS }, () => pedir("GET", `/fechas/${showId}`)));
    const estados = new Map<number, number>();
    for (const x of r) estados.set(x.estado, (estados.get(x.estado) ?? 0) + 1);
    console.log(`[carga http] GET /fechas/<id> ×${FANS}: estados ${JSON.stringify(Object.fromEntries(estados))}, p95 ${p95(r.map((x) => x.ms))} ms, máx ${Math.max(...r.map((x) => x.ms))} ms`);
    expect(estados.get(200)).toBe(FANS);
    expect(r.every((x) => x.texto.includes("Apertura"))).toBe(true);
  });

  it("todos compran a la vez: entran exactamente los del cupo; los demás leen 'agotada' (o 'probá de nuevo'), ningún error", async () => {
    const accion = idDeAccion("comprarAccion", "modulos/ticketera/publico/acciones.ts");
    const cuerpos = await Promise.all(Array.from({ length: FANS }, (_, i) => cuerpoDeCompra(i)));
    const r = await Promise.all(
      cuerpos.map((c) => pedir("POST", `/fechas/${showId}`, { "next-action": accion, "content-type": c.tipo, accept: "text/x-component" }, c.datos)),
    );
    const redirecciones = r.filter((x) => x.texto.includes('"redireccion"'));
    // React codifica `undefined` como "$undefined": eso no es un mensaje.
    const errores = r
      .map((x) => x.texto.match(/"error":"((?:[^"\\]|\\.)*)"/)?.[1])
      .filter((x): x is string => !!x && x !== "$undefined");
    const mensajes = new Set(errores.map((m) => JSON.parse(`"${m}"`) as string));
    console.log(
      `[carga http] POST compra ×${FANS}: HTTP ${JSON.stringify(Object.fromEntries(r.reduce((m, x) => m.set(x.estado, (m.get(x.estado) ?? 0) + 1), new Map<number, number>())))}, ` +
        `${redirecciones.length} a pagar, mensajes: ${[...mensajes].join(" | ")}, p95 ${p95(r.map((x) => x.ms))} ms`,
    );
    expect(r.every((x) => x.estado === 200)).toBe(true);
    expect(redirecciones).toHaveLength(CUPO);
    expect(redirecciones.length + errores.length).toBe(FANS); // cada fan recibió una respuesta legible
    expect([...mensajes].every((m) => m === '"General" está agotada.' || m.startsWith("Hay mucha gente comprando"))).toBe(true);
    expect((await dueno.ticketeraTipo.findUniqueOrThrow({ where: { id: tipoId } })).ocupadas).toBe(CUPO);
    expect(await dueno.ticketeraCompra.count({ where: { tipoId } })).toBe(CUPO);
  });
});
