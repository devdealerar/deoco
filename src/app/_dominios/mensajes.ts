import type { ResultadoVerificacion } from "@/nucleo/dominios";

/** Lo que ve quien toca "Verificar". */
export function mensajeVerificacion(r: ResultadoVerificacion): { ok: string } | { error: string } {
  if (r.verificado) {
    return {
      ok: "Verificado: ya muestra el sitio. Cloudflare está emitiendo el certificado; en unos minutos vas a poder usarlo como principal.",
    };
  }
  if (r.sinRespuesta) return { error: "No pudimos consultar el estado del dominio. Probá de nuevo en un rato." };
  const faltan: string[] = [];
  if (r.faltaCname) faltan.push(`todavía no vemos el CNAME apuntando a ${r.destino}`);
  if (r.faltaTxt) faltan.push("todavía no se ve el registro TXT");
  return { error: `Sin verificar: ${faltan.join("; ")}. Si recién los creaste, esperá unos minutos y volvé a probar.` };
}
