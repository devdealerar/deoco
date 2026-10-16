import { afterAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/salud/route";
import { prisma } from "@/nucleo/db/cliente";

// La salud para el monitoreo externo: 200 con base y archivos bien; 503 si algo no anda. Sin detalles.
afterAll(() => prisma.$disconnect());

describe("/api/salud", () => {
  it("200 con la base y el volumen de archivos; 503 si el volumen no se puede escribir", async () => {
    const r = await GET();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, base: true, archivos: true });
    const antes = process.env.DEOCO_ARCHIVOS_DIR;
    process.env.DEOCO_ARCHIVOS_DIR = "/no/existe";
    try {
      const mal = await GET();
      expect(mal.status).toBe(503);
      expect(await mal.json()).toEqual({ ok: false, base: true, archivos: false });
    } finally {
      process.env.DEOCO_ARCHIVOS_DIR = antes;
    }
  });
});
