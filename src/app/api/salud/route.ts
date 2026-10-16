import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/nucleo/db/cliente";

// Salud de la app para el monitoreo externo (docs/copias-y-monitoreo.md): responde 200 si la app
// atiende, la base contesta y el volumen de archivos se puede escribir; si no, 503. No dice nada
// más (ni versiones ni errores): es pública.
export const dynamic = "force-dynamic";

const conTiempo = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error("tiempo")), ms))]);

export async function GET() {
  const [base, archivos] = await Promise.all([
    conTiempo(prisma.$queryRaw`SELECT 1`, 3000).then(() => true, () => false),
    access(path.resolve(/*turbopackIgnore: true*/ process.env.DEOCO_ARCHIVOS_DIR ?? ".archivos"), constants.W_OK).then(() => true, () => false),
  ]);
  const ok = base && archivos;
  return Response.json({ ok, base, archivos }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
