import type { PropsRutaPublica } from "@/nucleo/modulos/contrato";

export function PaginaPublica({ consulta }: PropsRutaPublica) {
  return (
    <>
      <h1 data-testid="modulo-prueba-publica">Módulo de prueba · sitio</h1>
      {/* Eco de la consulta: así llega, por ejemplo, la vuelta de una pasarela de pago. */}
      <p data-testid="eco">{consulta.getAll("eco").join(",")}</p>
    </>
  );
}

