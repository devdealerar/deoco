import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Conexión de la aplicación: rol deoco_app, sujeto a RLS.
// Nunca apuntar DATABASE_URL a un rol dueño de tablas ni a un superusuario.
function crearCliente() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

const global_ = globalThis as unknown as { deocoPrisma?: PrismaClient };

// Una sola instancia por proceso (evita abrir pools de más con el hot reload de Next).
export const prisma = global_.deocoPrisma ?? crearCliente();
if (process.env.NODE_ENV !== "production") global_.deocoPrisma = prisma;
