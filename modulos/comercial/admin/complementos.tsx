import { catalogoDeCuenta } from "@/nucleo/cuenta";
import { formatearPesos, pesosParaCampo } from "@/nucleo/dinero";
import type { PropsRutaAdmin } from "@/nucleo/modulos/contrato";
import { Campo, Casilla, Formulario, Insignia, Selector, Tarjeta } from "@/ui";
import { listarComplementos } from "../complementos";
import { guardarComplementoAccion } from "./acciones";

function Campos({ c }: { c?: Awaited<ReturnType<typeof listarComplementos>>[number] }) {
  const limites = catalogoDeCuenta().limites.map((l) => ({ valor: l.id, texto: `${l.etiqueta} (${l.id})` }));
  return (
    <>
      {!c && <Campo name="id" etiqueta="Id" ayuda="Minúsculas, números y guiones: show-extra." required />}
      <Campo name="nombre" etiqueta="Nombre" defaultValue={c?.nombre} required />
      <Campo name="descripcion" etiqueta="Para qué sirve" defaultValue={c?.descripcion} />
      <Campo name="precio" etiqueta="Precio (pesos)" defaultValue={c ? pesosParaCampo(c.precio) : ""} required />
      <Selector name="limite" etiqueta="Suma a" defaultValue={c?.limite ?? limites[0]?.valor} opciones={limites} />
      <Campo name="cantidad" type="number" etiqueta="Cuánto suma" defaultValue={c ? String(c.cantidad) : "1"} required />
      <Campo name="meses" type="number" etiqueta="Meses que dura" ayuda="Meses calendario desde el que elige la banda (1 a 12)." defaultValue={c ? String(c.meses) : "1"} required />
      <Casilla name="activo" etiqueta="A la venta" marcada={c?.activo ?? true} />
    </>
  );
}

/** Back office · Complementos sueltos (3.2 núcleo d6): lo que la banda suma a un tope sin cambiar de plan. */
export async function AdminComplementos(_: PropsRutaAdmin) {
  const todos = await listarComplementos(false);
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-display-xs font-semibold text-primary">Complementos sueltos</h1>
        <p className="mt-1 text-md text-tertiary">
          Un evento puntual que se pasa del plan, sin cambiar de plan. La banda lo compra en Plan y pago (pago único a la cuenta de Deoco) y suma al tope
          del mes que elige. Cambiar el precio no toca lo ya comprado.
        </p>
      </header>
      {todos.map((c) => (
        <Tarjeta key={c.id} titulo={c.nombre} junto={c.activo ? undefined : <Insignia>No se vende</Insignia>} acciones={<span className="font-semibold">{formatearPesos(c.precio)}</span>} data-complemento={c.id}>
          <Formulario accion={guardarComplementoAccion.bind(null, c.id)} puedeEditar>
            <Campos c={c} />
          </Formulario>
        </Tarjeta>
      ))}
      <Tarjeta titulo="Nuevo complemento">
        <Formulario accion={guardarComplementoAccion.bind(null, null)} puedeEditar etiqueta="Crear" limpiarAlGuardar>
          <Campos />
        </Formulario>
      </Tarjeta>
    </div>
  );
}
