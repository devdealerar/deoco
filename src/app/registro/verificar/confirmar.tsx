"use client";

import { useEffect, useRef, useState } from "react";
import { Aviso, Boton } from "@/ui";

/**
 * Lee el token del link del mail (después de "#": nunca llega a un servidor ni queda en logs),
 * lo manda con `confirmar` y lo saca de la barra de direcciones.
 */
export function Confirmar({ confirmar }: { confirmar: (token: string) => Promise<boolean> }) {
  const [estado, setEstado] = useState<"esperando" | "ok" | "mal">("esperando");
  const hecho = useRef(false); // el token se usa una sola vez (en desarrollo, el efecto corre dos)
  useEffect(() => {
    if (hecho.current) return;
    hecho.current = true;
    const token = window.location.hash.slice(1);
    window.history.replaceState(null, "", window.location.pathname);
    const valido = /^[0-9a-f]{64}$/.test(token);
    void (valido ? confirmar(token) : Promise.resolve(false)).then((ok) => setEstado(ok ? "ok" : "mal"));
  }, [confirmar]);
  if (estado === "esperando") return <p className="text-tertiary">Confirmando tu email…</p>;
  if (estado === "mal") {
    return (
      <div className="flex flex-col gap-4">
        <Aviso tono="error" titulo="Este link ya no sirve.">
          Puede que haya vencido (dura 24 horas) o que ya lo hayas usado. Si ya confirmaste tu email, ingresá; si no, registrate de nuevo y te mandamos otro.
        </Aviso>
        <Boton href="/ingresar">Ingresar</Boton>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4" data-testid="email-confirmado">
      <Aviso tono="info" titulo="¡Listo! Tu email quedó confirmado.">
        Ingresá con tu email y tu contraseña para crear tu banda.
      </Aviso>
      <Boton href="/ingresar?volver=/registro/banda">Ingresar</Boton>
    </div>
  );
}
