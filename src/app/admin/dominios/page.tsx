import Link from "next/link";
import { Campo, Filtros, Formulario, Insignia, Selector, Tabla } from "@/ui";
import { exigirStaff } from "../_servidor/acceso";
import { cuantasAtencion, type FiltroCompras, listarCompras, vencenPronto } from "../_servidor/compras";
import { type ParametrosUrl, pagina, texto } from "../_servidor/listado";
import { reintentarAccion } from "./acciones";

const FECHA = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });
const DIA = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" });
const ESTADOS = ["atencion", "en-curso", "datos", "listo", "fallido"] as const;
const PASOS: Record<string, string> = {
  cliente: "Subcuenta",
  registrar: "Registrando",
  zona: "Zona",
  nameservers: "Nameservers",
  activacion: "Esperando la activación",
  principal: "Principal",
  renovar: "Renovando",
  listo: "Listo",
};

/** Dominios comprados: compras y renovaciones de todas las bandas; lo que necesita al staff; lo que vence. */
export default async function DominiosComprados({ searchParams }: { searchParams: Promise<ParametrosUrl> }) {
  await exigirStaff();
  const p = await searchParams;
  const estado = texto(p, "estado");
  const filtro: FiltroCompras = {
    estado: (ESTADOS as readonly string[]).includes(estado) ? (estado as FiltroCompras["estado"]) : undefined,
    banda: texto(p, "banda") || undefined,
    pagina: pagina(p),
  };
  const [{ filas, ...paginacion }, atencion, vencen] = await Promise.all([listarCompras(filtro), cuantasAtencion(), vencenPronto()]);
  const banda = (t: { nombre: string; slug: string }) => (
    <Link href={`/admin/bandas/${t.slug}`} className="text-sm text-secondary hover:text-brand-secondary">
      {t.nombre}
    </Link>
  );
  return (
    <div className="flex flex-col gap-6">
      <Filtros>
        <Campo type="search" name="banda" etiqueta="Banda" placeholder="Nombre o slug" defaultValue={filtro.banda} />
        <Selector
          name="estado"
          etiqueta="Estado"
          defaultValue={filtro.estado ?? ""}
          opciones={[
            { valor: "", texto: "Todas" },
            { valor: "atencion", texto: `Necesitan atención (${atencion})` },
            { valor: "en-curso", texto: "En curso" },
            { valor: "datos", texto: "Esperando datos de la banda" },
            { valor: "listo", texto: "Listas" },
            { valor: "fallido", texto: "Fallidas" },
          ]}
        />
      </Filtros>
      <Tabla
        titulo="Dominios comprados"
        descripcion={`Compras y renovaciones, las más recientes primero. Necesitan atención: ${atencion} (sin saldo en el registrador, errores que no son pasajeros, muchos intentos, datos de la banda o una devolución pendiente).`}
        paginacion={paginacion}
        columnas={[
          { id: "dominio", etiqueta: "Dominio" },
          { id: "banda", etiqueta: "Banda" },
          { id: "estado", etiqueta: "Estado" },
          { id: "error", etiqueta: "Último error" },
          { id: "accion", etiqueta: "" },
        ]}
        filas={filas.map((c) => ({
          id: c.id,
          celdas: [
            <div key="d" data-compra={c.id}>
              <div className="font-medium text-primary">{c.dominio}</div>
              <div className="text-sm text-tertiary">
                {c.tipo === "alta" ? "Compra" : "Renovación"} · {FECHA.format(c.creadoEn)}
                {c.venceEn && ` · vence ${DIA.format(c.venceEn)}`}
              </div>
            </div>,
            <div key="b">{banda(c.tenant)}</div>,
            <div key="e" className="flex flex-col items-start gap-1">
              {c.estado === "listo" ? (
                <Insignia color="exito">Lista</Insignia>
              ) : c.estado === "fallido" ? (
                <Insignia color="error">
                  {c.devolucion === "pendiente" ? "Fallida · devolución sin pedir al cobro" : c.devolucion === "pedida" ? "Fallida · devolución pedida" : "Fallida"}
                </Insignia>
              ) : c.estado === "datos" ? (
                <Insignia color="advertencia">Esperando datos ({c.campo ?? "?"})</Insignia>
              ) : (
                <Insignia color={c.motivo ? "advertencia" : "gris"}>{PASOS[c.paso] ?? c.paso}</Insignia>
              )}
              {c.intentos > 0 && <span className="text-xs text-tertiary">{c.intentos} intentos</span>}
            </div>,
            <div key="x" className="max-w-sm text-sm text-error-primary">
              {c.motivo && <span className="font-medium">{c.motivo}: </span>}
              {c.error}
            </div>,
            c.estado === "en-curso" ? (
              <Formulario key="a" puedeEditar enLinea variante="secundario" accion={reintentarAccion.bind(null, c.tenantId, c.id)} etiqueta="Reintentar" />
            ) : (
              <span key="a" />
            ),
          ],
        }))}
      />
      <Tabla
        titulo="Vencen en 30 días"
        descripcion="Dominios comprados en Deoco que vencen pronto. Deoco nunca los renueva sin que la banda pague."
        columnas={[
          { id: "dominio", etiqueta: "Dominio" },
          { id: "banda", etiqueta: "Banda" },
          { id: "vence", etiqueta: "Vence" },
        ]}
        filas={vencen.map((c) => ({
          id: c.id,
          celdas: [
            <span key="d" className="font-medium text-primary">
              {c.dominio}
            </span>,
            <div key="b">{banda(c.tenant)}</div>,
            <span key="v" className="text-sm">
              {DIA.format(c.venceEn!)}
            </span>,
          ],
        }))}
      />
    </div>
  );
}
