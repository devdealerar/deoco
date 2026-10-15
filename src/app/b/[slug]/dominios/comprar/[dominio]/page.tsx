import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirTitular } from "@/nucleo/acceso/panel";
import { usuarioPropio } from "@/nucleo/acceso/usuario";
import { formatearPesos } from "@/nucleo/dinero";
import { ErrorDominio, normalizarDominio } from "@/nucleo/dominios";
import type { Contacto } from "@/nucleo/dominios/registrador";
import { cotizarDominio, ventaHabilitada } from "@/nucleo/dominios/venta";
import { Aviso, Campo, Casilla, Formulario, Tarjeta } from "@/ui";
import { MarcoPanel } from "../../../marco";
import { titularAccion } from "../acciones";
import { leerBorrador } from "../borrador";

// Comprar un dominio, paso 2: a nombre de quién. Precargado con el titular de la banda (o con lo
// que ya escribió, si vuelve del resumen).
export default async function Titular({ params }: { params: Promise<{ slug: string; dominio: string }> }) {
  const { slug, dominio: crudo } = await params;
  const acceso = await exigirTitular(`/b/${slug}/dominios/comprar`);
  if (!ventaHabilitada()) notFound();
  let dominio: string;
  try {
    dominio = normalizarDominio(decodeURIComponent(crudo));
  } catch {
    notFound();
  }
  const volver = (
    <Link href={`/b/${slug}/dominios/comprar?q=${encodeURIComponent(dominio.split(".")[0])}`} className="text-sm font-semibold text-tertiary hover:text-secondary">
      ← Buscar otro
    </Link>
  );
  let precio: number | null = null;
  let error: string | null = null;
  try {
    const c = await cotizarDominio(acceso.tenantId, dominio);
    if (!c.disponible) error = `${dominio} ya no está disponible. Probá con otro.`;
    else if (c.precio === null) error = `Los dominios como ${dominio} no se venden en Deoco.`;
    else precio = c.precio;
  } catch (e) {
    if (!(e instanceof ErrorDominio)) throw e;
    error = e.message;
  }
  const borrador = await leerBorrador(dominio);
  // Precargado con quien está comprando (un titular de la banda).
  const persona = await usuarioPropio(acceso.usuarioId);
  const [nombre, ...apellido] = (persona?.nombre ?? "").split(" ");
  const c: Partial<Contacto> = borrador?.contacto ?? { nombre, apellido: apellido.join(" "), email: persona?.email, pais: "AR" };
  return (
    <MarcoPanel slug={slug} acceso={acceso}>
      <div className="flex flex-col gap-6">
        <header>
          {volver}
          <h1 className="mt-2 text-display-xs font-semibold text-primary">{dominio}</h1>
          {precio !== null && <p className="mt-1 text-md text-tertiary">{formatearPesos(precio)} por año.</p>}
        </header>
        {error ? (
          <Aviso tono="error">{error}</Aviso>
        ) : (
          <Tarjeta titulo="¿A nombre de quién?" descripcion="El dominio queda registrado a este nombre y es suyo: no de Deoco. Estos datos van al registro del dominio y no se usan para nada más.">
            <div data-titular-dominio>
              <Formulario puedeEditar accion={titularAccion.bind(null, slug, dominio)} etiqueta="Seguir">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo name="nombre" etiqueta="Nombre" defaultValue={c.nombre} required />
                  <Campo name="apellido" etiqueta="Apellido" defaultValue={c.apellido} required />
                  <Campo name="email" type="email" etiqueta="Email" defaultValue={c.email} required ayuda="El registrador puede pedir que lo confirmes." />
                  <Campo name="telefono" etiqueta="Teléfono" defaultValue={c.telefono} placeholder="11 4567-8900" required ayuda="Con código de área." />
                  <Campo name="direccion" etiqueta="Dirección" defaultValue={c.direccion} placeholder="Av. Corrientes 1234" required />
                  <Campo name="ciudad" etiqueta="Ciudad" defaultValue={c.ciudad} required />
                  <Campo name="provincia" etiqueta="Provincia" defaultValue={c.provincia} required />
                  <Campo name="codigoPostal" etiqueta="Código postal" defaultValue={c.codigoPostal} required />
                  <Campo name="pais" etiqueta="País (código de dos letras)" defaultValue={c.pais ?? "AR"} required ayuda="AR para Argentina." />
                </div>
                <Casilla name="hacerPrincipal" etiqueta="Usarlo como dominio principal del sitio cuando esté listo" marcada={borrador?.hacerPrincipal ?? true} />
              </Formulario>
            </div>
          </Tarjeta>
        )}
      </div>
    </MarcoPanel>
  );
}
