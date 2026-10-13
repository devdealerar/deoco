// Archivo de impresión: qué se mide al subirlo y si sirve para un producto base.
// PNG: píxeles y resolución declarada. PDF: tamaño de la primera página (vectorial: lo que
// importa es que la página alcance el tamaño de impresión).
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

export type Medida =
  | { formato: "png"; anchoPx: number; altoPx: number; dpi: number | null }
  | { formato: "pdf"; anchoPt: number; altoPt: number };

export type Especificacion = {
  nombre: string;
  impresionAnchoPx: number;
  impresionAltoPx: number;
  impresionDpi: number;
  impresionFormatos: string[];
};

export class ErrorImpresion extends Error {}

const esPng = (d: Buffer) => d.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const esPdf = (d: Buffer) => d.subarray(0, 5).toString("latin1") === "%PDF-";

/** Mide el archivo. Solo PNG y PDF (SVG, JPG y otros no sirven para imprimir acá). */
export async function medir(datos: Buffer, nombre: string): Promise<Medida> {
  if (esPng(datos)) {
    const m = await sharp(datos).metadata().catch(() => null);
    if (!m?.width || !m.height) throw new ErrorImpresion(`"${nombre}" no se pudo leer como PNG.`);
    return { formato: "png", anchoPx: m.width, altoPx: m.height, dpi: m.density ? Math.round(m.density) : null };
  }
  if (esPdf(datos)) {
    try {
      const pdf = await PDFDocument.load(datos, { ignoreEncryption: true, updateMetadata: false });
      const { width, height } = pdf.getPage(0).getSize();
      return { formato: "pdf", anchoPt: width, altoPt: height };
    } catch {
      throw new ErrorImpresion(`"${nombre}" no se pudo leer como PDF.`);
    }
  }
  throw new ErrorImpresion(`"${nombre}" no es PNG ni PDF: el archivo de impresión tiene que ser PNG de alta o PDF.`);
}

const cm = (pulgadas: number) => (pulgadas * 2.54).toLocaleString("es-AR", { maximumFractionDigits: 1 });
const TOLERANCIA = 0.99; // 1%: redondeos de los programas de diseño

/**
 * Qué le falta al archivo para el producto base, con los números exactos. Vacío = sirve.
 * Más grande que lo pedido está bien; más chico, no.
 */
export function problemasDeImpresion(m: Medida, spec: Especificacion): string[] {
  const p: string[] = [];
  const { impresionAnchoPx: ancho, impresionAltoPx: alto, impresionDpi: dpi } = spec;
  if (!spec.impresionFormatos.includes(m.formato)) {
    p.push(`${spec.nombre} acepta ${spec.impresionFormatos.join(" o ").toUpperCase()}, subiste ${m.formato.toUpperCase()}.`);
    return p;
  }
  if (m.formato === "png") {
    if (m.anchoPx < ancho || m.altoPx < alto) {
      p.push(`Para ${spec.nombre} necesita ${ancho}×${alto} px, subiste ${m.anchoPx}×${m.altoPx} px.`);
    }
    if (m.dpi === null) p.push(`El PNG no indica su resolución: exportalo a ${dpi} dpi.`);
    else if (m.dpi < dpi) p.push(`Necesita ${dpi} dpi, el archivo tiene ${m.dpi} dpi.`);
  } else {
    const necesitaAncho = ancho / dpi;
    const necesitaAlto = alto / dpi;
    const tieneAncho = m.anchoPt / 72;
    const tieneAlto = m.altoPt / 72;
    if (tieneAncho < necesitaAncho * TOLERANCIA || tieneAlto < necesitaAlto * TOLERANCIA) {
      p.push(
        `Para ${spec.nombre} la página tiene que medir al menos ${cm(necesitaAncho)}×${cm(necesitaAlto)} cm ` +
          `(${ancho}×${alto} px a ${dpi} dpi); tu PDF mide ${cm(tieneAncho)}×${cm(tieneAlto)} cm.`,
      );
    }
  }
  return p;
}

/** Para mostrar lo medido: "4200×4800 px · 300 dpi" o "PDF de 35,6×40,6 cm". */
export function describirMedida(m: Medida): string {
  return m.formato === "png"
    ? `PNG de ${m.anchoPx}×${m.altoPx} px · ${m.dpi ? `${m.dpi} dpi` : "sin resolución declarada"}`
    : `PDF de ${cm(m.anchoPt / 72)}×${cm(m.altoPt / 72)} cm`;
}

/** Qué se le pide a la banda para ese producto base. */
export function describirEspecificacion(s: Especificacion): string {
  return `${s.impresionFormatos.join(" o ").toUpperCase()} · ${s.impresionAnchoPx}×${s.impresionAltoPx} px a ${s.impresionDpi} dpi (${cm(
    s.impresionAnchoPx / s.impresionDpi,
  )}×${cm(s.impresionAltoPx / s.impresionDpi)} cm)`;
}

export function medidaDeDiseno(d: {
  formato: string;
  anchoPx: number | null;
  altoPx: number | null;
  dpi: number | null;
  anchoPt: number | null;
  altoPt: number | null;
}): Medida {
  return d.formato === "png"
    ? { formato: "png", anchoPx: d.anchoPx ?? 0, altoPx: d.altoPx ?? 0, dpi: d.dpi }
    : { formato: "pdf", anchoPt: d.anchoPt ?? 0, altoPt: d.altoPt ?? 0 };
}
