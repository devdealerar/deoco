import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Carga por HTTP contra un build de PRODUCCIÓN (`next build` + `next start` en :3300) sobre la
// base de pruebas. Lento (incluye el build): no corre con `npm test`. `npm run test:carga`.
config({ path: ".env" });
config({ path: ".env.test", override: true });

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    server: { deps: { inline: ["next-auth"] } },
    include: ["tests/carga/**/*.carga.ts"],
    globalSetup: ["tests/carga/servidor.ts"],
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 900_000,
  },
});
