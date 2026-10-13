// Dinero de la tienda: centavos (Int) por dentro, pesos argentinos por fuera.

const enteros = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const conCentavos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

/** 1250050 → "$ 12.500,50"; 1250000 → "$ 12.500" */
export function formatearPesos(centavos: number): string {
  return (centavos % 100 ? conCentavos : enteros).format(centavos / 100);
}

/**
 * "12500", "12.500", "12500,50", "12.500,5", "$ 12.500" → centavos. Coma decimal, punto de
 * miles (como se escribe acá). null si no es un monto válido o es negativo.
 */
export function leerPesos(texto: string): number | null {
  const limpio = texto.replace(/\$|\s/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(limpio)) return null;
  const [enteros, decimales = ""] = limpio.replace(/\./g, "").split(",");
  return Number(enteros) * 100 + Number(decimales.padEnd(2, "0"));
}

/** Para precargar un campo: 1250050 → "12500,50"; 1250000 → "12500". */
export function pesosParaCampo(centavos: number): string {
  const enteros = Math.trunc(centavos / 100);
  const resto = centavos % 100;
  return resto ? `${enteros},${String(resto).padStart(2, "0")}` : String(enteros);
}
