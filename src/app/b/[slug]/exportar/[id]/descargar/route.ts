import { exigirTitular } from "@/nucleo/acceso/panel";
import { zipDeExportacion } from "@/nucleo/exportacion";

// Bajar la exportación: solo el titular de la banda, con sesión, mientras no venció (7 días).
// Abierto en todos los estados de la banda (td3: la exportación está siempre disponible).
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const acceso = await exigirTitular(`/b/${slug}/exportar`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("No encontrado", { status: 404 });
  const zip = await zipDeExportacion(acceso.tenantId, id);
  if (!zip) return new Response("Esta exportación ya no está disponible: pedí otra desde el panel.", { status: 410 });
  return new Response(zip.flujo, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zip.nombre}"`,
      "Cache-Control": "private, no-store",
      ...(zip.bytes ? { "Content-Length": zip.bytes.toString() } : {}),
    },
  });
}
