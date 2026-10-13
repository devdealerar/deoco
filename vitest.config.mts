import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Las pruebas usan su propia base (.env.test pisa a .env) y la vacían en cada archivo.
config({ path: ".env" });
config({ path: ".env.test", override: true });

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    // next-auth importa "next/server" sin extensión; que lo resuelva Vite.
    server: { deps: { inline: ["next-auth"] } },
    include: ["tests/**/*.test.ts"],
    // Las pruebas comparten una base real: corren en serie.
    fileParallelism: false,
  },
});
