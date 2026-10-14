import { urlArchivo } from "@/nucleo/archivos";
import { conTenant } from "@/nucleo/db/con-tenant";
import type { PropsRutaPanel } from "@/nucleo/modulos/contrato";
import { elementosDelMarco } from "@/nucleo/publico/marco";
import { type ContenidoSitio, leerBorrador } from "../contenido";
import { conFechasVivas } from "../fechas";
import sitio from "../index";
import { origenPublico } from "../origen";
import type { Rutas } from "../vista/estilo";
import { Home } from "../vista/home";
import { MarcoBanda } from "../vista/marco";
import { Prensa } from "../vista/prensa";
import { Encabezado, puedeEditar as puedeEditarEn } from "./comun";

/**
 * Vista previa del BORRADOR, autenticada: el mismo renderizador y lo mismo que arma el sitio
 * público alrededor (pestañas de los módulos prendidos, cabecera, fechas de la ticketera si
 * está prendida). Solo cambia el contenido del sitio: el borrador en vez de lo publicado.
 */
function VistaPrevia(pagina: "home" | "prensa") {
  return async function Pagina({ tenantId, slug }: PropsRutaPanel) {
    const [borrador, puedeEditar, origen] = await Promise.all([
      conTenant(tenantId, (tx) => leerBorrador(tx, tenantId)),
      puedeEditarEn(slug),
      origenPublico(tenantId),
    ]);
    const base = `/b/${slug}/sitio/vista-previa`;
    const rutas: Rutas = {
      // Los archivos del borrador todavía no son públicos: se piden por la ruta del panel.
      archivo: (ref, o) => urlArchivo(ref, { variante: o?.web && ref.web ? "web" : undefined, descargar: o?.descargar, panelSlug: slug }),
      home: base,
      prensa: `${base}/prensa`,
    };
    // Las rutas del sitio público, traducidas: las propias a la vista previa; las de otros módulos
    // (tienda, fechas…), al sitio de verdad (no tienen borrador).
    const propias: Record<string, string> = { "/": rutas.home, "/prensa": rutas.prensa };
    const traducir = (href: string) => propias[href] ?? (href.startsWith("/") && origen ? `${origen}${href}` : href);
    const path = pagina === "home" ? "/" : "/prensa";
    const marco = await elementosDelMarco(tenantId, path);
    const pestanas = marco.pestanas.map((p) => ({ etiqueta: p.etiqueta, href: p.moduloId === sitio.id ? (propias[p.href] ?? p.href) : traducir(p.href) }));
    const vivo = await conFechasVivas(tenantId, borrador);
    const contenido: ContenidoSitio = {
      ...vivo,
      home: { ...vivo.home, fechas: vivo.home.fechas.map((f) => ({ ...f, link: f.link ? traducir(f.link) : null })) },
    };
    return (
      <div>
        <Encabezado slug={slug} actual="/vista-previa" puedeEditar={puedeEditar} />
        <div className="overflow-hidden rounded-xl ring-1 ring-secondary" data-testid="vista-previa">
          <MarcoBanda
            contenido={contenido}
            pestanas={pestanas}
            path={propias[path]}
            rutas={rutas}
            cabecera={marco.cabecera}
            aviso={
              <div className="bg-warning-solid px-4 py-2 text-center text-sm font-semibold text-white">
                Vista previa del borrador. Así se va a ver cuando publiques.
              </div>
            }
          >
            {pagina === "home" ? <Home contenido={contenido} rutas={rutas} /> : <Prensa contenido={contenido} rutas={rutas} />}
          </MarcoBanda>
        </div>
      </div>
    );
  };
}

export const VistaPreviaHome = VistaPrevia("home");
export const VistaPreviaPrensa = VistaPrevia("prensa");
