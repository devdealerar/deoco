import { NextResponse, type NextRequest } from "next/server";
import { CABECERA, PREFIJO_CABECERAS } from "@/nucleo/tenant/cabeceras";
import { esHostPlataforma, normalizarHost } from "@/nucleo/tenant/hosts";
import { decidirPorEstado, type RutaPanel, rutaPanelBanda, type Superficie } from "@/nucleo/tenant/reglas";
import {
  resolverTenantPorHost,
  resolverTenantPorSlug,
  type TenantResuelto,
} from "@/nucleo/tenant/resolver";

const noEncontrado = () => new NextResponse("No encontrado", { status: 404 });
// El único 403 del proxy: el panel de una banda SUSPENDIDA (salvo Plan y pago, Dominios y las rutas
// de módulo, que decide accesoPanel y que mandan acá lo que no abren). Una página que
// explica qué pasó y qué hacer, no un "Prohibido" pelado.
const panelSuspendido = (slug: string) =>
  new NextResponse(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Panel suspendido · Deoco</title></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1917;background:#fafaf9;margin:0">
<main style="max-width:480px;margin:15vh auto;padding:0 24px;line-height:1.5">
<h1 style="font-size:22px">El panel de esta banda está en pausa</h1>
<p>La cuota de Deoco está pendiente. El sitio público sigue online y no se borró nada.</p>
<p>Quien es titular de la banda puede regularizarlo en <a href="/b/${encodeURIComponent(slug)}/pago" style="color:#6941c6;font-weight:600">Plan y pago</a>: apenas se acredita el pago, el panel vuelve a funcionar.</p>
<p>Los dominios de la banda siguen siendo suyos: quien es titular puede verlos y llevárselos desde <a href="/b/${encodeURIComponent(slug)}/dominios" style="color:#6941c6;font-weight:600">Dominios</a>.</p>
</main></body></html>`,
    { status: 403, headers: { "content-type": "text/html; charset=utf-8" } },
  );

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
  }
  if (!tenant) return noEncontrado();

  const decision = decidirPorEstado(tenant.estado, superficie, subruta);
  if (decision.tipo === "no-encontrado") return noEncontrado();
  // "prohibido" solo sale del panel (por slug) de una banda suspendida.
  if (decision.tipo === "prohibido") return panelSuspendido(rutaPanelBanda(request.nextUrl.pathname)?.slug ?? "");

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
  if (decision.bandaCerrada && resto) {
    cabeceras.set(CABECERA.bandaCerrada, "1");
    cabeceras.set(CABECERA.rutaPanel, resto);
  }
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
