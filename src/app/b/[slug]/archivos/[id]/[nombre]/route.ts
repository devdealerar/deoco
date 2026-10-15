import type { NextRequest } from "next/server";
import { accesoPanel } from "@/nucleo/acceso/panel";
import { servirArchivo } from "@/nucleo/archivos";

// Archivos en el panel (vistas previas, borradores): app.deocoartist.com/b/<slug>/archivos/<id>/<nombre>
// Exige sesión y membresía en la banda; sirve también los que todavía no son públicos.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const acceso = await accesoPanel(`/b/${slug}`);
  return servirArchivo(acceso.tenantId, id, {
    soloPublicos: false,
    variante: req.nextUrl.searchParams.get("v"),
    descargar: req.nextUrl.searchParams.has("descargar"),
  });
}
