// Datos de desarrollo: dos bandas en *.lvh.me. Usa el rol dueño (alta de bandas
// es tarea del back office, no de la app). Uso: npm run db:semilla
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_MIGRACIONES! }),
});
const raiz = process.env.DEOCO_DOMINIO_RAIZ ?? "lvh.me";

async function main() {
  for (const slug of ["banda-a", "banda-b"]) {
    const dominio = `${slug}.${raiz}`;
    const tenant = await db.tenant.upsert({
      where: { slug },
      update: {},
      create: { nombre: slug, slug },
    });
    await db.dominio.upsert({
      where: { tenantId_dominio: { tenantId: tenant.id, dominio } },
      update: {},
      create: { dominio, tenantId: tenant.id, esPrincipal: true, verificado: true },
    });
    console.log(`✓ ${dominio}`);
  }
}

main().finally(() => db.$disconnect());
