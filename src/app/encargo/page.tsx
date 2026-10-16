import { notFound } from "next/navigation";
import { ENCARGO_TRATAMIENTO } from "@/nucleo/legal/textos";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { DocumentoDeDeoco } from "../_legal/plataforma";

// El contrato de encargo de tratamiento entre Deoco y cada banda (solo en la plataforma).
export default async function Encargo() {
  if ((await tenantDelPedido())?.superficie === "publico") notFound();
  return <DocumentoDeDeoco doc={ENCARGO_TRATAMIENTO} />;
}
