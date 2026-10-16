import { TERMINOS_DEOCO } from "@/nucleo/legal/textos";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { LegalDeLaBanda } from "../_legal/banda";
import { DocumentoDeDeoco } from "../_legal/plataforma";

// En el sitio de una banda: su términos y condiciones. En la plataforma: el documento de Deoco.
export default async function Pagina() {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie === "publico") return <LegalDeLaBanda tipo="terminos" path="/terminos" />;
  return <DocumentoDeDeoco doc={TERMINOS_DEOCO} />;
}
