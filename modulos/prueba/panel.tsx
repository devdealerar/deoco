import type { PropsRutaPanel } from "@/nucleo/modulos/contrato";
import { emitirVerificacion } from "./acciones";

export function PaginaPanel({ acceso, slug }: PropsRutaPanel) {
  return (
    <main>
      <h1 data-testid="modulo-prueba-panel">Módulo de prueba · panel</h1>
      <p>Rol: {acceso.rol ?? "—"}</p>
      <form action={emitirVerificacion.bind(null, slug)}>
        <button type="submit">Emitir evento de prueba</button>
      </form>
    </main>
  );
}
