// La foto fiscal de una venta (3.2, fiscal d1): desde la primera venta, cada orden guarda la
// condición fiscal del vendedor (la banda), la identificación del comprador y los impuestos
// discriminados. Todavía no se factura nada: se guarda para que ninguna venta de hoy quede sin
// poder facturarse después. La toma el módulo al pagarse, en la misma transacción.
import type { Prisma } from "@/generated/prisma/client";
import type { TxTenant } from "@/nucleo/db/con-tenant";

export const VERSION_FISCAL = 1;
/** IVA general (Argentina). Si la banda es responsable inscripta, el precio lo incluye. */
export const ALICUOTA_IVA = 21;

export type Renglon = { descripcion: string; cantidad: number; precioUnitario: number };

export type FotoFiscal = {
  version: number;
  pais: string;
  moneda: "ARS";
  fecha: string;
  vendedor: { condicion: string; cuit: string | null; razonSocial: string | null };
  comprador: { nombre: string; email: string; documento: string | null };
  renglones: (Renglon & { importe: number })[];
  total: number;
  /** Discriminados. Vacío si el vendedor no discrimina (monotributo, exento) o no declaró su condición. */
  impuestos: { tipo: "IVA"; alicuota: number; base: number; importe: number }[];
};

/** Normaliza un DNI (7-8 dígitos) o CUIT (11): solo dígitos. null si no parece ninguno. */
export function documentoFiscal(crudo: string | null | undefined): string | null {
  const d = (crudo ?? "").replace(/\D/g, "");
  return /^\d{7,8}$|^\d{11}$/.test(d) ? d : null;
}

/** La foto, con los datos fiscales de la banda de la transacción (sin fila: "sin_declarar"). Centavos. */
export async function fotoFiscal(
  tx: TxTenant,
  tenantId: string,
  venta: { comprador: FotoFiscal["comprador"]; renglones: Renglon[]; total: number; pais?: string },
  ahora = new Date(),
): Promise<Prisma.InputJsonObject> {
  const datos = await tx.datosFiscales.findUnique({ where: { tenantId } });
  const condicion = datos?.condicion ?? "sin_declarar";
  const impuestos: FotoFiscal["impuestos"] = [];
  if (condicion === "responsable_inscripto") {
    const base = Math.round((venta.total * 100) / (100 + ALICUOTA_IVA));
    impuestos.push({ tipo: "IVA", alicuota: ALICUOTA_IVA, base, importe: venta.total - base });
  }
  const foto: FotoFiscal = {
    version: VERSION_FISCAL,
    pais: venta.pais ?? "AR",
    moneda: "ARS",
    fecha: ahora.toISOString(),
    vendedor: { condicion, cuit: datos?.cuit ?? null, razonSocial: datos?.razonSocial ?? null },
    comprador: venta.comprador,
    renglones: venta.renglones.map((r) => ({ ...r, importe: r.precioUnitario * r.cantidad })),
    total: venta.total,
    impuestos,
  };
  return foto as unknown as Prisma.InputJsonObject;
}
