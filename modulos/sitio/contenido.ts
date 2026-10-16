// Contenido del sitio: la misma forma para el borrador (leído de las tablas) y para
// lo publicado (la foto JSON en sitio_publicacion). Un solo renderizador para los dos.
import { exigirLimite } from "@/nucleo/cuenta";
import { cache } from "react";
import { archivosDelModulo, borrarArchivos, marcarPublicos } from "@/nucleo/archivos";
import { conTenant, type TxTenant } from "@/nucleo/db/con-tenant";

export const MODULO = "sitio";

export type RefArchivo = { id: string; nombre: string; tipo: string; web: boolean };
export type Tipografia = "SANS" | "SERIF" | "MONO";

export type ContenidoSitio = {
  nombre: string;
  identidad: {
    logo: RefArchivo | null;
    fondo: RefArchivo | null;
    colorFondo: string | null;
    colorAcento: string;
    tipografia: Tipografia;
  };
  home: {
    bioCorta: string;
    slides: { imagen: RefArchivo; alt: string }[];
    /** ISO yyyy-mm-dd */
    fechas: { fecha: string; lugar: string; ciudad: string; link: string | null }[];
    links: { tipo: "RED" | "ESCUCHA"; plataforma: string; url: string }[];
  };
  prensa: {
    bioLarga: string;
    fotos: { archivo: RefArchivo; descripcion: string }[];
    logos: { archivo: RefArchivo; descripcion: string }[];
    rider: RefArchivo | null;
    contacto: { nombre: string; email: string; telefono: string };
  };
};

export const ACENTO_POR_DEFECTO = "#6941c6";

/** Lee el borrador (las tablas del módulo) de la banda de la transacción. */
export async function leerBorrador(tx: TxTenant, tenantId: string): Promise<ContenidoSitio> {
  // En serie: una transacción es una sola conexión (pg no admite consultas en paralelo en ella).
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { nombre: true } });
  const perfil = await tx.sitioPerfil.findUnique({ where: { tenantId } });
  const slides = await tx.sitioSlide.findMany({ orderBy: { orden: "asc" } });
  const fechas = await tx.sitioFecha.findMany({ orderBy: { fecha: "asc" } });
  const links = await tx.sitioLink.findMany({ orderBy: { orden: "asc" } });
  const descargables = await tx.sitioDescargable.findMany({ orderBy: { orden: "asc" } });
  const ids = [
    perfil?.logoArchivoId,
    perfil?.fondoArchivoId,
    perfil?.riderArchivoId,
    ...slides.map((s) => s.archivoId),
    ...descargables.map((d) => d.archivoId),
  ].filter((id): id is string => !!id);
  const archivos = new Map(
    (await tx.archivo.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true, tipo: true, variantes: true } })).map(
      (a) => [a.id, { id: a.id, nombre: a.nombre, tipo: a.tipo, web: a.variantes.includes("web") } satisfies RefArchivo],
    ),
  );
  const ref = (id: string | null | undefined) => (id ? (archivos.get(id) ?? null) : null);

  return {
    nombre: tenant?.nombre ?? "",
    identidad: {
      logo: ref(perfil?.logoArchivoId),
      fondo: ref(perfil?.fondoArchivoId),
      colorFondo: perfil?.colorFondo ?? null,
      colorAcento: perfil?.colorAcento ?? ACENTO_POR_DEFECTO,
      tipografia: perfil?.tipografia ?? "SANS",
    },
    home: {
      bioCorta: perfil?.bioCorta ?? "",
      slides: slides.flatMap((s) => (ref(s.archivoId) ? [{ imagen: ref(s.archivoId)!, alt: s.textoAlt }] : [])),
      fechas: fechas.map((f) => ({ fecha: f.fecha.toISOString().slice(0, 10), lugar: f.lugar, ciudad: f.ciudad, link: f.link })),
      links: links.map((l) => ({ tipo: l.tipo, plataforma: l.plataforma, url: l.url })),
    },
    prensa: {
      bioLarga: perfil?.bioLarga ?? "",
      fotos: descargables
        .filter((d) => d.tipo === "FOTO" && ref(d.archivoId))
        .map((d) => ({ archivo: ref(d.archivoId)!, descripcion: d.descripcion })),
      logos: descargables
        .filter((d) => d.tipo === "LOGO" && ref(d.archivoId))
        .map((d) => ({ archivo: ref(d.archivoId)!, descripcion: d.descripcion })),
      rider: ref(perfil?.riderArchivoId),
      contacto: {
        nombre: perfil?.prensaNombre ?? "",
        email: perfil?.prensaEmail ?? "",
        telefono: perfil?.prensaTelefono ?? "",
      },
    },
  };
}

