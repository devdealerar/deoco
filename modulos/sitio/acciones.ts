"use server";

import { revalidatePath } from "next/cache";
import { accesoPanel, puedeEnPedido } from "@/nucleo/acceso/panel";
import { ErrorArchivo, guardarArchivo, type TipoArchivo, type Variante } from "@/nucleo/archivos";
import { conTenant, type TxTenant } from "@/nucleo/db/con-tenant";
import type { EstadoFormulario } from "@/ui";
import { liberarArchivo, MODULO, publicar as publicarContenido } from "./contenido";

class ErrorDatos extends Error {}

type Contexto = { tenantId: string; usuarioId: string };

/**
 * Envoltorio de todas las acciones: exige `sitio.contenido.editar` (además de lo que
 * muestre la interfaz), traduce errores esperables a mensajes y refresca el panel.
 */
async function conEdicion(slug: string, fn: (c: Contexto) => Promise<string | void>): Promise<EstadoFormulario> {
  const volver = `/b/${slug}/sitio`;
  const acceso = await accesoPanel(volver);
  if (!(await puedeEnPedido("sitio.contenido.editar", volver))) {
    return { error: "Tu rol no puede editar el sitio." };
  }
  try {
    const ok = await fn({ tenantId: acceso.tenantId, usuarioId: acceso.usuarioId });
    revalidatePath(volver, "layout");
    return { ok: ok ?? "Guardado en el borrador." };
  } catch (e) {
    if (e instanceof ErrorArchivo || e instanceof ErrorDatos) return { error: e.message };
    throw e;
  }
}

// ── lectura de formularios ────────────────────────────────────────────────

function texto(fd: FormData, campo: string, max = 300) {
  const v = String(fd.get(campo) ?? "").trim();
  if (v.length > max) throw new ErrorDatos(`"${campo}" supera los ${max} caracteres.`);
  return v;
}

function obligatorio(fd: FormData, campo: string, etiqueta: string, max = 200) {
  const v = texto(fd, campo, max);
  if (!v) throw new ErrorDatos(`Falta ${etiqueta}.`);
  return v;
}

function url(fd: FormData, campo: string, obligatoria: boolean) {
  const v = texto(fd, campo, 500);
  if (!v) {
    if (obligatoria) throw new ErrorDatos("Falta el link.");
    return null;
  }
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    return u.toString();
  } catch {
    throw new ErrorDatos(`"${v}" no es un link válido (tiene que empezar con https://).`);
  }
}

function color(fd: FormData, campo: string) {
  const v = texto(fd, campo, 7);
  if (!v) return null;
  if (!/^#[0-9a-f]{6}$/i.test(v)) throw new ErrorDatos(`"${v}" no es un color válido.`);
  return v.toLowerCase();
}

function archivoDe(fd: FormData, campo: string) {
  const f = fd.get(campo);
  return f instanceof File && f.size > 0 ? f : null;
}

const IMAGEN: TipoArchivo[] = ["jpeg", "png", "webp"];
const MB = 1024 * 1024;

async function subir(
  tenantId: string,
  f: File,
  tipos: TipoArchivo[],
  variantes: Variante[] = [],
  maxBytes = 25 * MB,
) {
  const datos = Buffer.from(await f.arrayBuffer());
  return (await guardarArchivo(tenantId, { nombre: f.name, datos }, { moduloId: MODULO, tipos, variantes, maxBytes })).id;
}

const perfilDe = (tx: TxTenant, tenantId: string) =>
  tx.sitioPerfil.upsert({ where: { tenantId }, create: { tenantId }, update: {} });

/** Mueve un item de una lista ordenada una posición arriba o abajo. */
async function mover(
  filas: { id: string; orden: number }[],
  id: string,
  direccion: string,
  guardar: (id: string, orden: number) => Promise<unknown>,
) {
  const i = filas.findIndex((f) => f.id === id);
  const j = direccion === "arriba" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= filas.length) return;
  await guardar(filas[i].id, filas[j].orden);
  await guardar(filas[j].id, filas[i].orden);
}

const siguienteOrden = (filas: { orden: number }[]) => (filas.at(-1)?.orden ?? 0) + 1;

// ── identidad ─────────────────────────────────────────────────────────────

