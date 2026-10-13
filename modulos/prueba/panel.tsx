import type { PropsRutaPanel } from "@/nucleo/modulos/contrato";
import { leerSecreto } from "@/nucleo/secretos";
import { emitirVerificacion } from "./acciones";
import prueba from "./index";

export async function PaginaPanel({ tenantId, acceso, slug, consulta }: PropsRutaPanel) {
  // El módulo lee SU secreto pasando su propio contrato. El valor no sale al navegador.
  const token = await leerSecreto(prueba, tenantId, "token");
  return (
    <main>
      <h1 data-testid="modulo-prueba-panel">Módulo de prueba · panel</h1>
      <p>Rol: {acceso.rol ?? "—"}</p>
      <p data-testid="token">{token ? `token cargado (${token.length} caracteres)` : "sin token"}</p>
      <p data-testid="eco">{consulta.getAll("eco").join(",")}</p>
      <form action={emitirVerificacion.bind(null, slug)}>
        <button type="submit">Emitir evento de prueba</button>
      </form>
    </main>
  );
}
