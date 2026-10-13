import { type ChildProcess, spawn } from "node:child_process";

export const PUERTO = 3200;
/** Mercado Pago falso (tests/mercadopago-falso.ts) que usa el servidor de pruebas. */
export const PUERTO_MP = 3299;
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

/** Levanta next dev contra la base de pruebas (el env ya viene de .env.test). */
export async function setup() {
  servidor = spawn("npx", ["next", "dev", "-p", String(PUERTO)], {
    env: { ...process.env, DEOCO_DOMINIO_RAIZ: "lvh.me", DEOCO_IP_PUBLICA: "203.0.113.10", DEOCO_MERCADOPAGO_API: `http://127.0.0.1:${PUERTO_MP}`, NODE_ENV: "development" },
    stdio: process.env.E2E_LOG ? "inherit" : "ignore",
    detached: true,
  });
  await esperar(`http://127.0.0.1:${PUERTO}/ingresar`, "app.lvh.me");
}

export async function teardown() {
  if (servidor?.pid) process.kill(-servidor.pid, "SIGTERM");
}
