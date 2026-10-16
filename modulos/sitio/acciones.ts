"use server";

import { accionesDelPanel } from "@/nucleo/acceso/acciones";
import { ErrorArchivo, guardarArchivo, type TipoArchivo, type Variante } from "@/nucleo/archivos";
import { borrarArchivos } from "@/nucleo/archivos";
import { ErrorLimite } from "@/nucleo/cuenta";
import { conTenant, type TxTenant } from "@/nucleo/db/con-tenant";
import type { EstadoFormulario } from "@/ui";
import { archivo as archivoDe, color, email, ErrorFormulario, obligatorio, texto, url } from "@/ui/servidor";
import { exigirTopeDeImagenes, liberarArchivo, MODULO, publicar as publicarContenido } from "./contenido";
import sitio from "./index";

/** Toda acción del sitio: `edicion` del contrato (sitio.contenido.editar); lo guardado va al borrador. */
const conEdicion = accionesDelPanel(() => sitio, [ErrorArchivo, ErrorFormulario, ErrorLimite]);

/**
 * Una imagen nueva del sitio (slide, foto del press kit): el tope del plan se mira antes de subir
 * (no se sube de balde) y otra vez al guardar (dos a la vez). Si ahí no entra, el archivo se borra.
 */
async function conImagenNueva(tenantId: string, subirla: () => Promise<string>, guardar: (tx: TxTenant, archivoId: string) => Promise<unknown>) {
  await conTenant(tenantId, (tx) => exigirTopeDeImagenes(tx, tenantId));
  const archivoId = await subirla();
  try {
    await conTenant(tenantId, async (tx) => {
      await exigirTopeDeImagenes(tx, tenantId);
      await guardar(tx, archivoId);
    });
  } catch (e) {
    await conTenant(tenantId, (tx) => borrarArchivos(tx, tenantId, [archivoId])).catch(() => undefined);
    throw e;
  }
}

const IMAGEN: TipoArchivo[] = ["jpeg", "png", "webp"];
const MB = 1024 * 1024;

async function subir(
  tenantId: string,
  recurso: "logo" | "fondo" | "slide" | "rider" | "descargable",
  f: File,
  tipos: TipoArchivo[],
  variantes: Variante[] = [],
  maxBytes = 25 * MB,
) {
  const datos = Buffer.from(await f.arrayBuffer());
  return (await guardarArchivo(tenantId, { nombre: f.name, datos }, { moduloId: MODULO, recurso, tipos, variantes, maxBytes })).id;
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
    if (!["SANS", "SERIF", "MONO"].includes(tipografia)) throw new ErrorFormulario("Elegí una tipografía.");
    const colorAcento = color(fd, "colorAcento") ?? "#6941c6";
    const colorFondo = color(fd, "colorFondo");
    // El logo que se muestra es PNG o WebP (el SVG va solo como descargable del press kit).
    const logo = archivoDe(fd, "logo");
    const fondo = archivoDe(fd, "fondo");
    const logoId = logo ? await subir(tenantId, "logo", logo, ["png", "webp"], [{ nombre: "web", ancho: 600, alto: 600 }], 10 * MB) : null;
    const fondoId = fondo ? await subir(tenantId, "fondo", fondo, IMAGEN, [{ nombre: "web", ancho: 2000, alto: 2000 }]) : null;

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
    if (!imagen) throw new ErrorFormulario("Elegí una imagen.");
    const textoAlt = texto(fd, "textoAlt", 200);
    await conImagenNueva(
      tenantId,
      () => subir(tenantId, "slide", imagen, IMAGEN, [{ nombre: "web", ancho: 1600, alto: 1600 }]),
      async (tx, archivoId) => {
        const orden = siguienteOrden(await tx.sitioSlide.findMany({ orderBy: { orden: "asc" } }));
        await tx.sitioSlide.create({ data: { tenantId, archivoId, textoAlt, orden } });
      },
    );
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new ErrorFormulario("Falta la fecha.");
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
    if (tipo !== "RED" && tipo !== "ESCUCHA") throw new ErrorFormulario("Elegí si es una red o una plataforma de escucha.");
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
    const prensaEmail = email(fd, "prensaEmail");
    const prensaTelefono = texto(fd, "prensaTelefono", 60);
    const rider = archivoDe(fd, "rider");
    const riderId = rider ? await subir(tenantId, "rider", rider, ["pdf"], [], 20 * MB) : null;
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
    if (!archivo) throw new ErrorFormulario("Elegí un archivo.");
    const descripcion = texto(fd, "descripcion", 200);
    // Fotos en alta: el original queda intacto para descargar; la versión web es la miniatura.
    // Logos: también SVG y PDF, que solo se ofrecen como descarga (nunca se muestran).
    const tipos: TipoArchivo[] = tipo === "FOTO" ? IMAGEN : ["png", "webp", "jpeg", "svg", "pdf"];
    const guardar = async (tx: TxTenant, archivoId: string) => {
      const orden = siguienteOrden(await tx.sitioDescargable.findMany({ where: { tipo }, orderBy: { orden: "asc" } }));
      await tx.sitioDescargable.create({ data: { tenantId, tipo, archivoId, descripcion, orden } });
    };
    const subirlo = () => subir(tenantId, "descargable", archivo, tipos, [{ nombre: "web", ancho: 800, alto: 800 }]);
    // Las fotos cuentan para el tope de imágenes del plan; los logos, no.
    if (tipo === "FOTO") await conImagenNueva(tenantId, subirlo, guardar);
    else {
      const archivoId = await subirlo();
      await conTenant(tenantId, (tx) => guardar(tx, archivoId));
    }
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
