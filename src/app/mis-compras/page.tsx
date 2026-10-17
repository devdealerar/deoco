import { notFound } from "next/navigation";
import { c } from "@/nucleo/publico/estilo";
import { emailDelFan, seccionesDelFan } from "@/nucleo/publico/fan";
import { CanjearLinkDelFan, PedirLink, Salir } from "@/nucleo/publico/fan-ui/formulario";
import { tenantDelPedido } from "@/nucleo/tenant/contexto";
import { MarcoDeLaBanda } from "../publico";

// Mis compras (D5): sin cuenta. Con la sesión del link del mail, lo de cada módulo (sus pedidos,
// sus entradas con el QR); sin ella, el formulario para pedir el link. Abierto en todos los estados
// de la banda: lo que el fan ya pagó no se le esconde.
export default async function MisCompras() {
  const ctx = await tenantDelPedido();
  if (ctx?.superficie !== "publico") notFound();
  const email = await emailDelFan(ctx.tenantId);
  const secciones = email ? await seccionesDelFan(ctx.tenantId) : [];
  return (
    <MarcoDeLaBanda tenantId={ctx.tenantId} path="/mis-compras">
      <div className={`flex flex-col gap-8 ${c.texto}`}>
        <h1 className="text-3xl font-black tracking-tight uppercase">Mis compras</h1>
        <CanjearLinkDelFan />
        {email ? (
          <>
            <div className="flex flex-wrap items-center gap-3" data-fan={email}>
              <p className={c.suave}>Entraste como {email}.</p>
              <Salir />
            </div>
            {secciones.map((s) => (
              <section key={s.moduloId} data-seccion-fan={s.moduloId}>
                <s.componente tenantId={ctx.tenantId} email={email} />
              </section>
            ))}
          </>
        ) : (
          <>
            <p className={c.suave}>Tus pedidos y tus entradas, sin cuenta ni contraseña: te mandamos un link a tu mail.</p>
            <PedirLink />
          </>
        )}
      </div>
    </MarcoDeLaBanda>
  );
}
