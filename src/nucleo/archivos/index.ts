import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { alConfirmar, conTenant, type TxTenant } from "@/nucleo/db/con-tenant";
import { almacen } from "./almacen";
import { detectarTipo, MIME, RASTER, type TipoArchivo } from "./tipos";

export type { TipoArchivo };

/** Máximo absoluto por archivo (el módulo puede pedir menos). Ver bodySizeLimit en next.config.ts. */
export const MAX_BYTES_ARCHIVO = 25 * 1024 * 1024;

export class ErrorArchivo extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorArchivo";
  }
}

/** Versión liviana, en WebP, que no supera `ancho` x `alto` (nunca agranda). */
export type Variante = { nombre: string; ancho: number; alto?: number };

export type ArchivoGuardado = { id: string; nombre: string; tipo: TipoArchivo; variantes: string[] };

const clave = (tenantId: string, id: string, variante?: string) =>
  variante ? `${tenantId}/${id}.${variante}.webp` : `${tenantId}/${id}`;

export function formatearBytes(n: number | bigint) {
  const v = Number(n);
  if (v >= 1024 ** 3) return `${(v / 1024 ** 3).toFixed(1)} GB`;
  if (v >= 1024 ** 2) return `${(v / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.ceil(v / 1024)} KB`;
}

function limitePorDefecto() {
  return BigInt(process.env.DEOCO_LIMITE_ALMACENAMIENTO ?? 1024 ** 3);
}

/** Espacio usado y límite de la banda, en bytes. */
export async function usoAlmacenamiento(tenantId: string) {
  return conTenant(tenantId, async (tx) => {
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { limiteAlmacenamiento: true } });
    const { _sum } = await tx.archivo.aggregate({ _sum: { bytes: true } });
    return { usado: _sum.bytes ?? BigInt(0), limite: tenant?.limiteAlmacenamiento ?? limitePorDefecto() };
  });
}

