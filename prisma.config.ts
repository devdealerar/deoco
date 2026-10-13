import "dotenv/config";
import { defineConfig } from "prisma/config";

// Las migraciones corren con el rol dueño de las tablas (DATABASE_URL_MIGRACIONES).
// La aplicación NUNCA usa ese rol: se conecta con DATABASE_URL (rol deoco_app, sujeto a RLS).
// Sin la variable (p. ej. al construir la imagen Docker) `prisma generate` funciona igual;
// los comandos de migración fallan pidiendo la conexión.
const url = process.env.DATABASE_URL_MIGRACIONES;

export default defineConfig({
  schema: "prisma/schema", // carpeta: nucleo.prisma + modulos/<id>.prisma (generados)
  migrations: { path: "prisma/migrations" },
  ...(url ? { datasource: { url } } : {}),
});
