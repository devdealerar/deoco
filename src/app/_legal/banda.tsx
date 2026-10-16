import { notFound } from "next/navigation";
import { textoVigente, type TipoLegal } from "@/nucleo/legal";
import { TextoLegal } from "@/nucleo/publico/legal/texto";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { MarcoDeLaBanda } from "../publico";

/** La política o los términos del sitio de la banda: la versión vigente, con su número y fecha. */
export async function LegalDeLaBanda({ tipo, path }: { tipo: TipoLegal; path: string }) {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "publico") notFound();
  const v = await textoVigente(ctx.tenantId, tipo);
  return (
    <MarcoDeLaBanda tenantId={ctx.tenantId} path={path}>
      <TextoLegal contenido={v.contenido} pie={`Versión ${v.version}, del ${v.publicadaEn.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}.`} />
    </MarcoDeLaBanda>
  );
}
