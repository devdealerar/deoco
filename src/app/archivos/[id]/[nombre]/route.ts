import type { NextRequest } from "next/server";
import { servirArchivo } from "@/nucleo/archivos";
import { CABECERA } from "@/nucleo/tenant/cabeceras";

// Archivos del sitio público: labanda.deocoartist.com/archivos/<id>/<nombre>[?v=web][&descargar=1]
// La banda sale del host (proxy); solo se sirven los archivos públicos de esa banda.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = req.headers.get(CABECERA.tenantId);
  if (!tenantId || req.headers.get(CABECERA.superficie) !== "publico") {
    return new Response("No encontrado", { status: 404 });
  }
  const { id } = await params;
  return servirArchivo(tenantId, id, {
    soloPublicos: true,
    variante: req.nextUrl.searchParams.get("v"),
    descargar: req.nextUrl.searchParams.has("descargar"),
  });
}
