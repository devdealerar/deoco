// Medición de uso por banda: lo que cuenta cada módulo (`mediciones` en su contrato) y los
// archivos, que cuenta el núcleo. No limita nada: es para ver el uso real (en /admin) y poner
// topes buenos después.
import { conTenant } from "@/nucleo/db/con-tenant";
import { registro as registroGlobal } from "@/nucleo/modulos";
import type { Registro } from "@/nucleo/modulos/registro";

export type Medida = { clave: string; etiqueta: string; valor: number; moduloId: string | null };

export async function medicionDeBanda(tenantId: string, reg: Registro = registroGlobal()): Promise<Medida[]> {
  const archivos = await conTenant(tenantId, (tx) => tx.archivo.aggregate({ _count: { _all: true }, _sum: { bytes: true } }));
  const deModulos = await Promise.all(
    reg.modulos.flatMap((m) =>
      (m.mediciones ?? []).map(async (md) => ({ clave: md.clave, etiqueta: md.etiqueta, valor: await md.medir(tenantId), moduloId: m.id })),
    ),
  );
  return [
    ...deModulos,
    { clave: "nucleo.archivos", etiqueta: "Archivos", valor: archivos._count._all, moduloId: null },
    { clave: "nucleo.almacenamiento", etiqueta: "Espacio usado (bytes)", valor: Number(archivos._sum.bytes ?? 0), moduloId: null },
  ];
}
