// Lo que rodea a toda página pública de una banda: las pestañas de los módulos prendidos y el
// elemento de cabecera (si un módulo prendido lo aporta). Lo usa la superficie pública y lo
// puede usar la vista previa del módulo que aporta el marco, para mostrar exactamente lo mismo.
import type { ReactNode } from "react";
import { registro as registroGlobal } from "@/nucleo/modulos";
import { modulosPrendidos } from "@/nucleo/modulos/encendido";
import { type ItemNavegacion, pestanasSitio } from "@/nucleo/modulos/navegacion";
import type { Registro } from "@/nucleo/modulos/registro";

export type ElementosDelMarco = {
  prendidos: Set<string>;
  /** Con el módulo de cada una (la vista previa traduce las suyas a sus propias rutas). */
  pestanas: ItemNavegacion[];
  cabecera: ReactNode;
};

/** Pestañas y cabecera de la banda para `path` (una ruta pública: "/", "/prensa"…). */
export async function elementosDelMarco(tenantId: string, path: string, reg: Registro = registroGlobal()): Promise<ElementosDelMarco> {
  const prendidos = await modulosPrendidos(tenantId, reg);
  const Cabecera = reg.cabeceraPublica && prendidos.has(reg.cabeceraPublica.moduloId) ? reg.cabeceraPublica.componente : null;
  return { prendidos, pestanas: pestanasSitio(reg, prendidos), cabecera: Cabecera ? <Cabecera tenantId={tenantId} path={path} /> : null };
}
