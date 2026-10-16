import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Registro } from "@/nucleo/modulos/registro";
import { alConfirmar, conTenant, type TxTenant } from "@/nucleo/db/con-tenant";
import { almacen } from "./almacen";
import { detectarTipo, MIME, RASTER, type TipoArchivo } from "./tipos";
import { limitePorDefecto, reservaDeDisco } from "./limite";

export { limitePorDefecto, problemaDeLimite, problemaDeReserva, reservaDeDisco } from "./limite";

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

/** Id con que el gestor de cuenta reconoce el límite de espacio (es del núcleo, no de un módulo). */
export const LIMITE_ALMACENAMIENTO = "nucleo.almacenamiento";

const SIN_LUGAR = new Set(["ENOSPC", "EDQUOT"]);

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
  opciones: { moduloId: string; recurso: string; tipos: TipoArchivo[]; maxBytes?: number; variantes?: Variante[] },
  reg?: Registro,
): Promise<ArchivoGuardado> {
  // El recurso lo declara el módulo (`archivos` en su contrato): con él se decide quién lo ve.
  // (Import tardío: el registro importa los módulos, que importan este archivo.)
  const { registro } = await import("@/nucleo/modulos");
  if (!(reg ?? registro()).modulo(opciones.moduloId)?.archivos?.some((a) => a.recurso === opciones.recurso)) {
    throw new Error(`El módulo "${opciones.moduloId}" no declara el recurso "${opciones.recurso}" en archivos.`);
  }
  const { nombre, tipo, datos, variantes } = await prepararArchivo(archivo, opciones);
  const total = BigInt(datos.length + variantes.reduce((s, v) => s + v.datos.length, 0));

  const id = randomUUID();
  const piezas = [{ clave: clave(tenantId, id), datos }, ...variantes.map((v) => ({ clave: clave(tenantId, id, v.nombre), datos: v.datos }))];
  const escritas: string[] = [];

  // Orden: cuota (con la fila de la banda bloqueada) → bytes → fila, todo en la misma
  // transacción. Si algo falla (cuota, disco lleno, una variante), se borra lo escrito y no
  // queda la fila; si el proceso muere antes de confirmar, lo recoge `limpiarHuerfanos`.
  try {
    await conTenant(tenantId, async (tx) => {
      // Bloquea la fila de la banda: dos subidas a la vez no pasan juntas la cuota.
      const [tenant] = await tx.$queryRaw<{ limiteAlmacenamiento: bigint | null }[]>`
        SELECT "limiteAlmacenamiento" FROM "tenant" WHERE id = ${tenantId}::uuid FOR UPDATE`;
      const limite = tenant?.limiteAlmacenamiento ?? limitePorDefecto();
      const usado = (await tx.archivo.aggregate({ _sum: { bytes: true } }))._sum.bytes ?? BigInt(0);
      if (usado + total > limite) {
        // El gestor de cuenta (si hay) dice cómo tener más espacio (p. ej. qué plan lo da).
        // (Import tardío: el registro importa los módulos, que importan este archivo.)
        const como = await registro()
          .gestor?.gestion.comoAmpliar(tenantId, LIMITE_ALMACENAMIENTO, Number(usado + total))
          .catch(() => null);
        throw new ErrorArchivo(
          `No hay espacio para "${nombre}" (${formatearBytes(total)}): la banda ya usa ${formatearBytes(usado)} ` +
            `de ${formatearBytes(limite)}. Borrá archivos que no uses${como ? `. ${como}` : " o escribinos para tener más espacio."}`,
        );
      }
      // El disco de los archivos nunca se llena del todo: se deja la reserva (si comparte disco
      // con la base, la base siempre tiene lugar).
      const libre = await almacen().libre();
      if (libre !== null && libre - Number(total) < reservaDeDisco()) {
        throw Object.assign(new Error(`el almacén deja ${libre} bytes libres, menos que la reserva`), { code: "ENOSPC" });
      }
      for (const pieza of piezas) {
        escritas.push(pieza.clave);
        await almacen().guardar(pieza.clave, pieza.datos);
      }
      await tx.archivo.create({
        data: { id, tenantId, moduloId: opciones.moduloId, recurso: opciones.recurso, nombre, tipo, bytes: total, variantes: variantes.map((v) => v.nombre) },
      });
    });
  } catch (e) {
    await Promise.allSettled(escritas.map((c) => almacen().borrar(c)));
    // Disco del servidor lleno (no la cuota de la banda): no se borra nada de nadie; se avisa
    // claro y el staff lo ve en el log.
    if (SIN_LUGAR.has((e as NodeJS.ErrnoException).code ?? "")) {
      console.error(`[archivos] el almacén se quedó sin lugar al guardar en ${tenantId}`, e);
      throw new ErrorArchivo("No pudimos guardar el archivo por un problema de espacio de nuestro lado. No se perdió nada de lo que ya tenías; probá de nuevo más tarde.");
    }
    throw e;
  }
  return { id, nombre, tipo, variantes: variantes.map((v) => v.nombre) };
}

/**
 * El contenido original de un archivo del módulo en la banda (para copiarlo: un producto que se
 * duplica lleva su propia foto). null si no existe o es de otro módulo.
 */
export async function leerArchivo(tenantId: string, archivoId: string, moduloId: string): Promise<{ nombre: string; datos: Buffer } | null> {
  const fila = await conTenant(tenantId, (tx) => tx.archivo.findUnique({ where: { id: archivoId }, select: { nombre: true, moduloId: true } }));
  if (!fila || fila.moduloId !== moduloId) return null;
  const flujo = await almacen().leer(clave(tenantId, archivoId));
  if (!flujo) return null;
  return { nombre: fila.nombre, datos: Buffer.from(await new Response(flujo).arrayBuffer()) };
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

/**
 * Bytes en el almacén sin fila en `archivo` (el proceso murió entre escribir y confirmar):
 * se borran si tienen más de `antiguedadMs` (una subida en curso nunca es huérfana). Solo
 * carpetas de bandas que existen; "plataforma" y lo que no se reconoce no se toca. Diario.
 */
export async function limpiarHuerfanos(ahora = new Date(), antiguedadMs = 86_400_000): Promise<number> {
  let borrados = 0;
  for (const carpeta of await almacen().carpetas()) {
    if (!UUID.test(carpeta)) continue;
    const viejas = new Map<string, string[]>();
    for await (const { clave: c, modificado } of almacen().listar(`${carpeta}/`)) {
      const id = c.slice(carpeta.length + 1, carpeta.length + 37);
      if (!UUID.test(id) || ahora.getTime() - modificado.getTime() < antiguedadMs) continue;
      viejas.set(id, [...(viejas.get(id) ?? []), c]);
    }
    if (viejas.size === 0) continue;
    const conFila = await conTenant(carpeta, async (tx) => {
      if (!(await tx.tenant.findUnique({ where: { id: carpeta }, select: { id: true } }))) return null;
      return new Set((await tx.archivo.findMany({ where: { id: { in: [...viejas.keys()] } }, select: { id: true } })).map((a) => a.id));
    });
    if (!conFila) continue;
    for (const [id, claves] of viejas) {
      if (conFila.has(id)) continue;
      for (const c of claves) await almacen().borrar(c);
      borrados++;
    }
  }
  return borrados;
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