/** Ids de todos los archivos que usa un contenido. */
export function archivosDe(c: ContenidoSitio): string[] {
  return [
    c.identidad.logo,
    c.identidad.fondo,
    c.prensa.rider,
    ...c.home.slides.map((s) => s.imagen),
    ...c.prensa.fotos.map((f) => f.archivo),
    ...c.prensa.logos.map((l) => l.archivo),
  ].flatMap((r) => (r ? [r.id] : []));
}

export type Publicacion = { contenido: ContenidoSitio; publicadoEn: Date };

/** Lo publicado de la banda, o null si nunca publicó. Una consulta por pedido. */
export const leerPublicado = cache(async (tenantId: string): Promise<Publicacion | null> => {
  const fila = await conTenant(tenantId, (tx) => tx.sitioPublicacion.findUnique({ where: { tenantId } }));
  return fila ? { contenido: fila.contenido as ContenidoSitio, publicadoEn: fila.publicadoEn } : null;
});

/**
 * Publica: el borrador pasa a ser lo que muestra el sitio. Sus archivos quedan
 * públicos, y los del módulo que ya no usa ni el borrador ni lo publicado se borran.
 */
export async function publicar(tx: TxTenant, tenantId: string, usuarioId: string) {
  const contenido = await leerBorrador(tx, tenantId);
  const enUso = archivosDe(contenido);
  await tx.sitioPublicacion.upsert({
    where: { tenantId },
    create: { tenantId, contenido, publicadoEn: new Date(), publicadoPor: usuarioId },
    update: { contenido, publicadoEn: new Date(), publicadoPor: usuarioId },
  });
  await marcarPublicos(tx, enUso, true);
  // Un archivo recién subido todavía no está en el borrador: la subida y el enlace van en dos
  // transacciones (el archivo se guarda antes). Si alguien publica en el medio, no se lo borra:
  // solo se borran los no usados con más de una hora (los recoge la próxima publicación).
  const hace = new Date(Date.now() - MARGEN_SUBIDA_MS);
  const viejos = new Set(
    (await tx.archivo.findMany({ where: { moduloId: MODULO, creadoEn: { lt: hace } }, select: { id: true } })).map((a) => a.id),
  );
  await borrarArchivos(
    tx,
    tenantId,
    (await archivosDelModulo(tx, MODULO)).filter((id) => !enUso.includes(id) && viejos.has(id)),
  );
}

const MARGEN_SUBIDA_MS = 60 * 60 * 1000;

/**
 * Un archivo que el borrador deja de usar: se borra ya, salvo que lo esté mostrando
 * lo publicado (en ese caso se borra al publicar de nuevo).
 */
export async function liberarArchivo(tx: TxTenant, tenantId: string, archivoId: string | null | undefined) {
  if (!archivoId) return;
  const publicado = await tx.sitioPublicacion.findUnique({ where: { tenantId }, select: { contenido: true } });
  if (publicado && archivosDe(publicado.contenido as ContenidoSitio).includes(archivoId)) return;
  await borrarArchivos(tx, tenantId, [archivoId]);
}

/** JSON con las claves ordenadas: jsonb de Postgres no conserva el orden de las claves. */
function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonico((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** ¿El borrador difiere de lo publicado? */
export function hayCambios(borrador: ContenidoSitio, publicado: ContenidoSitio | null) {
  return !publicado || canonico(borrador) !== canonico(publicado);
}

/**
 * Tope de imágenes del plan (3.2 núcleo d2: imágenes es uno de los límites que separan los
 * planes): las del slider y las fotos del press kit, del borrador. Bloquea sumar una más; nunca
 * borra ni despublica las que ya están.
 */
export const LIMITE_IMAGENES = "imagenes";

export const contarImagenes = (tx: TxTenant) =>
  Promise.all([tx.sitioSlide.count(), tx.sitioDescargable.count({ where: { tipo: "FOTO" } })]).then(([a, b]) => a + b);

export async function exigirTopeDeImagenes(tx: TxTenant, tenantId: string) {
  await exigirLimite(tx, (await import("./index")).default, tenantId, LIMITE_IMAGENES, async () => (await contarImagenes(tx)) + 1);
}
