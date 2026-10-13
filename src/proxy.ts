import { NextResponse, type NextRequest } from "next/server";
import { CABECERA, PREFIJO_CABECERAS } from "@/nucleo/tenant/cabeceras";
import { esHostPlataforma, normalizarHost } from "@/nucleo/tenant/hosts";
import { decidirPorEstado, rutaPanelBanda, type Superficie } from "@/nucleo/tenant/reglas";
import {
  resolverTenantPorHost,
  resolverTenantPorSlug,
  type TenantResuelto,
} from "@/nucleo/tenant/resolver";

const noEncontrado = () => new NextResponse("No encontrado", { status: 404 });
const prohibido = () => new NextResponse("Prohibido", { status: 403 });

/**
 * Resolución de tenant, dos caminos:
 *   1. app.<raiz>/b/<slug>/...  → panel de la banda, por slug.
 *      app.<raiz> sin /b/<slug> → plataforma, sin tenant (selector, login).
 *   2. cualquier otro host      → sitio público de la banda, por host (anónimo).
 * Las reglas de estado se aplican igual en los dos.
 * La membresía del usuario NO se chequea acá: la resuelve el panel con la sesión.
 */
export async function proxy(request: NextRequest) {
  // Nadie de afuera puede inyectar el contexto de tenant.
  const cabeceras = new Headers(request.headers);
  for (const k of [...cabeceras.keys()]) {
    if (k.startsWith(PREFIJO_CABECERAS)) cabeceras.delete(k);
  }
  const seguir = () => NextResponse.next({ request: { headers: cabeceras } });

  const host = normalizarHost(request.headers.get("host"));
  let tenant: TenantResuelto | null;
  let superficie: Superficie;
  let esPago = false;

  if (esHostPlataforma(host)) {
    const ruta = rutaPanelBanda(request.nextUrl.pathname);
    if (!ruta) return seguir();
    tenant = await resolverTenantPorSlug(ruta.slug);
    superficie = "panel";
    esPago = ruta.esPago;
  } else {
    tenant = await resolverTenantPorHost(host);
    superficie = "publico";
  }
  if (!tenant) return noEncontrado();

  const decision = decidirPorEstado(tenant.estado, superficie, esPago);
  if (decision.tipo === "no-encontrado") return noEncontrado();
  if (decision.tipo === "prohibido") return prohibido();

  // Un solo dominio canónico: los demás de la banda (el subdominio, otros propios)
  // redirigen al principal, con la misma ruta. Temporal (307): si la banda cambia de
  // principal, los navegadores no quedan con la redirección vieja guardada.
  if (superficie === "publico" && tenant.principal && tenant.principal !== host) {
    return NextResponse.redirect(urlEnPrincipal(request, tenant.principal), 307);
  }

  cabeceras.set(CABECERA.tenantId, tenant.id);
  cabeceras.set(CABECERA.estado, tenant.estado);
  cabeceras.set(CABECERA.superficie, superficie);
  if (decision.soloTitular) cabeceras.set(CABECERA.soloTitular, "1");
  return seguir();
}

/** Misma ruta y consulta en el dominio principal; conserva protocolo y puerto del pedido. */
function urlEnPrincipal(request: NextRequest, principal: string): URL {
  const puerto = /:(\d+)$/.exec(request.headers.get("host") ?? "")?.[1];
  const protocolo = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || request.nextUrl.protocol.replace(":", "");
  const destino = new URL(`${protocolo}://${principal}${puerto ? `:${puerto}` : ""}`);
  destino.pathname = request.nextUrl.pathname;
  destino.search = request.nextUrl.search;
  return destino;
}

export const config = {
  // Todo menos estáticos internos de Next.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
