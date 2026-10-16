import { notFound } from "next/navigation";
import { c } from "@/nucleo/publico/estilo";
import { FormularioDatos } from "@/nucleo/publico/legal/formulario-datos";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { MarcoDeLaBanda } from "../publico";

// Botón de arrepentimiento (Ley 24.240 art. 34; docs/privacidad.md §13): sin cuenta, sin trámite.
// La banda lo recibe en su panel (como un pedido) y el fan, la confirmación con un código.
export default async function Arrepentimiento() {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "publico") notFound();
  return (
    <MarcoDeLaBanda tenantId={ctx.tenantId} path="/arrepentimiento">
      <div className={`flex flex-col gap-4 ${c.texto}`}>
        <h1 className="text-2xl font-bold">Botón de arrepentimiento</h1>
        <p className="text-sm">
          Podés revocar una compra dentro de los 10 días corridos desde que la hiciste o recibiste el producto, sin dar motivos. Completá tu email y la
          compra; te mandamos un mail para confirmar y la banda te responde con un código.
        </p>
        <FormularioDatos tipo="arrepentimiento" />
      </div>
    </MarcoDeLaBanda>
  );
}
