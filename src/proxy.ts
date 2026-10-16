import { NextResponse, type NextRequest } from "next/server";
import { CABECERA, PREFIJO_CABECERAS } from "@/nucleo/tenant/cabeceras";
import { esDominioDePlataforma, esHostPlataforma, normalizarHost, subdominioDe } from "@/nucleo/tenant/hosts";
import { decidirPorEstado, type RutaPanel, rutaPanelBanda, rutaPublicaDeModulo, type Superficie } from "@/nucleo/tenant/reglas";
import {
  resolverTenantPorHost,
  resolverTenantPorSlug,
  type TenantResuelto,
} from "@/nucleo/tenant/resolver";

const noEncontrado = () => new NextResponse("No encontrado", { status: 404 });

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
  let subruta: RutaPanel["subruta"] = null;
  let resto: string | null = null;

  if (esHostPlataforma(host)) {
    const ruta = rutaPanelBanda(request.nextUrl.pathname);
    if (!ruta) return seguir();
    tenant = await resolverTenantPorSlug(ruta.slug);
    superficie = "panel";
    subruta = ruta.subruta;
    resto = ruta.resto;
  } else {
    tenant = await resolverTenantPorHost(host);
    superficie = "publico";
    subruta = rutaPublicaDeModulo(request.nextUrl.pathname);
  }
  if (!tenant) return noEncontrado();

  const decision = decidirPorEstado(tenant.estado, superficie, subruta);
  if (decision.tipo === "no-encontrado") return noEncontrado();

  // Un solo dominio canónico: los demás de la banda (el subdominio, otros propios)
  // redirigen al principal, con la misma ruta. Temporal (307): si la banda cambia de
  // principal, los navegadores no quedan con la redirección vieja guardada.
  // Con la banda cerrada no se redirige: el sitio no está publicado (sus dominios pueden estar yéndose).
  if (superficie === "publico" && !decision.bandaCerrada) {
    // Plan sin dominio propio (3.2 núcleo d6): el dominio propio deja de servirse y vuelve el
    // subdominio (el dominio sigue siendo de la banda).
    if (tenant.dominiosPropios === false) {
      if (!esDominioDePlataforma(host)) return NextResponse.redirect(urlEnPrincipal(request, subdominioDe(tenant.slug)), 307);
    } else if (tenant.principal && tenant.principal !== host) {
      return NextResponse.redirect(urlEnPrincipal(request, tenant.principal), 307);
    }
  }

  cabeceras.set(CABECERA.tenantId, tenant.id);
  cabeceras.set(CABECERA.estado, tenant.estado);
  cabeceras.set(CABECERA.superficie, superficie);
  if (decision.soloTitular) cabeceras.set(CABECERA.soloTitular, "1");
  if (decision.bandaCerrada) {
    cabeceras.set(CABECERA.bandaCerrada, "1");
    if (resto) cabeceras.set(CABECERA.rutaPanel, resto);
  }
  if (decision.soloLectura) cabeceras.set(CABECERA.soloLectura, "1");
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
