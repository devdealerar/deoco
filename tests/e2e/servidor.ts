import { type ChildProcess, spawn } from "node:child_process";
import { request } from "node:http";
import { CUENTA_CF, KV_CF, TOKEN_CF, ZONA_CF } from "../cloudflare-falso";
import { CLAVE_GD, SECRETO_GD } from "../registrador-falso";
import { TOKEN_RESEND } from "../resend-falso";

export const PUERTO = 3200;
/** Mercado Pago falso (tests/mercadopago-falso.ts) que usa el servidor de pruebas. */
export const PUERTO_MP = 3299;
/** Cloudflare falso (tests/cloudflare-falso.ts) que usa el servidor de pruebas. */
export const PUERTO_CF = 3298;
/** Resend falso (tests/resend-falso.ts): dominios de envío de las bandas. */
export const PUERTO_RESEND = 3297;
/** GoDaddy falso (tests/registrador-falso.ts): la compra de dominios. */
export const PUERTO_GD = 3296;
/** La cuenta de Mercado Pago de Deoco (cuotas) en el servidor de pruebas. */
export const TOKEN_CUOTA = "APP_USR-DEOCO-cuota-e2e";
let servidor: ChildProcess | undefined;

async function esperar(url: string, host: string) {
  for (let i = 0; i < 120; i++) {
    try {
      await fetch(url, { headers: { host } });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("next dev no arrancó");
}

/**
 * GET con la cabecera Host (fetch de Node la descarta: el proxy vería 127.0.0.1 y respondería
 * 404 sin llegar a la ruta). Devuelve el estado; compilar es lo que importa, no la respuesta.
 */
function pedir(host: string, ruta: string): Promise<number> {
  return new Promise((ok, mal) => {
    const r = request({ host: "127.0.0.1", port: PUERTO, path: ruta, headers: { host: `${host}:${PUERTO}` }, timeout: 180_000 }, (res) => {
      res.resume();
      res.on("end", () => ok(res.statusCode ?? 0));
    });
    r.on("timeout", () => r.destroy(new Error(`precalentar: ${host}${ruta} tardó más de 180 s`)));
    r.on("error", mal);
    r.end();
  });
}

/**
 * next dev compila cada ruta la primera vez que se pide. Con la caché de Turbopack fría (después
 * de cambiar código, o en un contenedor nuevo) eso tarda 20–30 s por ruta en este entorno: lo
 * mismo que el límite de Playwright para navegar. Sin esto, la primera prueba que toca cada ruta
 * (casi siempre las del sitio, que van primero) fallaba por tiempo, y las siguientes en cascada.
 * Acá se compilan todas antes de la primera prueba, una por una, sin límite apurado.
 */
async function precalentar() {
  const { dueno } = await import("../apoyo");
  const slug = "precalentar-e2e";
  const borrar = async () => {
    const t = await dueno.tenant.findUnique({ where: { slug } });
    if (!t) return;
    await dueno.moduloTenant.deleteMany({ where: { tenantId: t.id } });
    await dueno.dominio.deleteMany({ where: { tenantId: t.id } });
    await dueno.tenant.delete({ where: { id: t.id } });
  };
  await borrar();
  const banda = await dueno.tenant.create({ data: { nombre: "Precalentar", slug } });
  await dueno.dominio.create({ data: { tenantId: banda.id, dominio: `${slug}.lvh.me`, verificado: true, esPrincipal: true } });
  await dueno.moduloTenant.createMany({ data: ["sitio", "ticketera", "tienda", "prueba"].map((moduloId) => ({ tenantId: banda.id, moduloId })) });
  const app = "app.lvh.me";
  const pedidos: [string, string][] = [
    [app, "/ingresar"],
    [app, "/"],
    [app, "/clave"],
    [app, "/registro"],
    [app, "/registro/verificar"],
    [app, "/registro/banda"],
    [app, "/api/auth/session"],
    [app, "/admin"],
    [app, "/admin/usuarios"],
    [app, "/admin/eventos"],
    [app, "/admin/bandas/nueva"],
    [app, `/admin/bandas/${slug}`],
    [app, "/admin/m/tienda"],
    [app, "/admin/m/comercial"],
    [app, "/admin/m/comercial/planes"],
    [app, "/portal/tienda"],
    [app, `/b/${slug}`],
    [app, `/b/${slug}/sitio`],
    [app, `/b/${slug}/credenciales`],
    [app, `/b/${slug}/dominios`],
    [app, `/b/${slug}/dominios/comprar`],
    [app, `/b/${slug}/dominios/comprar/precalentar.com`],
    [app, `/b/${slug}/dominios/comprar/precalentar.com/resumen`],
    [app, `/b/${slug}/dominios/compras`],
    [app, "/admin/dominios"],
    [app, "/admin/m/comercial/dominios"],
    [app, `/b/${slug}/correo`],
    [app, `/b/${slug}/pago`],
    [app, `/b/${slug}/archivos/00000000-0000-0000-0000-000000000000/x`],
    [app, `/descargas/${banda.id}/00000000-0000-0000-0000-000000000000/x`],
    [`${slug}.lvh.me`, "/"],
    [`${slug}.lvh.me`, "/no-existe"],
    [`${slug}.lvh.me`, "/archivos/00000000-0000-0000-0000-000000000000/x"],
  ];
  const rotas: string[] = [];
  try {
    for (const [host, ruta] of pedidos) {
      const estado = await pedir(host, ruta);
      if (estado >= 500) rotas.push(`${host}${ruta} → ${estado}`);
    }
  } finally {
    // Cada archivo de pruebas empieza vaciando la base (limpiar()); esto es por prolijidad.
    await borrar().catch(() => {});
    await dueno.$disconnect();
  }
  // Un 500 acá es que la app no carga (un error al compilar o al importar): todas las pruebas
  // fallarían por tiempo, de a 30 s cada una. Mejor cortar ya, con el motivo (E2E_LOG=1).
  if (rotas.length) throw new Error(`La app responde 500 antes de empezar (E2E_LOG=1 muestra el error):\n${rotas.join("\n")}`);
}

/** Levanta next dev contra la base de pruebas (el env ya viene de .env.test). */
export async function setup() {
  servidor = spawn("npx", ["next", "dev", "-p", String(PUERTO)], {
    env: { ...process.env, DEOCO_DOMINIO_RAIZ: "lvh.me", DEOCO_MERCADOPAGO_API: `http://127.0.0.1:${PUERTO_MP}`, DEOCO_CUOTA_MP_TOKEN: TOKEN_CUOTA, DEOCO_CLOUDFLARE_API: `http://127.0.0.1:${PUERTO_CF}`, DEOCO_CLOUDFLARE_TOKEN: TOKEN_CF, DEOCO_CLOUDFLARE_ZONA: ZONA_CF, DEOCO_CLOUDFLARE_CUENTA: CUENTA_CF, DEOCO_IP_PUBLICA: "203.0.113.10", DEOCO_CLOUDFLARE_KV: KV_CF, DEOCO_RESEND_API: `http://127.0.0.1:${PUERTO_RESEND}`, DEOCO_RESEND_TOKEN: TOKEN_RESEND, DEOCO_REGISTRADOR: "godaddy", DEOCO_GODADDY_KEY: CLAVE_GD, DEOCO_GODADDY_SECRET: SECRETO_GD, DEOCO_GODADDY_API: `http://127.0.0.1:${PUERTO_GD}`, DEOCO_GODADDY_POR_MINUTO: "100000", NODE_ENV: "development" },
    stdio: process.env.E2E_LOG ? "inherit" : "ignore",
    detached: true,
  });
  await esperar(`http://127.0.0.1:${PUERTO}/ingresar`, "app.lvh.me");
  const inicio = Date.now();
  try {
    await precalentar();
  } catch (e) {
    await teardown(); // si setup falla, vitest no llama a teardown: que no quede next dev colgado
    throw e;
  }
  console.log(`e2e: rutas compiladas en ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
}

export async function teardown() {
  if (servidor?.pid) process.kill(-servidor.pid, "SIGTERM");
}
