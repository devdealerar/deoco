import { urlArchivo } from "@/nucleo/archivos";
import { conTenant } from "@/nucleo/db/con-tenant";
import type { MetadatosPagina, PropsMarcoPublico, PropsRutaPublica } from "@/nucleo/modulos/contrato";
import { ACENTO_POR_DEFECTO, type ContenidoSitio, leerPublicado, type RefArchivo } from "./contenido";
import type { Rutas } from "./vista/estilo";
import { Home } from "./vista/home";
import { MarcoBanda } from "./vista/marco";
import { Prensa } from "./vista/prensa";

// El sitio público muestra SIEMPRE lo publicado (sitio_publicacion), nunca el borrador.

const rutas: Rutas = {
  archivo: (ref, o) => urlArchivo(ref, { variante: o?.web && ref.web ? "web" : undefined, descargar: o?.descargar }),
  home: "/",
  prensa: "/prensa",
};

async function contenidoVacio(tenantId: string): Promise<ContenidoSitio> {
  const tenant = await conTenant(tenantId, (tx) => tx.tenant.findUnique({ where: { id: tenantId }, select: { nombre: true } }));
  return {
    nombre: tenant?.nombre ?? "",
    identidad: { logo: null, fondo: null, colorFondo: null, colorAcento: ACENTO_POR_DEFECTO, tipografia: "SANS" },
    home: { bioCorta: "", slides: [], fechas: [], links: [] },
    prensa: { bioLarga: "", fotos: [], logos: [], rider: null, contacto: { nombre: "", email: "", telefono: "" } },
  };
}

/** marcoPublico: envuelve todas las páginas públicas (también las de otros módulos). */
export async function MarcoPublicoSitio({ tenantId, pestanas, path, cabecera, children }: PropsMarcoPublico) {
  const contenido = (await leerPublicado(tenantId))?.contenido ?? (await contenidoVacio(tenantId));
  return (
    <MarcoBanda contenido={contenido} pestanas={pestanas} path={path} rutas={rutas} cabecera={cabecera}>
      {children}
    </MarcoBanda>
  );
}

function EnPreparacion() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-24">
      <p className="text-xl text-[var(--texto-suave)]">Estamos preparando el sitio. Volvé pronto.</p>
    </div>
  );
}

export async function HomePublica({ tenantId }: PropsRutaPublica) {
  const publicado = await leerPublicado(tenantId);
  return publicado ? <Home contenido={publicado.contenido} rutas={rutas} /> : <EnPreparacion />;
}

export async function PrensaPublica({ tenantId }: PropsRutaPublica) {
  const publicado = await leerPublicado(tenantId);
  return publicado ? <Prensa contenido={publicado.contenido} rutas={rutas} /> : <EnPreparacion />;
}

// Metadatos (título y vista previa al compartir). Solo de lo publicado.

/** Las redes no muestran SVG ni PDF: solo imágenes, en su versión web si la hay. */
function imagenCompartible(ref: RefArchivo | null | undefined): string | undefined {
  if (!ref || !["jpeg", "png", "webp"].includes(ref.tipo)) return undefined;
  return rutas.archivo(ref, { web: true });
}

const resumen = (texto: string, largo = 200) => (texto.length > largo ? `${texto.slice(0, largo - 1).trimEnd()}…` : texto);

/** Todo el sitio: el nombre de la banda, su bio corta y la imagen de su identidad (fondo o logo). */
export async function metadatosDelSitio(tenantId: string): Promise<MetadatosPagina> {
  const c = (await leerPublicado(tenantId))?.contenido;
  if (!c) return {};
  return {
    titulo: c.nombre,
    descripcion: resumen(c.home.bioCorta),
    imagen: imagenCompartible(c.identidad.fondo) ?? imagenCompartible(c.identidad.logo),
  };
}

export async function metadatosPrensa({ tenantId }: PropsRutaPublica): Promise<MetadatosPagina> {
  const c = (await leerPublicado(tenantId))?.contenido;
  return {
    titulo: "Press kit",
    descripcion: c?.prensa.bioLarga ? resumen(c.prensa.bioLarga) : undefined,
    imagen: c?.prensa.fotos.map((f) => imagenCompartible(f.archivo)).find(Boolean),
  };
}
