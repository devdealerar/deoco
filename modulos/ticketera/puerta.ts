// Validación en la puerta. Siempre la decide el servidor, con un cambio condicional: dos
// teléfonos que escanean el mismo QR a la vez → uno "válida" y el otro "ya entró a las …".
// Con mala señal el teléfono reintenta el MISMO intento (mismo `intento`): si el primero llegó
// y se perdió la respuesta, el reintento responde "válida" otra vez, no "ya validada".
// Sin conexión no hay verde: nadie entra dos veces. El código está firmado (firma.ts).
import { conTenant } from "@/nucleo/db/con-tenant";
import { desdeAhora, esUuid } from "./eventos";
import { firmaValida, LARGO_FIRMADO, LARGO_VIEJO } from "./firma";

export type ResultadoValidacion =
  | { resultado: "valida"; nombre: string; documento: string; tipo: string }
  | { resultado: "ya-validada"; nombre: string; tipo: string; validadaEn: string }
  | { resultado: "otro-show"; show: string }
  | { resultado: "invalida" };

export const normalizarCodigo = (crudo: string) => crudo.toUpperCase().replace(/[^A-Z0-9]/g, "");
const INTENTO = /^[A-Za-z0-9-]{8,64}$/;

export async function validarEntrada(
  tenantId: string,
  eventoId: string,
  codigoCrudo: string,
  usuarioId: string,
  intento: string,
  ahora = new Date(),
): Promise<ResultadoValidacion> {
  const codigo = normalizarCodigo(codigoCrudo);
  if (!esUuid(eventoId) || !INTENTO.test(intento)) return { resultado: "invalida" };
  // La firma se verifica antes de tocar la base: uno inventado, o de otra banda, ni se busca.
  // Transición: los códigos de antes de la firma (10 caracteres, sin firma) se siguen buscando
  // mientras haya shows vendidos con ellos; un código nuevo nunca tiene ese largo.
  if (codigo.length === LARGO_FIRMADO ? !firmaValida(tenantId, codigo) : codigo.length !== LARGO_VIEJO) return { resultado: "invalida" };
  return conTenant(tenantId, async (tx) => {
    const e = await tx.ticketeraEntrada.findUnique({
      where: { tenantId_codigo: { tenantId, codigo } },
      include: { tipo: { select: { nombre: true } }, evento: { select: { nombre: true, fecha: true } }, compra: { select: { estado: true } } },
    });
    if (!e || e.compra.estado !== "PAGADA") return { resultado: "invalida" };
    if (e.eventoId !== eventoId) return { resultado: "otro-show", show: e.evento.nombre };
    const { count } = await tx.ticketeraEntrada.updateMany({
      where: { id: e.id, validadaEn: null },
      data: { validadaEn: ahora, validadaPor: usuarioId, validadaIntento: intento },
    });
    if (count === 1 || e.validadaIntento === intento) {
      return { resultado: "valida", nombre: e.nombre, documento: e.documento, tipo: e.tipo.nombre };
    }
    const ya = await tx.ticketeraEntrada.findUniqueOrThrow({ where: { id: e.id }, select: { validadaEn: true, validadaIntento: true } });
    if (ya.validadaIntento === intento) return { resultado: "valida", nombre: e.nombre, documento: e.documento, tipo: e.tipo.nombre };
    return { resultado: "ya-validada", nombre: e.nombre, tipo: e.tipo.nombre, validadaEn: ya.validadaEn!.toISOString() };
  });
}

export type ResumenPuerta = { vendidas: number; entraron: number; faltan: number; porTipo: { nombre: string; vendidas: number; entraron: number }[] };

/** Cuántos entraron y cuántos faltan (entradas pagadas), en total y por tipo. */
export async function resumenPuerta(tenantId: string, eventoId: string): Promise<ResumenPuerta> {
  if (!esUuid(eventoId)) return { vendidas: 0, entraron: 0, faltan: 0, porTipo: [] };
  return conTenant(tenantId, async (tx) => {
    const tipos = await tx.ticketeraTipo.findMany({ where: { eventoId }, select: { id: true, nombre: true }, orderBy: { precio: "asc" } });
    const filas = await tx.ticketeraEntrada.groupBy({ by: ["tipoId"], where: { eventoId }, _count: { _all: true } });
    const adentro = await tx.ticketeraEntrada.groupBy({ by: ["tipoId"], where: { eventoId, validadaEn: { not: null } }, _count: { _all: true } });
    const porTipo = tipos.map((t) => ({
      nombre: t.nombre,
      vendidas: filas.find((f) => f.tipoId === t.id)?._count._all ?? 0,
      entraron: adentro.find((f) => f.tipoId === t.id)?._count._all ?? 0,
    }));
    const vendidas = porTipo.reduce((s, t) => s + t.vendidas, 0);
    const entraron = porTipo.reduce((s, t) => s + t.entraron, 0);
    return { vendidas, entraron, faltan: vendidas - entraron, porTipo };
  });
}

/**
 * Shows con entradas vendidas que no terminaron (siguen a la vista hasta 6 h después de empezar).
 * Con la banda suspendida o archivada, la puerta sigue abierta solo para estos: el escaneo no se
 * corta por la cuota hasta que el show termina (documento maestro §14). Publicado o no.
 */
export async function showsConEntradasPorDelante(tenantId: string, ahora = new Date()): Promise<string[]> {
  const filas = await conTenant(tenantId, (tx) =>
    tx.ticketeraEvento.findMany({ where: { fecha: { gte: desdeAhora(ahora) }, entradas: { some: {} } }, select: { id: true } }),
  );
  return filas.map((f) => f.id);
}

/** La puerta (la lista) abre con la banda cerrada si hay al menos un show así. */
export const puertaAbiertaConBandaCerrada = async (tenantId: string) => (await showsConEntradasPorDelante(tenantId)).length > 0;

/** La puerta de un show abre con la banda cerrada si es uno de esos. */
export const puertaDeShowAbiertaConBandaCerrada = async (tenantId: string, params: Record<string, string>) =>
  esUuid(params.id ?? "") && (await showsConEntradasPorDelante(tenantId)).includes(params.id);