export async function guardarIdentidad(slug: string, _: EstadoFormulario, fd: FormData) {
  return conEdicion(slug, async ({ tenantId }) => {
    const tipografia = String(fd.get("tipografia"));
    if (!["SANS", "SERIF", "MONO"].includes(tipografia)) throw new ErrorDatos("Elegí una tipografía.");
    const colorAcento = color(fd, "colorAcento") ?? "#6941c6";
    const colorFondo = color(fd, "colorFondo");
    // El logo que se muestra es PNG o WebP (el SVG va solo como descargable del press kit).
    const logo = archivoDe(fd, "logo");
    const fondo = archivoDe(fd, "fondo");
    const logoId = logo ? await subir(tenantId, logo, ["png", "webp"], [{ nombre: "web", ancho: 600, alto: 600 }], 10 * MB) : null;
    const fondoId = fondo ? await subir(tenantId, fondo, IMAGEN, [{ nombre: "web", ancho: 2000, alto: 2000 }]) : null;

    await conTenant(tenantId, async (tx) => {
      const perfil = await perfilDe(tx, tenantId);
      const quitarLogo = fd.get("quitarLogo") === "on";
      const quitarFondo = fd.get("quitarFondo") === "on";
      if (logoId || quitarLogo) await liberarArchivo(tx, tenantId, perfil.logoArchivoId);
      if (fondoId || quitarFondo) await liberarArchivo(tx, tenantId, perfil.fondoArchivoId);
      await tx.sitioPerfil.update({
        where: { tenantId },
        data: {
          tipografia: tipografia as "SANS" | "SERIF" | "MONO",
          colorAcento,
          colorFondo,
          ...(logoId ? { logoArchivoId: logoId } : quitarLogo ? { logoArchivoId: null } : {}),
          ...(fondoId ? { fondoArchivoId: fondoId } : quitarFondo ? { fondoArchivoId: null } : {}),
        },
      });
    });
  });
}

// ── home ──────────────────────────────────────────────────────────────────

export async function guardarBioCorta(slug: string, _: EstadoFormulario, fd: FormData) {
  return conEdicion(slug, async ({ tenantId }) => {
    const bioCorta = texto(fd, "bioCorta", 400);
    await conTenant(tenantId, async (tx) => {
      await perfilDe(tx, tenantId);
      await tx.sitioPerfil.update({ where: { tenantId }, data: { bioCorta } });
    });
  });
}

export async function agregarSlide(slug: string, _: EstadoFormulario, fd: FormData) {
  return conEdicion(slug, async ({ tenantId }) => {
    const imagen = archivoDe(fd, "imagen");
    if (!imagen) throw new ErrorDatos("Elegí una imagen.");
    const textoAlt = texto(fd, "textoAlt", 200);
    const archivoId = await subir(tenantId, imagen, IMAGEN, [{ nombre: "web", ancho: 1600, alto: 1600 }]);
    await conTenant(tenantId, async (tx) => {
      const orden = siguienteOrden(await tx.sitioSlide.findMany({ orderBy: { orden: "asc" } }));
      await tx.sitioSlide.create({ data: { tenantId, archivoId, textoAlt, orden } });
    });
    return "Imagen agregada al borrador.";
  });
}

export async function borrarSlide(slug: string, id: string, _: EstadoFormulario) {
  return conEdicion(slug, async ({ tenantId }) => {
    await conTenant(tenantId, async (tx) => {
      const slide = await tx.sitioSlide.findUnique({ where: { id } });
      if (!slide) return;
      await tx.sitioSlide.delete({ where: { id } });
      await liberarArchivo(tx, tenantId, slide.archivoId);
    });
    return "Imagen quitada del borrador.";
  });
}

export async function moverSlide(slug: string, id: string, direccion: string, _: EstadoFormulario) {
  return conEdicion(slug, async ({ tenantId }) => {
    await conTenant(tenantId, async (tx) => {
      const filas = await tx.sitioSlide.findMany({ orderBy: { orden: "asc" } });
      await mover(filas, id, direccion, (i, orden) => tx.sitioSlide.update({ where: { id: i }, data: { orden } }));
    });
    return "Orden actualizado.";
  });
}

