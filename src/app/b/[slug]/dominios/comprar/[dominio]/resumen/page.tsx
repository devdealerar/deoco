import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { exigirTitular } from "@/nucleo/acceso/panel";
import { formatearPesos } from "@/nucleo/dinero";
import { ErrorDominio, normalizarDominio } from "@/nucleo/dominios";
import { condicionesDe, cotizarDominio, ventaHabilitada } from "@/nucleo/dominios/venta";
import { ZONA } from "@/nucleo/fechas";
import { Aviso, Casilla, Formulario, Tarjeta } from "@/ui";
import { MarcoPanel } from "../../../../marco";
import { pagarAccion } from "../../acciones";
import { Privacidad } from "../../privacidad";
import { leerBorrador } from "../../borrador";

/** Lo que cuesta irse, dicho ANTES de comprar (docs/diseno-dominios.md §2). */
const COSTO_DE_SALIDA =
  "Si un día te lo querés llevar, Deoco no cobra nada: te damos el código de transferencia desde el panel. El registrador nuevo te cobra la transferencia (suele incluir un año más de renovación).";

// Comprar un dominio, paso 3: resumen y pago. Precio, vencimiento, titular, lo que cuesta irse y
// las condiciones del registrador; "Pagar con Mercado Pago" (cuenta de Deoco, solo medios inmediatos).
export default async function Resumen({ params }: { params: Promise<{ slug: string; dominio: string }> }) {
  const { slug, dominio: crudo } = await params;
  const acceso = await exigirTitular(`/b/${slug}/dominios/comprar`);
  if (!ventaHabilitada()) notFound();
  let dominio: string;
  try {
    dominio = normalizarDominio(decodeURIComponent(crudo));
  } catch {
    notFound();
  }
  const titularUrl = `/b/${slug}/dominios/comprar/${encodeURIComponent(dominio)}`;
  const b = await leerBorrador(dominio);
  if (!b) redirect(titularUrl);
  let precio: number | null = null;
  let privacidad = false;
  let error: string | null = null;
  try {
    const c = await cotizarDominio(acceso.tenantId, dominio);
    if (!c.disponible) error = `${dominio} ya no está disponible. Probá con otro.`;
    else if (c.precio === null) error = `Los dominios como ${dominio} no se venden en Deoco.`;
    else {
      precio = c.precio;
      privacidad = c.privacidad;
    }
  } catch (e) {
    if (!(e instanceof ErrorDominio)) throw e;
    error = e.message;
  }
  const condiciones = error ? [] : await condicionesDe(dominio);
  const vence = new Date();
  vence.setFullYear(vence.getFullYear() + 1);
  const t = b.contacto;
  return (
    <MarcoPanel slug={slug} acceso={acceso}>
      <div className="flex flex-col gap-6">
        <header>
          <Link href={titularUrl} className="text-sm font-semibold text-tertiary hover:text-secondary">
            ← Cambiar los datos del titular
          </Link>
          <h1 className="mt-2 text-display-xs font-semibold text-primary">Resumen y pago</h1>
        </header>
        {error ? (
          <Aviso tono="error">{error}</Aviso>
        ) : (
          <>
            <Tarjeta titulo={dominio} acciones={<span className="text-lg font-semibold text-primary">{formatearPesos(precio!)}</span>}>
              <dl className="grid gap-3 text-sm sm:grid-cols-[12rem_1fr]" data-resumen-compra>
                <dt className="text-tertiary">Por</dt>
                <dd className="text-primary">1 año</dd>
                <dt className="text-tertiary">Vence</dt>
                <dd className="text-primary">
                  El {vence.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: ZONA })}. Te avisamos antes para renovarlo; Deoco nunca lo renueva sin que pagues.
                </dd>
                <dt className="text-tertiary">A nombre de</dt>
                <dd className="text-primary">
                  {t.nombre} {t.apellido} · {t.email}
                </dd>
                <dt className="text-tertiary">Privacidad</dt>
                <dd className="text-primary">{privacidad ? "Incluida: los datos del titular no aparecen en el WHOIS." : "No disponible en esta terminación: los datos del titular quedan públicos en el WHOIS."}</dd>
                <dt className="text-tertiary">Principal</dt>
                <dd className="text-primary">{b.hacerPrincipal ? "Sí: cuando esté listo, el sitio pasa a este dominio y el subdominio de Deoco redirige acá." : "No: lo elegís cuando quieras."}</dd>
              </dl>
            </Tarjeta>
            {!privacidad && <Privacidad dominio={dominio} incluida={false} />}
            <div data-costo-salida>
              <Aviso tono="info" titulo="Llevártelo cuando quieras">
                {COSTO_DE_SALIDA} También podés dejarlo registrado acá y llevarte solo el DNS, sin costo.
              </Aviso>
            </div>
            <Tarjeta titulo="Condiciones" descripcion="Para registrarlo hay que aceptar las del registrador (GoDaddy, del que Deoco es revendedor). Si la cuota de Deoco queda impaga, tu dominio no se toca.">
              <ul className="mb-4 flex flex-col gap-1 text-sm">
                {condiciones.map((c) => (
                  <li key={c.clave}>
                    <a href={c.url} target="_blank" rel="noreferrer" className="font-semibold underline">
                      {c.titulo}
                    </a>
                  </li>
                ))}
              </ul>
              <div data-pagar-dominio>
                <Formulario puedeEditar accion={pagarAccion.bind(null, slug, dominio)} etiqueta="Pagar con Mercado Pago">
                  {condiciones.map((c) => (
                    <Casilla key={c.clave} name={`acepto_${c.clave}`} etiqueta={`Acepto: ${c.titulo}`} />
                  ))}
                  <p className="text-xs text-tertiary">
                    Se paga con tarjeta o dinero en Mercado Pago, en el momento (sin efectivo ni transferencia: un pago que tarda días dejaría el dominio sin reservar). Si
                    algo sale mal y no se puede registrar, te devolvemos todo solos.
                  </p>
                </Formulario>
              </div>
            </Tarjeta>
          </>
        )}
      </div>
    </MarcoPanel>
  );
}
