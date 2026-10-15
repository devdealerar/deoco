import { type ChildProcess, execSync, spawn } from "node:child_process";

// `next build` + `next start` (producción) en :3300 contra la base de pruebas. CARGA_SIN_BUILD=1
// usa el build que ya esté (.next).
export const PUERTO = 3300;
export const PUERTO_MP = 3298;
let servidor: ChildProcess | undefined;

const entorno = (): NodeJS.ProcessEnv => ({
  ...process.env,
  NODE_ENV: "production",
  DEOCO_DOMINIO_RAIZ: "lvh.me",
  DEOCO_MERCADOPAGO_API: `http://127.0.0.1:${PUERTO_MP}`,
  DEOCO_CORREO: "memoria",
  PORT: String(PUERTO),
});

export async function setup() {
  if (!process.env.CARGA_SIN_BUILD) execSync("npx next build", { stdio: process.env.CARGA_LOG ? "inherit" : "ignore", env: entorno() });
  servidor = spawn("npx", ["next", "start", "-p", String(PUERTO)], { env: entorno(), stdio: process.env.CARGA_LOG ? "inherit" : "ignore", detached: true });
  for (let i = 0; i < 120; i++) {
    try {
      await fetch(`http://127.0.0.1:${PUERTO}/ingresar`, { headers: { host: "app.lvh.me" } });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("next start no arrancó");
}

export async function teardown() {
  if (servidor?.pid) process.kill(-servidor.pid, "SIGTERM");
}
