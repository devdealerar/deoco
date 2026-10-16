import Link from "next/link";
import { exigirTitular } from "@/nucleo/acceso/panel";
import { registro } from "@/nucleo/modulos";
import { dominiosDeBanda } from "@/nucleo/dominios";
import { seguimientoDeCompras } from "@/nucleo/dominios/seguimiento";
import { ventaHabilitada } from "@/nucleo/dominios/venta";
import { conTenant } from "@/nucleo/db/con-tenant";
import { Aviso, Boton, Tarjeta } from "@/ui";
import { ListaDominios } from "../../../_dominios/lista";
import { MarcoPanel } from "../marco";
import {
  agregarAccion,
  cambiarTitularAccion,
  delegarAccion,
  fijarVenceAccion,
  llevarseAccion,
  pedirCodigoAccion,
  ponerNameserversAccion,
  principalAccion,
  quedarseAccion,
  quitarAccion,
  renovarAccion,
  verificarAccion,
} from "./acciones";

// Dominios de la banda. Lo define el núcleo (no es de ningún módulo). Solo el titular.
export default async function Dominios({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const acceso = await exigirTitular(`/b/${slug}/dominios`);
  const compras = await seguimientoDeCompras(acceso.tenantId);
  const enCurso = compras.filter((c) => c.enCurso || c.corregir);
  const puedeComprar = ventaHabilitada() && (acceso.estado === "ACTIVO" || acceso.estado === "MOROSO");
  const terminaciones = ventaHabilitada() ? ((await registro().gestor?.gestion.dominios?.terminaciones()) ?? []) : [];
  const conDominioPropio = (await conTenant(acceso.tenantId, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: acceso.tenantId }, select: { dominiosPropios: true } }))).dominiosPropios;
  return (
    <MarcoPanel slug={slug} acceso={acceso}>
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-display-xs font-semibold text-primary">Dominios</h1>
          <p className="mt-1 text-md text-tertiary">
            El subdominio de Deoco anda siempre. Un dominio propio muestra el sitio cuando está verificado.
          </p>
        </header>
        {!conDominioPropio && (
          <Aviso tono="info" titulo="Tu plan no incluye dominio propio" data-testid="sin-dominio-propio">
            Tu sitio se ve en el subdominio de Deoco. Tus dominios siguen siendo tuyos (podés llevártelos), pero no muestran el sitio: quien entra por
            ellos llega al subdominio. Para usarlos, cambiá de plan en Plan y pago.
          </Aviso>
        )}
        {enCurso.length > 0 && (
          <div data-compras-en-curso>
            <Aviso tono={enCurso.some((c) => c.corregir) ? "advertencia" : "info"} titulo={enCurso.length === 1 ? `Tu compra de ${enCurso[0].dominio} está en marcha` : `${enCurso.length} compras en marcha`}>
              {enCurso.some((c) => c.corregir) ? "Falta corregir un dato del titular. " : ""}
              <Link href={`/b/${slug}/dominios/compras`} className="font-semibold underline">
                Ver en qué va
              </Link>
            </Aviso>
          </div>
        )}
        {puedeComprar && (
          <Tarjeta
            titulo="Comprar un dominio"
            descripcion="Lo buscás, lo pagás y Deoco lo configura solo: sitio con y sin www, certificado y correo. Queda a tu nombre y te lo podés llevar cuando quieras."
            acciones={<Boton href={`/b/${slug}/dominios/comprar`}>Buscar un dominio</Boton>}
            data-comprar-dominio
          />
        )}
        {compras.length > enCurso.length && (
          <p className="text-sm text-tertiary">
            <Link href={`/b/${slug}/dominios/compras`} className="font-semibold underline">
              Tus compras y renovaciones
            </Link>
          </p>
        )}
        <ListaDominios
          dominios={await dominiosDeBanda(acceso.tenantId)}
          verificar={(d) => verificarAccion.bind(null, slug, d)}
          principal={(d) => principalAccion.bind(null, slug, d)}
          quitar={(d) => quitarAccion.bind(null, slug, d)}
          agregar={agregarAccion.bind(null, slug)}
          delegar={(d) => delegarAccion.bind(null, slug, d)}
          llevarse={(d) => llevarseAccion.bind(null, slug, d)}
          quedarse={(d) => quedarseAccion.bind(null, slug, d)}
          renovar={(d) => renovarAccion.bind(null, slug, d)}
          pedirCodigo={(d) => pedirCodigoAccion.bind(null, slug, d)}
          ponerNameservers={(d) => ponerNameserversAccion.bind(null, slug, d)}
          cambiarTitular={(d) => cambiarTitularAccion.bind(null, slug, d)}
          fijarVence={(d) => fijarVenceAccion.bind(null, slug, d)}
          precios={Object.fromEntries(terminaciones.map((t) => [t.tld, t.precio]))}
          soloSalida={acceso.estado === "ARCHIVADO"}
        />
      </div>
    </MarcoPanel>
  );
}
