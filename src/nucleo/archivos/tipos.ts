/** Tipos de archivo que acepta Deoco. Se detectan por el contenido, no por la extensión. */
export type TipoArchivo = "jpeg" | "png" | "webp" | "pdf" | "svg";

export const MIME: Record<TipoArchivo, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
  svg: "image/svg+xml",
};

/** Formatos raster: los únicos con versiones livianas. */
export const RASTER: TipoArchivo[] = ["jpeg", "png", "webp"];

export function detectarTipo(datos: Buffer): TipoArchivo | null {
  const b = datos;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (b.length >= 5 && b.toString("latin1", 0, 5) === "%PDF-") return "pdf";
  // SVG: texto que, salteando BOM, declaración XML, comentarios y doctype, abre con <svg
  const inicio = b.toString("utf8", 0, Math.min(b.length, 4096)).replace(/^﻿/, "");
  const sinPrologo = inicio.replace(/^\s*(<\?xml[^>]*>\s*|<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*/i, "");
  if (/^<svg[\s>]/i.test(sinPrologo)) return "svg";
  return null;
}
