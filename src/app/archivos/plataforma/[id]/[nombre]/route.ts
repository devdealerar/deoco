import type { NextRequest } from "next/server";
import { servirArchivoPlataforma } from "@/nucleo/archivos/plataforma";

// Archivos de la plataforma (fotos del catálogo base): públicos, en cualquier host.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return servirArchivoPlataforma(id, { variante: req.nextUrl.searchParams.get("v") });
}
