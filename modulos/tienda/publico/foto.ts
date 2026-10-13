import { urlArchivo } from "@/nucleo/archivos";
import { urlArchivoPlataforma } from "@/nucleo/archivos/plataforma";

/** URL de la foto de un producto: la suya (archivo público de la banda) o la del producto base. */
export function urlFoto(foto: { id: string; nombre: string; plataforma: boolean } | null) {
  if (!foto) return null;
  return foto.plataforma ? urlArchivoPlataforma(foto, { variante: "web" }) : urlArchivo(foto, { variante: "web" });
}

export function fotoDeProducto(p: {
  fotoArchivoId: string | null;
  fotoNombre: string | null;
  productoBase: { fotoArchivoId: string | null; fotoNombre: string | null };
}) {
  if (p.fotoArchivoId && p.fotoNombre) return { id: p.fotoArchivoId, nombre: p.fotoNombre, plataforma: false };
  if (p.productoBase.fotoArchivoId && p.productoBase.fotoNombre) {
    return { id: p.productoBase.fotoArchivoId, nombre: p.productoBase.fotoNombre, plataforma: true };
  }
  return null;
}
