// El roster del manager (D7; 3.2 manager d1 y d2): las bandas donde la persona es parte (la
// invitaron; la banda la saca cuando quiere y el acceso cesa al instante). De cada una, SOLO
// números agregados que la propia banda ofrece (consultas de sus módulos): ventas, fechas,
// lanzamientos, cuántos fans. Nunca quiénes: las bases no se cruzan ni se juntan.
import { bandasVisibles } from "@/nucleo/acceso/bandas";
import { consultar } from "@/nucleo/consultas";
import { bloquesDeInicio } from "@/nucleo/inicio";
import { mesArgentino } from "@/nucleo/fechas";

export type BandaDelRoster = { tenantId: string; slug: string; nombre: string; estado: string; rol: string | null };

/** Las bandas del roster: donde la persona tiene membresía (no las que ve solo por ser staff). */
export async function roster(usuarioId: string): Promise<BandaDelRoster[]> {
  return (await bandasVisibles(usuarioId)).filter((b) => !b.accesoStaff && b.estado !== "ARCHIVADO").map((b) => ({ tenantId: b.tenantId, slug: b.slug, nombre: b.nombre, estado: b.estado, rol: b.rol }));
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const obj = (r: unknown) => (r && typeof r === "object" && !Array.isArray(r) ? (r as Record<string, unknown>) : {});

export type Metricas = { pedidos: number; ventasTienda: number; entradas: number; ventasEntradas: number; contactos: number; suscriptos: number; showsDelMes: number };

/** Los números de una banda en un mes (hora argentina). Lo que un módulo apagado no responde, 0. */
export async function metricasDelMes(tenantId: string, mes: Date): Promise<Metricas> {
  const { desde, hasta } = mesArgentino(mes);
  const periodo = { desde: desde.toISOString(), hasta: hasta.toISOString() };
  const [tienda, entradas, fans, fechas] = await Promise.all([
    consultar(tenantId, "tienda.ventas", periodo, { vacio: {}, interpretar: obj }),
    consultar(tenantId, "ticketera.ventas", periodo, { vacio: {}, interpretar: obj }),
    consultar(tenantId, "fans.resumen", {}, { vacio: {}, interpretar: obj }),
    consultar(tenantId, "ticketera.proximas-fechas", { limite: 50 }, { vacio: [] as { fecha: string }[], interpretar: (r) => (Array.isArray(r) ? (r as { fecha: string }[]) : []) }),
  ]);
  return {
    pedidos: num(tienda.pedidos),
    ventasTienda: num(tienda.total),
    entradas: num(entradas.entradas),
    ventasEntradas: num(entradas.total),
    contactos: num(fans.contactos),
    suscriptos: num(fans.suscriptos),
    showsDelMes: fechas.filter((f) => {
      const d = new Date(f.fecha);
      return d >= desde && d < hasta;
    }).length,
  };
}

export type Fecha = { cuando: Date; tipo: "show" | "lanzamiento"; titulo: string; detalle: string; banda: BandaDelRoster };

/** El calendario unificado: shows y lanzamientos de todo el roster, por fecha. */
export async function calendario(bandas: BandaDelRoster[], ahora = new Date(), dias = 120): Promise<Fecha[]> {
  const hasta = new Date(ahora.getTime() + dias * 86_400_000);
  const porBanda = await Promise.all(
    bandas.map(async (b) => {
      const [shows, lanzamientos] = await Promise.all([
        consultar(b.tenantId, "ticketera.proximas-fechas", { limite: 50 }, { vacio: [] as Record<string, unknown>[], interpretar: (r) => (Array.isArray(r) ? (r as Record<string, unknown>[]) : []) }),
        consultar(b.tenantId, "lanzamiento.proximos", {}, { vacio: [] as Record<string, unknown>[], interpretar: (r) => (Array.isArray(r) ? (r as Record<string, unknown>[]) : []) }),
      ]);
      return [
        ...shows.map((s): Fecha => ({ cuando: new Date(String(s.fecha)), tipo: "show", titulo: String(s.nombre ?? ""), detalle: `${String(s.lugar ?? "")}, ${String(s.ciudad ?? "")}${s.agotado ? " · agotado" : ""}`, banda: b })),
        ...lanzamientos.map((l): Fecha => ({ cuando: new Date(String(l.fecha)), tipo: "lanzamiento", titulo: String(l.titulo ?? ""), detalle: num(l.atrasados) ? `${num(l.atrasados)} hitos atrasados` : "al día", banda: b })),
      ];
    }),
  );
  return porBanda
    .flat()
    .filter((f) => !Number.isNaN(f.cuando.getTime()) && f.cuando <= hasta)
    .sort((a, b) => a.cuando.getTime() - b.cuando.getTime());
}

/** Lo que pide atención en una banda: su estado de cuenta y los pendientes del inicio de su panel. */
export async function alertas(b: BandaDelRoster): Promise<string[]> {
  const estado: Record<string, string> = {
    MOROSO: "Tiene una cuota pendiente.",
    MOROSO_GRAVE: "Tiene la cuota impaga hace más de 15 días.",
    SOLO_LECTURA: "Su panel está en solo lectura por la cuota.",
    SUSPENDIDO: "Está suspendida por la cuota: su sitio no se ve.",
  };
  const bloques = await bloquesDeInicio(b.tenantId, async () => true).catch(() => []);
  return [...(estado[b.estado] ? [estado[b.estado]] : []), ...bloques.flatMap((x) => x.pendientes.map((p) => p.texto))];
}
