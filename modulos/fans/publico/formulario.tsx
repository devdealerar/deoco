"use client";

import { enviarSinBorrar } from "@/nucleo/publico/sin-borrar";
import { useActionState, useEffect, useState } from "react";
import { c } from "@/nucleo/publico/estilo";
import { suscribirseAccion, type EstadoSuscripcion } from "./acciones";

/** Formulario de novedades: email, nombre (opcional) y la casilla sin marcar. */
export function FormularioNovedades({ consentimiento }: { consentimiento: string }) {
  const [estado, enviar, pendiente] = useActionState<EstadoSuscripcion, FormData>(suscribirseAccion, {});
  if (estado.ok) {
    return (
      <p role="status" className={c.aviso} data-novedades-pedido>
        Listo. Te mandamos un mail para confirmar: hasta que abras ese link no te llega nada.
      </p>
    );
  }
  return (
    <form action={enviar} onSubmit={enviarSinBorrar(enviar)} className="flex max-w-md flex-col gap-4" data-novedades>
      <label className="flex flex-col gap-1 text-sm font-bold">
        Email
        <input name="email" type="email" autoComplete="email" required defaultValue={estado.email} className={c.campo} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-bold">
        Nombre (opcional)
        <input name="nombre" autoComplete="given-name" defaultValue={estado.nombre} className={c.campo} />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="acepto" value="si" className="mt-1" />
        <span>{consentimiento}</span>
      </label>
      {estado.error && (
        <p role="alert" className={c.aviso}>
          {estado.error}
        </p>
      )}
      <button type="submit" className={c.boton} disabled={pendiente}>
        {pendiente ? "Enviando…" : "Suscribirme"}
      </button>
    </form>
  );
}

/**
 * Lee el token del link del mail (después de "#": nunca llega a un servidor ni a un tercero), lo
 * canjea con `canjear` y muestra el resultado. Para confirmar la suscripción y para la baja.
 */
export function CanjeDeLink({ canjear, bien, mal, prueba }: { canjear: (token: string) => Promise<boolean>; bien: string; mal: string; prueba: string }) {
  const [resultado, setResultado] = useState<"esperando" | "bien" | "mal">("esperando");
  useEffect(() => {
    const token = window.location.hash.slice(1);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    void (async () => {
      const ok = /^[0-9a-f]{64}$/.test(token) && (await canjear(token));
      setResultado(ok ? "bien" : "mal");
    })();
  }, [canjear]);
  if (resultado === "esperando") return <p className={c.suave}>Un momento…</p>;
  return (
    <p role="status" className={c.aviso} data-canje={prueba} data-resultado={resultado}>
      {resultado === "bien" ? bien : mal}
    </p>
  );
}
