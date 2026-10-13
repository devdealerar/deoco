import Link from "next/link";
import { formatearBytes, usoAlmacenamiento } from "@/nucleo/archivos";
import { conTenant } from "@/nucleo/db/con-tenant";
import type { PropsRutaPanel } from "@/nucleo/modulos/contrato";
import { Formulario, Insignia, Tarjeta } from "@/ui";
import { publicar } from "../acciones";
import { hayCambios, leerBorrador, leerPublicado } from "../contenido";
import { Encabezado, puedeEditar as puedeEditarEn } from "./comun";

const FECHA = new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

export async function Resumen({ tenantId, slug }: PropsRutaPanel) {
  const [borrador, publicado, uso, dominio, puedeEditar] = await Promise.all([
    conTenant(tenantId, (tx) => leerBorrador(tx, tenantId)),
    leerPublicado(tenantId),
    usoAlmacenamiento(tenantId),
    conTenant(tenantId, (tx) => tx.dominio.findFirst({ orderBy: { esPrincipal: "desc" }, select: { dominio: true } })),
    puedeEditarEn(slug),
  ]);
  const cambios = hayCambios(borrador, publicado?.contenido ?? null);
  const porcentaje = Math.min(100, Math.round((Number(uso.usado) / Number(uso.limite)) * 100));

  return (
    <div className="flex flex-col gap-6">
      <Encabezado slug={slug} actual="" puedeEditar={puedeEditar} />

      <Tarjeta titulo="Publicación" descripcion="El sitio muestra lo último que publicaste. Lo que editás queda en borrador.">
        <div className="flex flex-wrap items-center gap-2" data-testid="estado-publicacion">
          {publicado ? (
            <Insignia color="marca">Publicado el {FECHA.format(publicado.publicadoEn)}</Insignia>
          ) : (
            <Insignia>Nunca publicado</Insignia>
          )}
          {cambios ? (
            <Insignia color="advertencia">Hay cambios sin publicar</Insignia>
          ) : (
            <Insignia color="exito">El sitio está al día</Insignia>
          )}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <Formulario accion={publicar.bind(null, slug)} puedeEditar={puedeEditar} etiqueta="Publicar cambios" />
          <Link href={`/b/${slug}/sitio/vista-previa`} className="text-sm font-semibold text-brand-secondary">
            Ver vista previa del borrador
          </Link>
          {dominio && publicado && (
            <a
              href={`${process.env.NODE_ENV === "production" ? "https" : "http"}://${dominio.dominio}${process.env.NODE_ENV === "production" ? "" : ":3000"}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-brand-secondary"
            >
              Ver sitio publicado ↗
            </a>
          )}
        </div>
      </Tarjeta>

      <Tarjeta titulo="Espacio para archivos">
        <p className="text-sm text-secondary">
          Usás {formatearBytes(uso.usado)} de {formatearBytes(uso.limite)}.
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-brand-solid" style={{ width: `${porcentaje}%` }} />
        </div>
      </Tarjeta>
    </div>
  );
}
