import { NextResponse, type NextRequest } from "next/server";
import { CABECERA, PREFIJO_CABECERAS } from "@/nucleo/tenant/cabeceras";
import { esHostPlataforma, normalizarHost } from "@/nucleo/tenant/hosts";
import { decidirPorEstado } from "@/nucleo/tenant/reglas";
import { resolverTenantPorHost } from "@/nucleo/tenant/resolver";

/** Resolución de tenant por dominio + reglas de estado. Corre en Node (Next 16). */
export async function proxy(request: NextRequest) {
  // Nadie de afuera puede inyectar el contexto de tenant.
  const cabeceras = new Headers(request.headers);
  for (const k of [...cabeceras.keys()]) {
    if (k.startsWith(PREFIJO_CABECERAS)) cabeceras.delete(k);
  }

  const host = normalizarHost(request.headers.get("host"));
  if (esHostPlataforma(host)) {
    return NextResponse.next({ request: { headers: cabeceras } });
  }

  const tenant = await resolverTenantPorHost(host);
  if (!tenant) return new NextResponse("No encontrado", { status: 404 });

  const decision = decidirPorEstado(tenant.estado, request.nextUrl.pathname);
  if (decision.tipo === "no-encontrado") return new NextResponse("No encontrado", { status: 404 });
  if (decision.tipo === "prohibido") return new NextResponse("Prohibido", { status: 403 });

  cabeceras.set(CABECERA.tenantId, tenant.id);
  cabeceras.set(CABECERA.estado, tenant.estado);
  if (decision.soloTitular) cabeceras.set(CABECERA.soloTitular, "1");
  return NextResponse.next({ request: { headers: cabeceras } });
}

export const config = {
  // Todo menos estáticos internos de Next.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
