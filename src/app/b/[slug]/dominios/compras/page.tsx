import Link from "next/link";
import { exigirTitular } from "@/nucleo/acceso/panel";
import { formatearPesos } from "@/nucleo/dinero";
import { DATOS_DEL_TITULAR } from "@/nucleo/dominios/compra";
import type { Contacto } from "@/nucleo/dominios/registrador";
import { type EstadoPaso, seguimientoDeCompras } from "@/nucleo/dominios/seguimiento";
import { ZONA } from "@/nucleo/fechas";
import { Refrescar } from "@/nucleo/publico/refrescar";
import { Aviso, Campo, Formulario, Insignia, Tarjeta } from "@/ui";
import { MarcoPanel } from "../../marco";
import { corregirAccion } from "./acciones";

const COLOR: Record<EstadoPaso, "exito" | "marca" | "gris" | "error"> = { hecho: "exito", "en-curso": "marca", pendiente: "gris", error: "error" };
const FECHA = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: ZONA });

// Tus compras de dominios (D10): en qué está cada compra y renovación. Se arma de la base cada vez,
// así la banda puede cerrar la página (o volver de Mercado Pago) y ver dónde está. Mientras algo
// sigue en curso, la página se refresca sola.
export default async function Compras({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ pago?: string }> }) {
  const { slug } = await params;
  const acceso = await exigirTitular(`/b/${slug}/dominios/compras`);
  const { pago } = await searchParams;
  const items = await seguimientoDeCompras(acceso.tenantId);
  const enCurso = items.some((i) => i.enCurso);
  return (
    <MarcoPanel slug={slug} acceso={acceso}>
      <div className="flex flex-col gap-6">
        <header>
          <Link href={`/b/${slug}/dominios`} className="text-sm font-semibold text-tertiary hover:text-secondary">
            ← Dominios
          </Link>
          <h1 className="mt-2 text-display-xs font-semibold text-primary">Tus compras de dominios</h1>
          <p className="mt-1 text-md text-tertiary">Podés cerrar esta página: sigue sola y te avisamos por mail. Volvé cuando quieras para ver en qué va.</p>
        </header>
        {pago === "no" && <Aviso>El pago no se completó: no se te cobró nada. Podés volver a intentarlo cuando quieras.</Aviso>}
        {items.length === 0 && <Aviso tono="info">Todavía no compraste ni renovaste ningún dominio en Deoco.</Aviso>}
        {items.map((i) => (
          <Tarjeta
            key={i.id}
            titulo={i.dominio}
            data-seguimiento={i.dominio}
            data-en-curso={i.enCurso || undefined}
            junto={<Insignia>{i.tipo === "alta" ? "Compra" : "Renovación"}</Insignia>}
            acciones={i.monto !== null ? <span className="text-sm text-tertiary">{formatearPesos(i.monto)}</span> : undefined}>
            <p className="text-xs text-tertiary">{FECHA.format(i.creadoEn)}</p>
            <ol className="flex flex-wrap gap-2" aria-label="Pasos">
              {i.pasos.map((p) => (
                <li key={p.nombre} data-paso={p.nombre} data-estado={p.estado}>
                  <Insignia color={COLOR[p.estado]}>
                    {p.estado === "hecho" ? "✓ " : p.estado === "error" ? "✕ " : ""}
                    {p.nombre}
                  </Insignia>
                </li>
              ))}
            </ol>
            <div data-mensaje>
              <Aviso tono={i.tono === "exito" ? "info" : i.tono}>{i.mensaje}</Aviso>
            </div>
            {i.corregir && <Corregir slug={slug} {...i.corregir} />}
            {i.tono === "exito" && i.tipo === "alta" && (
              <p className="text-sm text-secondary">
                Lo ves en <Link href={`/b/${slug}/dominios`} className="font-semibold underline">Dominios</Link>. ¿Querés mails desde @{i.dominio}? Configuralo en{" "}
                <Link href={`/b/${slug}/correo`} className="font-semibold underline">Correo</Link>.
              </p>
            )}
          </Tarjeta>
        ))}
        {enCurso && <Refrescar cadaSegundos={10} />}
      </div>
    </MarcoPanel>
  );
}

function Corregir({ slug, compraId, campo, contacto: c }: { slug: string; compraId: string; campo: string | null; contacto: Contacto }) {
  const cual = campo && campo in DATOS_DEL_TITULAR ? DATOS_DEL_TITULAR[campo as keyof Contacto] : null;
  const ayuda = (k: keyof Contacto) => (k === campo ? "Este es el dato que rechazó el registrador." : undefined);
  return (
    <div data-corregir className="flex flex-col gap-3">
      <p className="text-sm text-secondary">
        {cual ? `Revisá ${cual}.` : "Revisá los datos."} Ya pagaste: en cuanto lo corrijas seguimos con el registro. Si no se corrige en 7 días, te devolvemos el pago.
      </p>
      <Formulario puedeEditar accion={corregirAccion.bind(null, slug, compraId)} etiqueta="Corregir y seguir">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo name="nombre" etiqueta="Nombre" defaultValue={c.nombre} required ayuda={ayuda("nombre")} />
          <Campo name="apellido" etiqueta="Apellido" defaultValue={c.apellido} required ayuda={ayuda("apellido")} />
          <Campo name="email" type="email" etiqueta="Email" defaultValue={c.email} required ayuda={ayuda("email")} />
          <Campo name="telefono" etiqueta="Teléfono" defaultValue={c.telefono} required ayuda={ayuda("telefono") ?? "Con código de área."} />
          <Campo name="direccion" etiqueta="Dirección" defaultValue={c.direccion} required ayuda={ayuda("direccion")} />
          <Campo name="ciudad" etiqueta="Ciudad" defaultValue={c.ciudad} required ayuda={ayuda("ciudad")} />
          <Campo name="provincia" etiqueta="Provincia" defaultValue={c.provincia} required ayuda={ayuda("provincia")} />
          <Campo name="codigoPostal" etiqueta="Código postal" defaultValue={c.codigoPostal} required ayuda={ayuda("codigoPostal")} />
          <Campo name="pais" etiqueta="País (código de dos letras)" defaultValue={c.pais} required ayuda={ayuda("pais")} />
        </div>
      </Formulario>
    </div>
  );
}
