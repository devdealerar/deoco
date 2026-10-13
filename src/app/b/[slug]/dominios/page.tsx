import { exigirTitular } from "@/nucleo/acceso/panel";
import { dominiosDeBanda } from "@/nucleo/dominios";
import { ListaDominios } from "../../../_dominios/lista";
import { MarcoPanel } from "../marco";
import { agregarAccion, principalAccion, quitarAccion, verificarAccion } from "./acciones";

// Dominios de la banda. Lo define el núcleo (no es de ningún módulo). Solo el titular.
export default async function Dominios({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const acceso = await exigirTitular(`/b/${slug}/dominios`);
  return (
    <MarcoPanel slug={slug} acceso={acceso}>
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-display-xs font-semibold text-primary">Dominios</h1>
          <p className="mt-1 text-md text-tertiary">
            El subdominio de Deoco anda siempre. Un dominio propio muestra el sitio cuando está verificado.
          </p>
        </header>
        <ListaDominios
          dominios={await dominiosDeBanda(acceso.tenantId)}
          verificar={(d) => verificarAccion.bind(null, slug, d)}
          principal={(d) => principalAccion.bind(null, slug, d)}
          quitar={(d) => quitarAccion.bind(null, slug, d)}
          agregar={agregarAccion.bind(null, slug)}
        />
      </div>
    </MarcoPanel>
  );
}
