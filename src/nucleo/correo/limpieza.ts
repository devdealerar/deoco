// Limpieza de correos enviados: la tabla `correo` crece con cada venta (el de entradas lleva los
// QR, hasta ~30 KB). Una vez por día, en tandas: a los N días se vacían los adjuntos, a los M el
// cuerpo, y al año se borra la fila. Solo lo ENVIADO: lo pendiente o fallido sin resolver queda.
import { prisma } from "@/nucleo/db/cliente";

const DIA = 86_400_000;
export type PlazosCorreo = { adjuntos: number; cuerpo: number; borrar: number };

/** Plazos en días (DEOCO_CORREO_DIAS_ADJUNTOS / _CUERPO / _BORRAR). Lo inválido → el valor por defecto. */
export function plazosDeCorreo(env: Record<string, string | undefined> = process.env): PlazosCorreo {
  const leer = (k: string, def: number) => {
    const n = Number(env[k] ?? def);
    return Number.isInteger(n) && n >= 1 && n <= 3650 ? n : def;
  };
  const adjuntos = leer("DEOCO_CORREO_DIAS_ADJUNTOS", 7);
  const cuerpo = Math.max(adjuntos, leer("DEOCO_CORREO_DIAS_CUERPO", 90));
  const borrar = Math.max(cuerpo, leer("DEOCO_CORREO_DIAS_BORRAR", 365));
  return { adjuntos, cuerpo, borrar };
}

/** Una pasada (hasta `tandas` tandas de `tanda` filas por paso). Devuelve cuántas tocó. */
export async function limpiarCorreos(ahora = new Date(), plazos = plazosDeCorreo(), tanda = 5000, tandas = 20) {
  const total = { adjuntos: 0, cuerpos: 0, borrados: 0 };
  const antes = (dias: number) => new Date(ahora.getTime() - dias * DIA);
  for (let i = 0; i < tandas; i++) {
    const [r] = await prisma.$queryRaw<{ adjuntos: number; cuerpos: number; borrados: number }[]>`
      SELECT * FROM limpiar_correos(${antes(plazos.adjuntos)}::timestamp, ${antes(plazos.cuerpo)}::timestamp, ${antes(plazos.borrar)}::timestamp, ${tanda}::int)`;
    total.adjuntos += r.adjuntos;
    total.cuerpos += r.cuerpos;
    total.borrados += r.borrados;
    if (r.adjuntos < tanda && r.cuerpos < tanda && r.borrados < tanda) break;
  }
  return total;
}
