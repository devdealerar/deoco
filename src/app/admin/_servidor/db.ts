// CONEXIÓN DE ADMINISTRACIÓN (rol deoco_admin, BYPASSRLS): ve y escribe datos de todas
// las bandas. Solo se usa desde src/app/admin. tests/admin.test.ts falla si cualquier otro
// archivo (núcleo, módulos, otras rutas) importa este módulo.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const global_ = globalThis as unknown as { deocoPrismaAdmin?: PrismaClient };

/** Cliente de administración. Perezoso: se conecta en el primer uso. */
export function dbAdmin(): PrismaClient {
  if (!global_.deocoPrismaAdmin) {
    const url = process.env.DATABASE_URL_ADMIN;
    if (!url) throw new Error("Falta DATABASE_URL_ADMIN");
    global_.deocoPrismaAdmin = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  }
  return global_.deocoPrismaAdmin;
}

export type TxAdmin = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
