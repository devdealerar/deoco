"use client";

import { enviarSinBorrar } from "@/nucleo/publico/sin-borrar";
import { useActionState, useEffect, useState } from "react";
import { confirmarDatosAccion, type EstadoPedidoDatos, pedirDatosAccion } from "@/nucleo/legal/acciones";
import { c } from "@/nucleo/publico/estilo";

const OPCIONES: [string, string][] = [
  ["acceso", "Ver qué datos tienen de mí"],
  ["rectificacion", "Corregir o actualizar mis datos"],
  ["supresion", "Borrar mis datos"],
  ["oposicion", "Que no usen mis datos para comunicaciones"],
];

/** El formulario del fan: qué pide, su email (se confirma por mail) y el detalle. */
export function FormularioDatos({ tipo }: { tipo?: "arrepentimiento" }) {
  const [estado, accion, enviando] = useActionState<EstadoPedidoDatos, FormData>(pedirDatosAccion, {});
  if (estado.ok) {
    return (
      <p role="status" className={c.aviso} data-pedido-enviado>
        {estado.ok}
      </p>
    );
  }
  return (
    <form action={accion} onSubmit={enviarSinBorrar(accion)} className="flex max-w-xl flex-col gap-4" data-formulario-datos>
      {tipo ? (
        <input type="hidden" name="tipo" value={tipo} />
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-bold">¿Qué querés pedir?</legend>
          {OPCIONES.map(([v, t], i) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <input type="radio" name="tipo" value={v} defaultChecked={i === 0} /> {t}
            </label>
          ))}
        </fieldset>
      )}
      <label className="flex flex-col gap-1 text-sm">
        Tu email (el de tus compras) *
        <input name="email" type="email" required className={c.campo} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Tu nombre
        <input name="nombre" className={c.campo} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {tipo ? "Qué compra querés revocar (fecha o número de pedido) *" : "Detalle (qué dato corregir, o lo que quieras agregar)"}
        <textarea name="detalle" rows={3} required={!!tipo} className={c.campo} />
      </label>
      {estado.error && (
        <p role="alert" className="text-sm font-bold">
          {estado.error}
        </p>
      )}
      <button type="submit" className={c.boton} disabled={enviando}>
        {enviando ? "Enviando…" : "Enviar"}
      </button>
    </form>
  );
}

/** La página del link del mail: canjea el token (después de "#") y muestra el código y el plazo. */
export function ConfirmarDatos() {
  const [r, setR] = useState<{ codigo: string; vence: string; tipo: string } | null | "esperando">("esperando");
  useEffect(() => {
    const token = window.location.hash.slice(1);
    window.history.replaceState(null, "", window.location.pathname);
    void (async () => setR(/^[0-9a-f]{48}$/.test(token) ? await confirmarDatosAccion(token) : null))();
  }, []);
  if (r === "esperando") return <p className={c.suave}>Confirmando…</p>;
  if (!r) return <p className={c.aviso}>Este link ya se usó o no es válido. Si tu pedido ya estaba confirmado, sigue en curso.</p>;
  const fecha = new Date(r.vence).toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" });
  return (
    <p role="status" className={c.aviso} data-pedido-confirmado>
      Listo, tu pedido está en curso. Código: <strong>{r.codigo}</strong>.{" "}
      {r.tipo === "arrepentimiento" ? "Te confirmamos la revocación de la compra con este código." : `La banda tiene que responderte hasta el ${fecha}.`} Te escribimos a tu mail.
    </p>
  );
}
