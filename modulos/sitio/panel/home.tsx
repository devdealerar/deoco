import { conTenant } from "@/nucleo/db/con-tenant";
import type { PropsRutaPanel } from "@/nucleo/modulos/contrato";
import { AreaTexto, Campo, CampoArchivo, Formulario, Selector, Tarjeta } from "@/ui";
import {
  agregarFecha,
  agregarLink,
  agregarSlide,
  borrarFecha,
  borrarLink,
  borrarSlide,
  guardarBioCorta,
  moverLink,
  moverSlide,
} from "../acciones";
import { Encabezado, Miniatura, puedeEditar as puedeEditarEn } from "./comun";

const FECHA = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "UTC" });

function Item({ children, acciones }: { children: React.ReactNode; acciones: React.ReactNode }) {
  return (
    <li className="flex items-center gap-4 py-3">
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex shrink-0 items-center gap-1">{acciones}</div>
    </li>
  );
}

export async function HomePanel({ tenantId, slug }: PropsRutaPanel) {
  const [datos, puedeEditar] = await Promise.all([
    // En serie dentro de la transacción (una sola conexión).
    conTenant(tenantId, async (tx) => ({
      perfil: await tx.sitioPerfil.findUnique({ where: { tenantId } }),
      slides: await tx.sitioSlide.findMany({ orderBy: { orden: "asc" } }),
      fechas: await tx.sitioFecha.findMany({ orderBy: { fecha: "asc" } }),
      links: await tx.sitioLink.findMany({ orderBy: { orden: "asc" } }),
      archivos: await tx.archivo.findMany({ where: { moduloId: "sitio" }, select: { id: true, nombre: true, tipo: true } }),
    })),
    puedeEditarEn(slug),
  ]);
  const archivo = (id: string) => datos.archivos.find((a) => a.id === id);
  const p = { puedeEditar, enLinea: true, variante: "secundario" as const };

  return (
    <div className="flex flex-col gap-6">
      <Encabezado slug={slug} actual="/home" puedeEditar={puedeEditar} />

      <Tarjeta titulo="Bio corta" descripcion="Dos o tres líneas. La bio larga va en el press kit.">
        <Formulario accion={guardarBioCorta.bind(null, slug)} puedeEditar={puedeEditar}>
          <AreaTexto name="bioCorta" etiqueta="Bio corta" maxLength={400} defaultValue={datos.perfil?.bioCorta ?? ""} />
        </Formulario>
      </Tarjeta>

      <Tarjeta titulo="Slider de imágenes" descripcion="Se muestran livianas, para que el sitio cargue rápido en el celular.">
        {datos.slides.length > 0 && (
          <ul className="mb-5 divide-y divide-secondary">
            {datos.slides.map((s, i) => {
              const a = archivo(s.archivoId);
              return (
                <Item
                  key={s.id}
                  acciones={
                    <>
                      {i > 0 && <Formulario {...p} accion={moverSlide.bind(null, slug, s.id, "arriba")} etiqueta="↑" />}
                      {i < datos.slides.length - 1 && <Formulario {...p} accion={moverSlide.bind(null, slug, s.id, "abajo")} etiqueta="↓" />}
                      <Formulario {...p} accion={borrarSlide.bind(null, slug, s.id)} etiqueta="Quitar" />
                    </>
                  }
                >
                  <div className="flex items-center gap-3">
                    {a && <Miniatura slug={slug} archivo={a} />}
                    <span className="truncate text-sm text-secondary">{s.textoAlt || a?.nombre}</span>
                  </div>
                </Item>
              );
            })}
          </ul>
        )}
        <Formulario accion={agregarSlide.bind(null, slug)} puedeEditar={puedeEditar} etiqueta="Agregar imagen">
          <CampoArchivo name="imagen" etiqueta="Imagen" accept="image/jpeg,image/png,image/webp" required />
          <Campo name="textoAlt" etiqueta="Descripción (para lectores de pantalla)" maxLength={200} />
        </Formulario>
      </Tarjeta>

      <Tarjeta titulo="Próximas fechas" descripcion="Cargadas a mano. La home muestra solo las que vienen.">
        {datos.fechas.length > 0 && (
          <ul className="mb-5 divide-y divide-secondary">
            {datos.fechas.map((f) => (
              <Item key={f.id} acciones={<Formulario {...p} accion={borrarFecha.bind(null, slug, f.id)} etiqueta="Quitar" />}>
                <span className="text-sm font-medium text-primary">{FECHA.format(f.fecha)}</span>
                <span className="text-sm text-tertiary">
                  {" "}
                  · {f.lugar}, {f.ciudad}
                </span>
              </Item>
            ))}
          </ul>
        )}
        <Formulario accion={agregarFecha.bind(null, slug)} puedeEditar={puedeEditar} etiqueta="Agregar fecha">
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo name="fecha" type="date" etiqueta="Fecha" required />
            <Campo name="lugar" etiqueta="Lugar" required maxLength={200} />
            <Campo name="ciudad" etiqueta="Ciudad" required maxLength={200} />
          </div>
          <Campo name="link" type="url" etiqueta="Link a entradas (opcional)" placeholder="https://" />
        </Formulario>
      </Tarjeta>

      <Tarjeta titulo="Links" descripcion="Redes y plataformas de escucha.">
        {datos.links.length > 0 && (
          <ul className="mb-5 divide-y divide-secondary">
            {datos.links.map((l, i) => (
              <Item
                key={l.id}
                acciones={
                  <>
                    {i > 0 && <Formulario {...p} accion={moverLink.bind(null, slug, l.id, "arriba")} etiqueta="↑" />}
                    {i < datos.links.length - 1 && <Formulario {...p} accion={moverLink.bind(null, slug, l.id, "abajo")} etiqueta="↓" />}
                    <Formulario {...p} accion={borrarLink.bind(null, slug, l.id)} etiqueta="Quitar" />
                  </>
                }
              >
                <span className="text-sm font-medium text-primary">{l.plataforma}</span>
                <span className="text-sm text-tertiary"> · {l.tipo === "RED" ? "red" : "escucha"} · {l.url}</span>
              </Item>
            ))}
          </ul>
        )}
        <Formulario accion={agregarLink.bind(null, slug)} puedeEditar={puedeEditar} etiqueta="Agregar link">
          <div className="grid gap-4 sm:grid-cols-3">
            <Selector
              name="tipo"
              etiqueta="Tipo"
              opciones={[
                { valor: "ESCUCHA", texto: "Plataforma de escucha" },
                { valor: "RED", texto: "Red social" },
              ]}
            />
            <Campo name="plataforma" etiqueta="Plataforma" placeholder="Spotify" required maxLength={60} />
            <Campo name="url" type="url" etiqueta="Link" placeholder="https://" required />
          </div>
        </Formulario>
      </Tarjeta>
    </div>
  );
}
