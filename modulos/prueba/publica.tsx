import Link from "next/link";
import type { PropsCabeceraPublica, PropsRutaPublica } from "@/nucleo/modulos/contrato";

export function PaginaPublica({ consulta }: PropsRutaPublica) {
  return (
    <>
      <h1 data-testid="modulo-prueba-publica">Módulo de prueba · sitio</h1>
      {/* Eco de la consulta: así llega, por ejemplo, la vuelta de una pasarela de pago. */}
      <p data-testid="eco">{consulta.getAll("eco").join(",")}</p>
    </>
  );
}

/**
 * Elemento de cabecera de ejemplo (el lugar del carrito). Solo un módulo puede aportarlo:
 * cuando exista la tienda, este se saca.
 */
export function CabeceraPrueba({ path }: PropsCabeceraPublica) {
  return (
    <Link href="/prueba" data-testid="cabecera-prueba" data-path={path} className="text-sm font-bold">
      Carrito (0)
    </Link>
  );
}
