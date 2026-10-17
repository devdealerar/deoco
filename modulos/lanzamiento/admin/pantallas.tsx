import type { PropsRutaAdmin } from "@/nucleo/modulos/contrato";
import { Campo, Casilla, Formulario, Insignia, Tarjeta } from "@/ui";
import { formatos, tareasBase } from "../campanias";
import { guardarFormatoAccion, guardarTareaAccion } from "./acciones";

type Tarea = Awaited<ReturnType<typeof tareasBase>>[number];
type Formato = Awaited<ReturnType<typeof formatos>>[number];

function CamposTarea({ t }: { t?: Tarea }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {!t && <Campo name="clave" etiqueta="Clave" ayuda="Minúsculas, números y guiones." required />}
      <Campo name="titulo" etiqueta="Título" defaultValue={t?.titulo} required />
      <Campo name="descripcion" etiqueta="Descripción" defaultValue={t?.descripcion} />
      <Campo name="dias" type="number" etiqueta="Días desde el lanzamiento" ayuda="Negativo: antes (-45). 0: el día." defaultValue={t ? String(t.dias) : "0"} required />
      <Campo name="dependeDe" etiqueta="Depende de (claves, con coma)" defaultValue={t?.dependeDe.join(", ")} />
      <Campo name="orden" type="number" etiqueta="Orden" defaultValue={t ? String(t.orden) : "0"} required />
      <Casilla name="activa" etiqueta="Activa" marcada={t?.activa ?? true} />
    </div>
  );
}

function CamposFormato({ f }: { f?: Formato }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {!f && <Campo name="id" etiqueta="Id" ayuda="Minúsculas, números y guiones." required />}
      <Campo name="plataforma" etiqueta="Plataforma" defaultValue={f?.plataforma} required />
      <Campo name="pieza" etiqueta="Pieza" defaultValue={f?.pieza} required />
      <Campo name="ancho" type="number" etiqueta="Ancho (px)" defaultValue={f ? String(f.ancho) : ""} required />
      <Campo name="alto" type="number" etiqueta="Alto (px)" defaultValue={f ? String(f.alto) : ""} required />
      <Campo name="orden" type="number" etiqueta="Orden" defaultValue={f ? String(f.orden) : "0"} required />
      <Campo name="notas" etiqueta="Notas" defaultValue={f?.notas} />
      <Casilla name="activo" etiqueta="Activo" marcada={f?.activo ?? true} />
    </div>
  );
}

/** Back office · Lanzamientos: la plantilla del cronograma y las medidas de las piezas (3.2: sin tocar código). */
export async function AdminLanzamiento(_: PropsRutaAdmin) {
  const [tareas, piezas] = await Promise.all([tareasBase(), formatos()]);
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-display-xs font-semibold text-primary">Lanzamientos: plantilla y medidas</h1>
        <p className="mt-1 text-md text-tertiary">Lo que se copia al armar cada campaña. Cambiarlo no toca las campañas que ya existen.</p>
      </header>
      <h2 className="text-lg font-semibold text-primary">Medidas de las piezas</h2>
      {piezas.map((f) => (
        <Tarjeta key={f.id} titulo={`${f.plataforma} · ${f.pieza}`} junto={f.activo ? undefined : <Insignia>Inactiva</Insignia>} acciones={<span className="tabular-nums">{f.ancho}×{f.alto}</span>} data-formato={f.id}>
          <Formulario accion={guardarFormatoAccion.bind(null, f.id)} puedeEditar>
            <CamposFormato f={f} />
          </Formulario>
        </Tarjeta>
      ))}
      <Tarjeta titulo="Nueva medida">
        <Formulario accion={guardarFormatoAccion.bind(null, null)} puedeEditar etiqueta="Crear" limpiarAlGuardar>
          <CamposFormato />
        </Formulario>
      </Tarjeta>
      <h2 className="text-lg font-semibold text-primary">Tareas del cronograma</h2>
      {tareas.map((t) => (
        <Tarjeta key={t.clave} titulo={t.titulo} junto={t.activa ? undefined : <Insignia>Inactiva</Insignia>} acciones={<span className="tabular-nums">{t.dias} d</span>} data-tarea={t.clave}>
          <Formulario accion={guardarTareaAccion.bind(null, t.clave)} puedeEditar>
            <CamposTarea t={t} />
          </Formulario>
        </Tarjeta>
      ))}
      <Tarjeta titulo="Nueva tarea">
        <Formulario accion={guardarTareaAccion.bind(null, null)} puedeEditar etiqueta="Crear" limpiarAlGuardar>
          <CamposTarea />
        </Formulario>
      </Tarjeta>
    </div>
  );
}