export async function agregarFecha(slug: string, _: EstadoFormulario, fd: FormData) {
  return conEdicion(slug, async ({ tenantId }) => {
    const dia = texto(fd, "fecha", 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new ErrorDatos("Falta la fecha.");
    const data = {
      tenantId,
      fecha: new Date(`${dia}T12:00:00Z`),
      lugar: obligatorio(fd, "lugar", "el lugar"),
      ciudad: obligatorio(fd, "ciudad", "la ciudad"),
      link: url(fd, "link", false),
    };
    await conTenant(tenantId, (tx) => tx.sitioFecha.create({ data }));
    return "Fecha agregada al borrador.";
  });
}

export async function borrarFecha(slug: string, id: string, _: EstadoFormulario) {
  return conEdicion(slug, async ({ tenantId }) => {
    await conTenant(tenantId, (tx) => tx.sitioFecha.deleteMany({ where: { id } }));
    return "Fecha quitada del borrador.";
  });
}

export async function agregarLink(slug: string, _: EstadoFormulario, fd: FormData) {
  return conEdicion(slug, async ({ tenantId }) => {
    const tipo = String(fd.get("tipo"));
    if (tipo !== "RED" && tipo !== "ESCUCHA") throw new ErrorDatos("Elegí si es una red o una plataforma de escucha.");
    const plataforma = obligatorio(fd, "plataforma", "el nombre de la plataforma", 60);
    const destino = url(fd, "url", true)!;
    await conTenant(tenantId, async (tx) => {
      const orden = siguienteOrden(await tx.sitioLink.findMany({ orderBy: { orden: "asc" } }));
      await tx.sitioLink.create({ data: { tenantId, tipo, plataforma, url: destino, orden } });
    });
    return "Link agregado al borrador.";
  });
}

export async function borrarLink(slug: string, id: string, _: EstadoFormulario) {
  return conEdicion(slug, async ({ tenantId }) => {
    await conTenant(tenantId, (tx) => tx.sitioLink.deleteMany({ where: { id } }));
    return "Link quitado del borrador.";
  });
}

export async function moverLink(slug: string, id: string, direccion: string, _: EstadoFormulario) {
  return conEdicion(slug, async ({ tenantId }) => {
    await conTenant(tenantId, async (tx) => {
      const filas = await tx.sitioLink.findMany({ orderBy: { orden: "asc" } });
      await mover(filas, id, direccion, (i, orden) => tx.sitioLink.update({ where: { id: i }, data: { orden } }));
    });
    return "Orden actualizado.";
  });
}

// ── press kit ─────────────────────────────────────────────────────────────

export async function guardarPrensa(slug: string, _: EstadoFormulario, fd: FormData) {
  return conEdicion(slug, async ({ tenantId }) => {
    const bioLarga = texto(fd, "bioLarga", 10000);
    const prensaNombre = texto(fd, "prensaNombre", 120);
    const prensaEmail = texto(fd, "prensaEmail", 200);
    if (prensaEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(prensaEmail)) throw new ErrorDatos(`"${prensaEmail}" no es un email válido.`);
    const prensaTelefono = texto(fd, "prensaTelefono", 60);
    const rider = archivoDe(fd, "rider");
    const riderId = rider ? await subir(tenantId, rider, ["pdf"], [], 20 * MB) : null;
    await conTenant(tenantId, async (tx) => {
      const perfil = await perfilDe(tx, tenantId);
      const quitarRider = fd.get("quitarRider") === "on";
      if (riderId || quitarRider) await liberarArchivo(tx, tenantId, perfil.riderArchivoId);
      await tx.sitioPerfil.update({
        where: { tenantId },
        data: {
          bioLarga,
          prensaNombre,
          prensaEmail,
          prensaTelefono,
          ...(riderId ? { riderArchivoId: riderId } : quitarRider ? { riderArchivoId: null } : {}),
        },
      });
    });
  });
}

export async function agregarDescargable(slug: string, tipo: "FOTO" | "LOGO", _: EstadoFormulario, fd: FormData) {
  return conEdicion(slug, async ({ tenantId }) => {
    const archivo = archivoDe(fd, "archivo");
    if (!archivo) throw new ErrorDatos("Elegí un archivo.");
    const descripcion = texto(fd, "descripcion", 200);
    // Fotos en alta: el original queda intacto para descargar; la versión web es la miniatura.
    // Logos: también SVG y PDF, que solo se ofrecen como descarga (nunca se muestran).
    const tipos: TipoArchivo[] = tipo === "FOTO" ? IMAGEN : ["png", "webp", "jpeg", "svg", "pdf"];
    const archivoId = await subir(tenantId, archivo, tipos, [{ nombre: "web", ancho: 800, alto: 800 }]);
    await conTenant(tenantId, async (tx) => {
      const orden = siguienteOrden(await tx.sitioDescargable.findMany({ where: { tipo }, orderBy: { orden: "asc" } }));
      await tx.sitioDescargable.create({ data: { tenantId, tipo, archivoId, descripcion, orden } });
    });
    return tipo === "FOTO" ? "Foto agregada al borrador." : "Logo agregado al borrador.";
  });
}

export async function borrarDescargable(slug: string, id: string, _: EstadoFormulario) {
  return conEdicion(slug, async ({ tenantId }) => {
    await conTenant(tenantId, async (tx) => {
      const d = await tx.sitioDescargable.findUnique({ where: { id } });
      if (!d) return;
      await tx.sitioDescargable.delete({ where: { id } });
      await liberarArchivo(tx, tenantId, d.archivoId);
    });
    return "Quitado del borrador.";
  });
}

// ── publicar ──────────────────────────────────────────────────────────────

export async function publicar(slug: string, _: EstadoFormulario) {
  return conEdicion(slug, async ({ tenantId, usuarioId }) => {
    await conTenant(tenantId, (tx) => publicarContenido(tx, tenantId, usuarioId));
    return "Publicado. El sitio ya muestra estos cambios.";
  });
}
