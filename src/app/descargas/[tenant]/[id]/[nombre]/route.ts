import type { NextRequest } from "next/server";
import { servirArchivo } from "@/nucleo/archivos";
import { verificarFirma } from "@/nucleo/archivos/firmados";
import { conTenant } from "@/nucleo/db/con-tenant";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const respuesta = (estado: number, texto: string) =>
  new Response(texto, { status: estado, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

// Descarga con link firmado (urlFirmada). Solo en app.<raiz>; sin sesión: la firma es el permiso.
export async function GET(req: NextRequest, { params }: { params: Promise<{ tenant: string; id: string }> }) {
  if (await tenantDelPedido()) return respuesta(404, "No encontrado");
  const { tenant, id } = await params;
  if (!UUID.test(tenant) || !UUID.test(id)) return respuesta(404, "No encontrado");
  const q = req.nextUrl.searchParams;
  const estado = verificarFirma(tenant, id, q.get("vence"), q.get("firma"));
  if (estado === "invalido") return respuesta(404, "No encontrado");
  if (estado === "vencido") return respuesta(410, "Este link venció. Pedile uno nuevo a quien te lo mandó.");
  const banda = await conTenant(tenant, (tx) => tx.tenant.findUnique({ where: { id: tenant }, select: { estado: true } }));
  if (!banda || banda.estado === "ARCHIVADO") return respuesta(404, "No encontrado");
  const r = await servirArchivo(tenant, id, { soloPublicos: false, descargar: true });
  if (r.ok) r.headers.set("Cache-Control", "private, no-store");
  return r;
}
