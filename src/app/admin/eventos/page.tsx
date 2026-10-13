import Link from "next/link";
import { Formulario, Tabla } from "@/ui";
import { exigirStaff } from "../_servidor/acceso";
import { listarFallidos } from "../_servidor/eventos";
import { reprocesarAccion } from "./acciones";

const FECHA = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

export default async function EventosFallidos() {
  await exigirStaff();
  const eventos = await listarFallidos();
  return (
    <Tabla
      titulo="Eventos fallidos"
      descripcion="De todas las bandas. Reprocesar vuelve a entregar el evento solo a los módulos que fallaron."
      columnas={[
        { id: "evento", etiqueta: "Evento" },
        { id: "banda", etiqueta: "Banda" },
        { id: "error", etiqueta: "Error" },
        { id: "accion", etiqueta: "" },
      ]}
      filas={eventos.map((e) => ({
        id: e.id,
        celdas: [
          <div key="e" data-evento={e.id}>
            <div className="font-medium text-primary">{e.nombre}</div>
            <div className="text-sm text-tertiary">
              {FECHA.format(e.fecha)} · {e.intentos} {e.intentos === 1 ? "intento" : "intentos"}
            </div>
          </div>,
          <Link key="b" href={`/admin/bandas/${e.tenant.slug}`} className="text-sm text-secondary hover:text-brand-secondary">
            {e.tenant.nombre}
          </Link>,
          <ul key="f" className="text-sm text-error-primary">
            {e.ultimosFallos.map((f) => (
              <li key={f.moduloId}>
                <span className="font-medium">{f.moduloId}:</span> {f.error}
              </li>
            ))}
          </ul>,
          <Formulario key="a" puedeEditar enLinea variante="secundario" accion={reprocesarAccion.bind(null, e.tenantId, e.id)} etiqueta="Reprocesar" />,
        ],
      }))}
    />
  );
}
