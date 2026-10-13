import { ErrorEvento, reprocesarEvento } from "@/nucleo/eventos/bus";
import { ErrorFormulario } from "@/ui/servidor";
import { auditar } from "./auditoria";
import { dbAdmin } from "./db";

export type Fallo = { intento: number; moduloId: string; error: string; fecha: string };

/** Eventos FALLIDOS de todas las bandas, los más recientes primero. */
export async function listarFallidos() {
  const eventos = await dbAdmin().evento.findMany({
    where: { estado: "FALLIDO" },
    orderBy: { fecha: "desc" },
    take: 200,
    include: { tenant: { select: { nombre: true, slug: true } } },
  });
  return eventos.map((e) => ({
    ...e,
    ultimosFallos: (e.fallos as Fallo[]).filter((f) => f.intento === e.intentos),
  }));
}

/** Vuelve a entregar un evento fallido (solo a quien falló). Queda en la auditoría. */
export async function reprocesar(staffId: string, tenantId: string, eventoId: string) {
  try {
    await reprocesarEvento(tenantId, eventoId, {
      registrar: (tx) => auditar(tx, { usuarioId: staffId, tenantId, accion: "evento.reprocesado", detalle: { eventoId } }),
    });
  } catch (e) {
    if (e instanceof ErrorEvento) throw new ErrorFormulario(e.message);
    throw e;
  }
  const evento = await dbAdmin().evento.findUnique({ where: { id: eventoId }, select: { estado: true } });
  return evento?.estado;
}
