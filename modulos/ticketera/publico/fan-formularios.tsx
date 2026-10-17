"use client";

import { enviarSinBorrar } from "@/nucleo/publico/sin-borrar";
import { useActionState, useEffect, useState } from "react";
import { c } from "@/nucleo/publico/estilo";
import type { EstadoFan } from "./acciones";

/** Un botón (o un formulario corto) del área del fan, con su respuesta abajo. */
export function AccionFan({
  accion,
  etiqueta,
  suave,
  children,
  prueba,
}: {
  accion: (estado: EstadoFan, fd: FormData) => Promise<EstadoFan>;
  etiqueta: string;
  suave?: boolean;
  children?: React.ReactNode;
  prueba?: string;
}) {
  const [estado, enviar, pendiente] = useActionState<EstadoFan, FormData>(accion, {});
  if (estado.ok && children) {
    return (
      <p role="status" className={c.aviso} data-accion-fan={prueba}>
        {estado.ok}
      </p>
    );
  }
  return (
    <form action={enviar} onSubmit={enviarSinBorrar(enviar)} className="flex flex-col gap-3" data-form-fan={prueba}>
      {children}
      <div>
        <button type="submit" className={suave ? c.botonSuave : c.boton} disabled={pendiente}>
          {pendiente ? "Un momento…" : etiqueta}
        </button>
      </div>
      {(estado.ok || estado.error) && (
        <p role={estado.error ? "alert" : "status"} className={`text-sm ${estado.error ? "font-bold" : c.suave}`} data-respuesta-fan={prueba}>
          {estado.error ?? estado.ok}
        </p>
      )}
    </form>
  );
}

/** Lee el token del link del mail (después de "#"), lo canjea y muestra el resultado. */
export function CanjeTransferencia({ canjear, bien, mal, prueba }: { canjear: (token: string) => Promise<boolean>; bien: string; mal: string; prueba: string }) {
  const [r, setR] = useState<"esperando" | "bien" | "mal">("esperando");
  useEffect(() => {
    const token = window.location.hash.slice(1);
    window.history.replaceState(null, "", window.location.pathname);
    void (async () => setR(/^[0-9a-f]{64}$/.test(token) && (await canjear(token)) ? "bien" : "mal"))();
  }, [canjear]);
  if (r === "esperando") return <p className={c.suave}>Un momento…</p>;
  return (
    <p role="status" className={c.aviso} data-transferencia={prueba} data-resultado={r}>
      {r === "bien" ? bien : mal}
    </p>
  );
}
