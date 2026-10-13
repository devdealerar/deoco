import type { NextRequest } from "next/server";
import { handlers } from "@/nucleo/auth";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";

// Auth.js solo responde en app.<raiz>. En los hosts de banda (sitio público, anónimo) → 404.
async function soloPlataforma(handler: (req: NextRequest) => Promise<Response>, req: NextRequest) {
  if ((await tenantDelPedido())?.superficie === "sitio") {
    return new Response("No encontrado", { status: 404 });
  }
  return handler(req);
}

export const GET = (req: NextRequest) => soloPlataforma(handlers.GET, req);
export const POST = (req: NextRequest) => soloPlataforma(handlers.POST, req);
