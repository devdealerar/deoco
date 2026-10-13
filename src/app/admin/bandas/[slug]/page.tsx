import Link from "next/link";
import { notFound } from "next/navigation";
import { dominiosDeBanda } from "@/nucleo/dominios";
import { registro } from "@/nucleo/modulos";
import { Campo, Casilla, Formulario, Insignia, Selector, Tabla, Tarjeta } from "@/ui";
import { ListaDominios } from "../../../_dominios/lista";
import { exigirStaff } from "../../_servidor/acceso";
import { detalleBanda } from "../../_servidor/bandas";
import {
  apagarAccion,
  dominioAccion,
  estadoAccion,
  invitarAccion,
  prenderAccion,
  principalAccion,
  quitarAccion,
  rolAccion,
  verificarAccion,
} from "./acciones";

const ESTADOS = [
  { valor: "ACTIVO", texto: "Activo" },
  { valor: "MOROSO", texto: "Moroso (aviso al titular)" },
  { valor: "SUSPENDIDO", texto: "Suspendido (panel cerrado salvo pago; sitio sigue)" },
  { valor: "ARCHIVADO", texto: "Archivado (panel y sitio dejan de responder)" },
];
const ROLES = ["TITULAR", "EDITOR", "COMERCIAL", "PUERTA", "LECTURA"].map((r) => ({ valor: r, texto: r }));
const COLOR_ESTADO = { ACTIVO: "exito", MOROSO: "advertencia", SUSPENDIDO: "error", ARCHIVADO: "gris" } as const;

export default async function Banda({ params }: { params: Promise<{ slug: string }> }) {
  const { usuarioId: staffId } = await exigirStaff();
  const { slug } = await params;
  const banda = await detalleBanda(slug);
  if (!banda) notFound();
  const id = banda.id;
  const prendidos = new Set(banda.modulos.map((m) => m.moduloId));
  const enLinea = { puedeEditar: true, enLinea: true, variante: "secundario" as const };

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin" className="text-sm font-semibold text-tertiary hover:text-secondary">
        ← Bandas
      </Link>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-display-xs font-semibold text-primary">{banda.nombre}</h1>
        <Insignia color={COLOR_ESTADO[banda.estado]}>{banda.estado}</Insignia>
        <Link href={`/b/${banda.slug}`} className="text-sm font-semibold text-brand-secondary">
          Abrir panel
        </Link>
      </header>

      <Tarjeta titulo="Estado" descripcion="Las reglas de cada estado las aplica el núcleo en cada pedido.">
        <Formulario accion={estadoAccion.bind(null, id)} puedeEditar etiqueta="Cambiar estado">
          <Selector name="estado" etiqueta="Estado" defaultValue={banda.estado} opciones={ESTADOS} />
          <Casilla name="confirmarArchivo" etiqueta="Si elijo Archivado: confirmo que el panel y el sitio de la banda van a dejar de responder." />
        </Formulario>
      </Tarjeta>

      <Tabla
        titulo="Módulos"
        descripcion="Prender y apagar respeta las dependencias entre módulos."
        columnas={[
          { id: "modulo", etiqueta: "Módulo" },
          { id: "depende", etiqueta: "Necesita" },
          { id: "estado", etiqueta: "Estado" },
          { id: "accion", etiqueta: "" },
        ]}
        filas={registro().modulos.map((m) => ({
          id: m.id,
          celdas: [
            <div key="m">
              <div className="font-medium text-primary">{m.nombre}</div>
              <div className="text-sm text-tertiary">{m.id}</div>
            </div>,
            <span key="d" className="text-sm text-tertiary">
              {m.dependencias?.length ? m.dependencias.join(", ") : "—"}
            </span>,
            prendidos.has(m.id) ? (
              <Insignia key="e" color="exito">
                Prendido
              </Insignia>
            ) : (
              <Insignia key="e">Apagado</Insignia>
            ),
            <div key="a" data-modulo={m.id}>
              {prendidos.has(m.id) ? (
                <Formulario {...enLinea} accion={apagarAccion.bind(null, id, m.id)} etiqueta="Apagar" />
              ) : (
                <Formulario {...enLinea} accion={prenderAccion.bind(null, id, m.id)} etiqueta="Prender" />
              )}
            </div>,
          ],
        }))}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-primary">Dominios</h2>
        <ListaDominios
          dominios={await dominiosDeBanda(id)}
          verificar={(d) => verificarAccion.bind(null, id, d)}
          principal={(d) => principalAccion.bind(null, id, d)}
          agregar={dominioAccion.bind(null, id)}
        />
      </section>

      <Tabla
        titulo="Miembros"
        descripcion="La banda no puede quedar sin titular."
        columnas={[
          { id: "persona", etiqueta: "Persona" },
          { id: "rol", etiqueta: "Rol" },
          { id: "quitar", etiqueta: "" },
        ]}
        filas={banda.membresias.map((m) => ({
          id: m.id,
          celdas: [
            <div key="p" data-email={m.usuario.email}>
              <div className="font-medium text-primary">{m.usuario.nombre}</div>
              <div className="text-sm text-tertiary">
                {m.usuario.email} {m.usuario.claveTemporal && <Insignia color="advertencia">Clave temporal</Insignia>}
              </div>
            </div>,
            <Formulario key="r" {...enLinea} accion={rolAccion.bind(null, id, m.id)} etiqueta="Cambiar">
              <Selector name="rol" etiqueta="Rol" defaultValue={m.rol} opciones={ROLES} />
            </Formulario>,
            <Formulario key="q" {...enLinea} variante="peligro" accion={quitarAccion.bind(null, id, m.id)} etiqueta="Quitar">
              <Casilla name="confirmar" etiqueta={m.usuario.id === staffId ? "Confirmo quitarme" : "Confirmo"} />
            </Formulario>,
          ],
        }))}
      />
      <Tarjeta titulo="Invitar a la banda" descripcion="Si no tiene usuario, se crea con una clave temporal que cambia en su primer ingreso.">
        <Formulario accion={invitarAccion.bind(null, id)} puedeEditar etiqueta="Invitar" limpiarAlGuardar>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo name="email" type="email" etiqueta="Email" required />
            <Campo name="nombre" etiqueta="Nombre" maxLength={120} ayuda="Solo si es un usuario nuevo." />
            <Selector name="rol" etiqueta="Rol" defaultValue="EDITOR" opciones={ROLES} />
          </div>
        </Formulario>
      </Tarjeta>
    </div>
  );
}
