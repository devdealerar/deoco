// Registros DNS en formato de archivo de zona (BIND): lo que muchos proveedores dejan importar
// de una vez. Sin dependencias: lo usa también la pantalla de dominios.
import type { RegistroDns } from "./proveedor";

/** Un registro por línea: `nombre. 300 IN TIPO [prioridad] valor`. */
export function enFormatoBind(registros: (RegistroDns & { prioridad?: number })[]): string {
  return registros
    .map((r) => {
      const valor = r.tipo === "TXT" ? `"${r.valor.replace(/"/g, '\\"')}"` : r.tipo === "CNAME" || r.tipo === "MX" ? `${r.valor}.` : r.valor;
      return `${r.nombre}.\t300\tIN\t${r.tipo}\t${r.prioridad !== undefined ? `${r.prioridad} ` : ""}${valor}`;
    })
    .join("\n");
}

