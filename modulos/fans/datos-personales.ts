// Los datos de un fan en la base de la banda (D2: derechos del fan). Suprimir = anonimizar el
// contacto (sin email, nombre ni lugar; de baja del newsletter): no hay nada que la ley obligue a
// conservar acá. Las entregas quedan sin nadie detrás (para que los números de los envíos no cambien).
import { conTenant } from "@/nucleo/db/con-tenant";
import type { SeccionDeDatos } from "@/nucleo/modulos/contrato";

const fecha = (d: Date | null) => d?.toISOString() ?? null;

export async function buscarDatosFans(tenantId: string, email: string): Promise<SeccionDeDatos[]> {
  const c = await conTenant(tenantId, (tx) =>
    tx.fansContacto.findUnique({
      where: { tenantId_email: { tenantId, email: email.trim().toLowerCase() } },
      include: { entregas: { include: { envio: { select: { asunto: true } } }, orderBy: { enviadaEn: "desc" } } },
    }),
  );
  if (!c) return [];
  return [
    {
      titulo: "Base de fans y newsletter",
      filas: [
        {
          email: c.email,
          nombre: c.nombre,
          ciudad: c.ciudad,
          provincia: c.provincia,
          origen: c.origen,
          compras: c.compras,
          newsletter: c.newsletter,
          pidioRecibirlo: fecha(c.pedidoEn),
          textoQueAcepto: c.consentimiento,
          desde: c.consentimientoOrigen,
          confirmo: fecha(c.confirmadoEn),
          baja: fecha(c.bajaEn),
        },
      ],
    },
    {
      titulo: "Newsletters que le llegaron",
      filas: c.entregas.filter((e) => e.estado === "ENVIADA").map((e) => ({ asunto: e.envio.asunto, enviado: fecha(e.enviadaEn), abierto: fecha(e.abiertaEn) })),
    },
  ];
}

export async function suprimirDatosFans(tenantId: string, email: string): Promise<{ anonimizados: number; conservados: string[] }> {
  return conTenant(tenantId, async (tx) => {
    const c = await tx.fansContacto.findUnique({ where: { tenantId_email: { tenantId, email: email.trim().toLowerCase() } } });
    if (!c) return { anonimizados: 0, conservados: [] };
    await tx.fansContacto.update({
      where: { id: c.id },
      data: {
        email: `suprimido-${c.id}@invalid`,
        nombre: "",
        ciudad: "",
        provincia: "",
        newsletter: "baja",
        bajaEn: c.bajaEn ?? new Date(),
        consentimiento: null,
        consentimientoOrigen: null,
        confirmarHash: null,
        confirmarCifrado: null,
        confirmarVence: null,
        bajaHash: null,
        bajaCifrado: null,
      },
    });
    await tx.fansEntrega.updateMany({ where: { contactoId: c.id, estado: "PENDIENTE" }, data: { estado: "SALTEADA" } });
    return { anonimizados: 1, conservados: [] };
  });
}
