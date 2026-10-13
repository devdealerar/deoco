import type { ResultadoVerificacion } from "@/nucleo/dominios";

/** Lo que ve quien toca "Verificar". */
export function mensajeVerificacion(r: ResultadoVerificacion): { ok: string } | { error: string } {
  if (r.verificado) {
    return {
      ok: "Verificado. Falta que Deoco lo active en el servidor (certificado HTTPS); cuando abra con candado, podés usarlo como principal.",
    };
  }
  const faltan: string[] = [];
  if (r.faltaA) {
    faltan.push(
      r.ipsEncontradas.length
        ? `el registro A apunta a ${r.ipsEncontradas.join(", ")} y tiene que apuntar a ${r.ipEsperada ?? "la IP del servidor"}`
        : "todavía no se ve el registro A",
    );
  }
  if (r.faltaTxt) faltan.push("todavía no se ve el registro TXT");
  return { error: `Sin verificar: ${faltan.join("; ")}. Si recién lo creaste, esperá unos minutos y volvé a probar.` };
}
