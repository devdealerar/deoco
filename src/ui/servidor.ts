// Lectura y validación de formularios en server actions del panel. Se usa junto con
// <Formulario> de @/ui: la acción devuelve { ok } o { error } (nunca tira por un dato
// inválido), y el formulario conserva lo escrito cuando hay error.
// Solo servidor: no importar desde componentes de cliente.

import { esEmail } from "@/nucleo/correo/direccion";

/** Dato inválido: su mensaje se muestra tal cual al usuario. */
export class ErrorFormulario extends Error {}

/**
 * Texto de un campo, recortado. Los saltos de línea de un <textarea> llegan del
 * navegador como \r\n: se devuelven como \n.
 */
export function texto(fd: FormData, campo: string, max = 300) {
  const v = String(fd.get(campo) ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (v.length > max) throw new ErrorFormulario(`"${campo}" supera los ${max} caracteres.`);
  return v;
}

/** Como texto(), pero vacío es un error: "Falta {etiqueta}." */
export function obligatorio(fd: FormData, campo: string, etiqueta: string, max = 200) {
  const v = texto(fd, campo, max);
  if (!v) throw new ErrorFormulario(`Falta ${etiqueta}.`);
  return v;
}

/** Link http(s) normalizado, o null si está vacío y no es obligatorio. */
export function url(fd: FormData, campo: string, obligatoria: boolean) {
  const v = texto(fd, campo, 500);
  if (!v) {
    if (obligatoria) throw new ErrorFormulario("Falta el link.");
    return null;
  }
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    return u.toString();
  } catch {
    throw new ErrorFormulario(`"${v}" no es un link válido (tiene que empezar con https://).`);
  }
}

/** Email simple (algo@dominio.tld), o "" si está vacío. */
export function email(fd: FormData, campo: string) {
  const v = texto(fd, campo, 200).toLowerCase();
  if (v && !esEmail(v)) throw new ErrorFormulario(`"${v}" no es un email válido.`);
  return v;
}

/** Color #rrggbb en minúsculas, o null si está vacío. */
export function color(fd: FormData, campo: string) {
  const v = texto(fd, campo, 7);
  if (!v) return null;
  if (!/^#[0-9a-f]{6}$/i.test(v)) throw new ErrorFormulario(`"${v}" no es un color válido.`);
  return v.toLowerCase();
}

/** Archivo elegido en un <input type="file">, o null si no se eligió ninguno. */
export function archivo(fd: FormData, campo: string) {
  const f = fd.get(campo);
  return f instanceof File && f.size > 0 ? f : null;
}