/** Valida tamaño y tipo real, y genera las versiones livianas. No toca base ni almacén. */
export async function prepararArchivo(
  archivo: { nombre: string; datos: Buffer },
  opciones: { tipos: TipoArchivo[]; maxBytes?: number; variantes?: Variante[] },
) {
  const { datos } = archivo;
  const nombre = archivo.nombre.replace(/[/\\\0]/g, "_").slice(0, 200) || "archivo";
  const max = Math.min(opciones.maxBytes ?? MAX_BYTES_ARCHIVO, MAX_BYTES_ARCHIVO);
  if (datos.length === 0) throw new ErrorArchivo("El archivo está vacío.");
  if (datos.length > max) {
    throw new ErrorArchivo(`"${nombre}" pesa ${formatearBytes(datos.length)}; el máximo es ${formatearBytes(max)}.`);
  }
  const tipo = detectarTipo(datos);
  if (!tipo || !opciones.tipos.includes(tipo)) {
    const aceptados = opciones.tipos.map((t) => t.toUpperCase()).join(", ");
    throw new ErrorArchivo(`"${nombre}" no es un formato aceptado acá (${aceptados}).`);
  }

  // Versiones livianas, antes de tocar la base (sharp puede rechazar una imagen rota).
  const variantes: { nombre: string; datos: Buffer }[] = [];
  if (RASTER.includes(tipo)) {
    for (const v of opciones.variantes ?? []) {
      try {
        const salida = await sharp(datos)
          .rotate() // respeta la orientación EXIF de las fotos de celular
          .resize({ width: v.ancho, height: v.alto, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();
        variantes.push({ nombre: v.nombre, datos: salida });
      } catch {
        throw new ErrorArchivo(`"${nombre}" no se pudo leer como imagen.`);
      }
    }
  }
  return { nombre, tipo, datos, variantes };
}

/**
 * Guarda un archivo de la banda. Valida tamaño, tipo real (por contenido) y cuota;
 * genera las versiones livianas pedidas (solo imágenes). Devuelve su id.
 */
export async function guardarArchivo(
  tenantId: string,
  archivo: { nombre: string; datos: Buffer },
  opciones: { moduloId: string; tipos: TipoArchivo[]; maxBytes?: number; variantes?: Variante[] },
): Promise<ArchivoGuardado> {
  const { nombre, tipo, datos, variantes } = await prepararArchivo(archivo, opciones);
  const total = BigInt(datos.length + variantes.reduce((s, v) => s + v.datos.length, 0));

  const id = randomUUID();
  const claves = [clave(tenantId, id), ...variantes.map((v) => clave(tenantId, id, v.nombre))];
  await almacen().guardar(claves[0], datos);
  for (const v of variantes) await almacen().guardar(clave(tenantId, id, v.nombre), v.datos);

  try {
    await conTenant(tenantId, async (tx) => {
      // Bloquea la fila de la banda: dos subidas a la vez no pasan juntas la cuota.
      const [tenant] = await tx.$queryRaw<{ limiteAlmacenamiento: bigint | null }[]>`
        SELECT "limiteAlmacenamiento" FROM "tenant" WHERE id = ${tenantId}::uuid FOR UPDATE`;
      const limite = tenant?.limiteAlmacenamiento ?? limitePorDefecto();
      const usado = (await tx.archivo.aggregate({ _sum: { bytes: true } }))._sum.bytes ?? BigInt(0);
      if (usado + total > limite) {
        throw new ErrorArchivo(
          `No hay espacio para "${nombre}" (${formatearBytes(total)}): la banda usa ${formatearBytes(usado)} ` +
            `de ${formatearBytes(limite)}. Borrá archivos que no uses o ampliá el espacio.`,
        );
      }
      await tx.archivo.create({
        data: { id, tenantId, moduloId: opciones.moduloId, nombre, tipo, bytes: total, variantes: variantes.map((v) => v.nombre) },
      });
    });
  } catch (e) {
    for (const c of claves) await almacen().borrar(c);
    throw e;
  }
  return { id, nombre, tipo, variantes: variantes.map((v) => v.nombre) };
}

/** Marca archivos como públicos (o no) para el sitio de la banda. */
export async function marcarPublicos(tx: TxTenant, ids: string[], publico: boolean) {
  if (ids.length === 0) return;
  await tx.archivo.updateMany({ where: { id: { in: ids } }, data: { publico } });
}

/** Ids de los archivos de un módulo en la banda de la transacción. */
export async function archivosDelModulo(tx: TxTenant, moduloId: string): Promise<string[]> {
  return (await tx.archivo.findMany({ where: { moduloId }, select: { id: true } })).map((a) => a.id);
}

/**
 * Borra archivos dentro de la transacción. Los bytes se borran del almacén recién
 * cuando la transacción se confirma (si se revierte, quedan).
 */
export async function borrarArchivos(tx: TxTenant, tenantId: string, ids: string[]) {
  if (ids.length === 0) return;
  const filas = await tx.archivo.findMany({ where: { id: { in: ids } }, select: { id: true, variantes: true } });
  await tx.archivo.deleteMany({ where: { id: { in: filas.map((f) => f.id) } } });
  alConfirmar(tx, () => {
    for (const f of filas) {
      for (const c of [clave(tenantId, f.id), ...f.variantes.map((v) => clave(tenantId, f.id, v))]) {
        void almacen().borrar(c).catch((e) => console.error(`[archivos] no se pudo borrar ${c}`, e));
      }
    }
  });
}

/** URL de un archivo. Sitio público: /archivos/...; panel: /b/<slug>/archivos/... */
export function urlArchivo(
  archivo: { id: string; nombre: string },
  opciones: { variante?: string; descargar?: boolean; panelSlug?: string } = {},
) {
  const base = opciones.panelSlug ? `/b/${opciones.panelSlug}/archivos` : "/archivos";
  const q = new URLSearchParams();
  if (opciones.variante) q.set("v", opciones.variante);
  if (opciones.descargar) q.set("descargar", "1");
  const qs = q.toString();
  return `${base}/${archivo.id}/${encodeURIComponent(archivo.nombre)}${qs ? `?${qs}` : ""}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Respuesta HTTP con el archivo `id` de la banda `tenantId`. La búsqueda va bajo RLS:
 * un archivo de otra banda no existe (404). `soloPublicos`: el sitio público solo sirve
 * los marcados como públicos.
 * Un SVG se sirve SIEMPRE como descarga y sin poder ejecutar nada: nunca se renderiza.
 */
export async function servirArchivo(
  tenantId: string,
  id: string,
  opciones: { soloPublicos: boolean; variante?: string | null; descargar?: boolean },
): Promise<Response> {
  const noEncontrado = () => new Response("No encontrado", { status: 404 });
  if (!UUID.test(id)) return noEncontrado();
  const archivo = await conTenant(tenantId, (tx) => tx.archivo.findUnique({ where: { id } }));
  if (!archivo || (opciones.soloPublicos && !archivo.publico)) return noEncontrado();
  const variante = opciones.variante ?? undefined;
  if (variante && !archivo.variantes.includes(variante)) return noEncontrado();

  const cuerpo = await almacen().leer(clave(tenantId, archivo.id, variante));
  if (!cuerpo) return noEncontrado();

  return respuestaArchivo(archivo, cuerpo, { variante, descargar: opciones.descargar, publico: opciones.soloPublicos });
}

/** Cabeceras comunes de un archivo servido (tipo, caché, SVG siempre como descarga sandbox). */
export function respuestaArchivo(
  archivo: { nombre: string; tipo: string },
  cuerpo: BodyInit,
  opciones: { variante?: string; descargar?: boolean; publico: boolean },
): Response {
  const { variante } = opciones;
  const tipo = archivo.tipo as TipoArchivo;
  const cabeceras = new Headers({
    "Content-Type": variante ? "image/webp" : MIME[tipo],
    "X-Content-Type-Options": "nosniff",
    // Un archivo nunca se sobreescribe (cada subida tiene id nuevo): caché permanente.
    "Cache-Control": opciones.publico ? "public, max-age=31536000, immutable" : "private, max-age=300",
  });
  if (tipo === "svg" && !variante) {
    cabeceras.set("Content-Security-Policy", "sandbox; default-src 'none'");
  }
  if ((tipo === "svg" && !variante) || opciones.descargar) {
    cabeceras.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(archivo.nombre)}`);
  }
  return new Response(cuerpo, { headers: cabeceras });
}
