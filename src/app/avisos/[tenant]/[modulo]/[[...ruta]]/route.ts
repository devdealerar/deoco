import { atenderAviso } from "@/nucleo/avisos";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";

type Contexto = { params: Promise<{ tenant: string; modulo: string; ruta?: string[] }> };

// Avisos externos de los módulos (webhooks). Solo en app.<raiz>: en el host de una banda,
// /avisos es del sitio público y no existe.
async function atender(request: Request, { params }: Contexto) {
  if (await tenantDelPedido()) return new Response("No encontrado", { status: 404 });
  const { tenant, modulo, ruta = [] } = await params;
  return atenderAviso(request, { tenantId: tenant, moduloId: modulo, path: "/" + ruta.map(decodeURIComponent).join("/") });
}

export const GET = atender;
export const POST = atender;
