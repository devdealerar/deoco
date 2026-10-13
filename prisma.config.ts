import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Las migraciones corren con el rol dueño de las tablas (DATABASE_URL_MIGRACIONES).
// La aplicación NUNCA usa ese rol: se conecta con DATABASE_URL (rol deoco_app, sujeto a RLS).
export default defineConfig({
  schema: "prisma/schema", // carpeta: nucleo.prisma + modulos/<id>.prisma (generados),
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL_MIGRACIONES") },
});
