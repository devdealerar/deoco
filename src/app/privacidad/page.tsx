import { PRIVACIDAD_DEOCO } from "@/nucleo/legal/textos";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { LegalDeLaBanda } from "../_legal/banda";
import { DocumentoDeDeoco } from "../_legal/plataforma";

// En el sitio de una banda: su política de privacidad. En la plataforma: el documento de Deoco.
export default async function Pagina() {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie === "publico") return <LegalDeLaBanda tipo="privacidad" path="/privacidad" />;
  return <DocumentoDeDeoco doc={PRIVACIDAD_DEOCO} />;
}
