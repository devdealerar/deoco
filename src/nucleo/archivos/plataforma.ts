// Archivos de la plataforma: no son de una banda (la foto de un producto del catálogo base).
// Siempre públicos, en cualquier host: /archivos/plataforma/<id>/<nombre>[?v=web].
// Se escriben solo dentro de conStaff() (la tabla es global: la base lo exige).
import { randomUUID } from "node:crypto";
import type { TxTenant } from "@/nucleo/db/con-tenant";
import { prisma } from "@/nucleo/db/cliente";
import { almacen } from "./almacen";
import { ErrorArchivo, prepararArchivo, respuestaArchivo, type TipoArchivo, type Variante } from "./index";

export type ArchivoPlataformaGuardado = { id: string; nombre: string; tipo: TipoArchivo; variantes: string[] };

const clave = (id: string, variante?: string) => (variante ? `plataforma/${id}.${variante}.webp` : `plataforma/${id}`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Guarda un archivo de la plataforma. `tx` tiene que ser una transacción de conStaff(). */
export async function guardarArchivoPlataforma(
  tx: TxTenant,
  archivo: { nombre: string; datos: Buffer },
  opciones: { moduloId: string; tipos: TipoArchivo[]; maxBytes?: number; variantes?: Variante[] },
): Promise<ArchivoPlataformaGuardado> {
  const [{ staff }] = await tx.$queryRaw<{ staff: boolean }[]>`SELECT app_es_staff() AS staff`;
  if (!staff) throw new ErrorArchivo("Los archivos de la plataforma los sube el staff (conStaff).");
  const { nombre, tipo, datos, variantes } = await prepararArchivo(archivo, opciones);
  const id = randomUUID();
  const claves = [clave(id), ...variantes.map((v) => clave(id, v.nombre))];
  const piezas = [datos, ...variantes.map((v) => v.datos)];
  try {
    for (const [i, c] of claves.entries()) await almacen().guardar(c, piezas[i]);
    const bytes = BigInt(datos.length + variantes.reduce((s, v) => s + v.datos.length, 0));
    await tx.archivoPlataforma.create({
      data: { id, moduloId: opciones.moduloId, nombre, tipo, bytes, variantes: variantes.map((v) => v.nombre) },
    });
  } catch (e) {
    await Promise.allSettled(claves.map((c) => almacen().borrar(c)));
    throw e;
  }
  return { id, nombre, tipo, variantes: variantes.map((v) => v.nombre) };
}

/**
 * Borra el registro dentro de la transacción de staff y devuelve la limpieza de los bytes,
 * para correrla DESPUÉS de que la transacción se confirme (si se revierte, no se llama).
 */
export async function borrarArchivoPlataforma(tx: TxTenant, id: string): Promise<() => Promise<void>> {
  const fila = await tx.archivoPlataforma.findUnique({ where: { id }, select: { variantes: true } });
  if (!fila) return async () => {};
  await tx.archivoPlataforma.delete({ where: { id } });
  return async () => {
    for (const c of [clave(id), ...fila.variantes.map((v) => clave(id, v))]) {
      await almacen().borrar(c).catch((e) => console.error(`[archivos] no se pudo borrar ${c}`, e));
    }
  };
}

/** URL relativa: sirve igual en app.<raiz> y en el sitio de cualquier banda. */
export function urlArchivoPlataforma(archivo: { id: string; nombre: string }, opciones: { variante?: string } = {}) {
  const qs = opciones.variante ? `?v=${encodeURIComponent(opciones.variante)}` : "";
  return `/archivos/plataforma/${archivo.id}/${encodeURIComponent(archivo.nombre)}${qs}`;
}

export async function servirArchivoPlataforma(id: string, opciones: { variante?: string | null }): Promise<Response> {
  const noEncontrado = () => new Response("No encontrado", { status: 404 });
  if (!UUID.test(id)) return noEncontrado();
  const archivo = await prisma.archivoPlataforma.findUnique({ where: { id } });
  if (!archivo) return noEncontrado();
  const variante = opciones.variante ?? undefined;
  if (variante && !archivo.variantes.includes(variante)) return noEncontrado();
  const cuerpo = await almacen().leer(clave(id, variante));
  if (!cuerpo) return noEncontrado();
  return respuestaArchivo(archivo, cuerpo, { variante, publico: true });
}
