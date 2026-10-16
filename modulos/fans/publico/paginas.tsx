import { conTenant } from "@/nucleo/db/con-tenant";
import type { PropsRutaPublica } from "@/nucleo/modulos/contrato";
import { AvisoDeDatos } from "@/nucleo/publico/legal/pie";
import { c } from "@/nucleo/publico/estilo";
import { textoConsentimiento } from "../contactos";
import { bajaAccion, confirmarAccion } from "./acciones";
import { CanjeDeLink, FormularioNovedades } from "./formulario";

function Pagina({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className={`mx-auto flex max-w-3xl flex-col gap-6 px-5 py-12 ${c.texto}`}>
      <h1 className="text-3xl font-black tracking-tight uppercase">{titulo}</h1>
      {children}
    </div>
  );
}

const nombreDeBanda = (tenantId: string) => conTenant(tenantId, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { nombre: true } })).then((b) => b.nombre);

/** /novedades: suscribirse al newsletter de la banda. */
export async function NovedadesPublica({ tenantId }: PropsRutaPublica) {
  const banda = await nombreDeBanda(tenantId);
  return (
    <Pagina titulo="Novedades">
      <p className={c.suave}>Shows, lanzamientos y merch de {banda}, directo a tu mail. Sin spam: te podés dar de baja con un clic desde cualquier mail.</p>
      <FormularioNovedades consentimiento={textoConsentimiento(banda)} />
      <AvisoDeDatos tenantId={tenantId} />
    </Pagina>
  );
}

/** /novedades/confirmar#<token>: el link del mail de confirmación. */
export async function ConfirmarPublica(_: PropsRutaPublica) {
  return (
    <Pagina titulo="Novedades">
      <CanjeDeLink
        canjear={confirmarAccion}
        prueba="confirmar"
        bien="¡Listo! Ya estás suscripto: te van a llegar las novedades."
        mal="Este link ya no sirve (venció o ya se usó). Si querés suscribirte, pedilo de nuevo desde Novedades."
      />
    </Pagina>
  );
}

/** /novedades/baja#<token>: la baja en un clic (el link de cada mail). */
export async function BajaPublica({ consulta }: PropsRutaPublica) {
  const entrega = consulta.get("e");
  return (
    <Pagina titulo="Novedades">
      <CanjeDeLink
        canjear={bajaAccion.bind(null, entrega && /^[0-9a-f-]{36}$/.test(entrega) ? entrega : null)}
        prueba="baja"
        bien="Listo: te diste de baja. No te llegan más mails de novedades."
        mal="Este link no es válido. Si te siguen llegando mails, respondé uno y la banda te da de baja."
      />
    </Pagina>
  );
}
