import type { NextRequest } from "next/server";
import { accesoPanel } from "@/nucleo/acceso/panel";
import { servirArchivo } from "@/nucleo/archivos";
import { accesoAlArchivo } from "@/nucleo/archivos/permiso";

// Archivos en el panel (vistas previas, borradores): app.deocoartist.com/b/<slug>/archivos/<id>/<nombre>
// Exige sesión, membresía en la banda y el permiso del recurso del archivo (tener el id no
// alcanza); sirve también los que todavía no son públicos.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const acceso = await accesoPanel(`/b/${slug}`);
  const permiso = await accesoAlArchivo(acceso, id);
  if (permiso === "no-existe") return new Response("No encontrado", { status: 404 });
  if (permiso === "prohibido") return new Response("Prohibido", { status: 403 });
  return servirArchivo(acceso.tenantId, id, {
    soloPublicos: false,
    variante: req.nextUrl.searchParams.get("v"),
    descargar: req.nextUrl.searchParams.has("descargar"),
  });
}
