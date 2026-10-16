import { notFound } from "next/navigation";
import { c } from "@/nucleo/publico/estilo";
import { ConfirmarDatos } from "@/nucleo/publico/legal/formulario-datos";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { MarcoDeLaBanda } from "../../publico";

// El link del mail: el token viaja después de "#" (nunca llega a un servidor ni queda en un log).
export default async function ConfirmarPedido() {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "publico") notFound();
  return (
    <MarcoDeLaBanda tenantId={ctx.tenantId} path="/datos-personales">
      <div className={`flex flex-col gap-4 ${c.texto}`}>
        <h1 className="text-2xl font-bold">Tu pedido sobre tus datos</h1>
        <ConfirmarDatos />
      </div>
    </MarcoDeLaBanda>
  );
}
