import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { configPool, OPCIONES_TRANSACCION } from "./config";

// Conexión de la aplicación: rol deoco_app, sujeto a RLS.
// Nunca apuntar DATABASE_URL a un rol dueño de tablas ni a un superusuario.
function crearCliente() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, ...configPool() }),
    transactionOptions: OPCIONES_TRANSACCION,
  });
}

const global_ = globalThis as unknown as { deocoPrisma?: PrismaClient };

function cliente(): PrismaClient {
  // Una sola instancia por proceso (evita abrir pools de más con el hot reload de Next).
  global_.deocoPrisma ??= crearCliente();
  return global_.deocoPrisma;
}

/**
 * Cliente perezoso: se conecta en el primer uso, no al importar. Así `next build`
 * (que carga los módulos para analizar rutas) no necesita la base ni DATABASE_URL.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    const c = cliente();
    const valor = Reflect.get(c, prop, c);
    return typeof valor === "function" ? valor.bind(c) : valor;
  },
});
