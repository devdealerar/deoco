"use client";

import { useState, useTransition } from "react";
import { pagarAccion } from "./acciones";
import { c } from "@/nucleo/publico/estilo";

/** Reintentar el pago de un pedido pendiente: crea un cobro nuevo y va a la pasarela. */
export function Pagar({ pedidoId }: { pedidoId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className={c.boton}
        disabled={pendiente}
        onClick={() =>
          empezar(async () => {
            const r = await pagarAccion(pedidoId);
            if (r.redireccion) window.location.assign(r.redireccion);
            else setError(r.error ?? "No pudimos abrir el pago. Probá de nuevo en un rato: no se te cobró nada.");
          })
        }
      >
        {pendiente ? "Yendo a pagar…" : "Pagar"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
