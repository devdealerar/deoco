import { notFound } from "next/navigation";
import { LEYENDA_AAIP } from "@/nucleo/legal/textos";
import { c } from "@/nucleo/publico/estilo";
import { FormularioDatos } from "@/nucleo/publico/legal/formulario-datos";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { MarcoDeLaBanda } from "../publico";

// Tus datos personales (Ley 25.326 arts. 14 y 16; LGPD art. 18): el canal del fan, en el sitio de
// la banda. Abierto en todos los estados de la banda (los plazos legales no se suspenden).
export default async function DatosPersonales() {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "publico") notFound();
  return (
    <MarcoDeLaBanda tenantId={ctx.tenantId} path="/datos-personales">
      <div className={`flex flex-col gap-4 ${c.texto}`}>
        <h1 className="text-2xl font-bold">Tus datos personales</h1>
        <p className="text-sm">
          Podés pedir ver qué datos tiene la banda de vos, que se corrijan, que se borren o que no se usen para comunicaciones. Te mandamos un mail
          para confirmar que el email es tuyo; desde ahí, la banda tiene 10 días corridos para darte acceso y 5 días hábiles para corregir o borrar.
          Lo que la ley obliga a conservar (los comprobantes de una venta) se conserva.
        </p>
        <FormularioDatos />
        <p className={`text-xs ${c.suave}`}>{LEYENDA_AAIP}</p>
      </div>
    </MarcoDeLaBanda>
  );
}
