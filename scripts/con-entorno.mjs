#!/usr/bin/env node
// Corre un comando con las variables de un archivo .env, que PISAN las del entorno:
//   node scripts/con-entorno.mjs .env.test -- prisma migrate deploy
// Pisar importa: una DATABASE_URL_MIGRACIONES del entorno no puede llevar las migraciones
// de prueba a otra base. Reemplaza a dotenv-cli, cuyo comando `dotenv` choca con el del
// paquete dotenv (los dos se instalan como node_modules/.bin/dotenv y gana uno al azar).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";

const [archivo, separador, comando, ...args] = process.argv.slice(2);
if (!archivo || separador !== "--" || !comando) {
  console.error("Uso: node scripts/con-entorno.mjs <archivo .env> -- <comando> [args...]");
  process.exit(2);
}

let variables;
try {
  variables = parse(readFileSync(archivo));
} catch (e) {
  console.error(`No se pudo leer ${archivo}: ${e.message}`);
  process.exit(1);
}

const r = spawnSync(comando, args, { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, ...variables } });
if (r.error) {
  console.error(`No se pudo correr ${comando}: ${r.error.message}`);
  process.exit(1);
}
process.exit(r.status ?? 1);
