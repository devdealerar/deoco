import { urlArchivo } from "@/nucleo/archivos";
import { conTenant } from "@/nucleo/db/con-tenant";
import type { PropsRutaPanel } from "@/nucleo/modulos/contrato";
import { leerBorrador } from "../contenido";
import type { Rutas } from "../vista/estilo";
import { Home } from "../vista/home";
import { MarcoBanda } from "../vista/marco";
import { Prensa } from "../vista/prensa";
import { Encabezado, puedeEditar as puedeEditarEn } from "./comun";

/** Vista previa del BORRADOR, autenticada: el mismo renderizador que el sitio público. */
function VistaPrevia(pagina: "home" | "prensa") {
  return async function Pagina({ tenantId, slug }: PropsRutaPanel) {
    const [contenido, puedeEditar] = await Promise.all([conTenant(tenantId, (tx) => leerBorrador(tx, tenantId)), puedeEditarEn(slug)]);
    const base = `/b/${slug}/sitio/vista-previa`;
    const rutas: Rutas = {
      // Los archivos del borrador todavía no son públicos: se piden por la ruta del panel.
      archivo: (ref, o) => urlArchivo(ref, { variante: o?.web && ref.web ? "web" : undefined, descargar: o?.descargar, panelSlug: slug }),
      home: base,
      prensa: `${base}/prensa`,
    };
    const pestanas = [
      { etiqueta: "Home", href: rutas.home },
      { etiqueta: "Press kit", href: rutas.prensa },
    ];
    return (
      <div>
        <Encabezado slug={slug} actual="/vista-previa" puedeEditar={puedeEditar} />
        <div className="overflow-hidden rounded-xl ring-1 ring-secondary" data-testid="vista-previa">
          <MarcoBanda
            contenido={contenido}
            pestanas={pestanas}
            path={pagina === "home" ? rutas.home : rutas.prensa}
            rutas={rutas}
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
