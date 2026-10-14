import { exigirTitular } from "@/nucleo/acceso/panel";
import { registro } from "@/nucleo/modulos";
import { Aviso } from "@/ui";
import { MarcoPanel } from "../marco";

// Plan y pago de la cuota de Deoco. La ruta es del núcleo (abierta aunque la banda esté
// SUSPENDIDA, solo para el titular; el staff no pasa) y la pantalla la pone el gestor de cuenta.
export default async function Pago({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const acceso = await exigirTitular(`/b/${slug}/pago`);
  const consulta = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) if (x !== undefined) consulta.append(k, x);
  const gestor = registro().gestor;
  return (
    <MarcoPanel slug={slug} acceso={acceso}>
      <div data-testid="estado" data-estado={acceso.estado} hidden>
        {acceso.estado}
      </div>
      {gestor ? (
        await gestor.gestion.pantallaPago({ tenantId: acceso.tenantId, slug, acceso, params: {}, consulta })
      ) : (
        <Aviso tono="info" titulo="Pago de la cuota">
          Todavía no hay planes configurados en Deoco. El staff te avisa cómo pagar.
        </Aviso>
      )}
    </MarcoPanel>
  );
}
