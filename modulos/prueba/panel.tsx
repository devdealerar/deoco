import type { PropsRutaPanel } from "@/nucleo/modulos/contrato";

export function PaginaPanel({ acceso }: PropsRutaPanel) {
  return (
    <main>
      <h1 data-testid="modulo-prueba-panel">Módulo de prueba · panel</h1>
      <p>Rol: {acceso.rol ?? "—"}</p>
    </main>
  );
}
