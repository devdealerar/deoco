import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Punta a punta: next dev real (base de .env.test) + Chromium. Ver tests/e2e/servidor.ts.
config({ path: ".env" });
config({ path: ".env.test", override: true });

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    // next-auth importa "next/server" sin extensión; que lo resuelva Vite.
    server: { deps: { inline: ["next-auth"] } },
    include: ["tests/e2e/**/*.e2e.ts"],
    globalSetup: ["tests/e2e/servidor.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
