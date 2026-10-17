"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { c } from "@/nucleo/publico/estilo";
import { canjearLinkAccion, type EstadoLinkFan, pedirLinkAccion, salirAccion } from "../fan-acciones";

/** Pedir el link a mi mail. */
export function PedirLink() {
  const [estado, accion, enviando] = useActionState<EstadoLinkFan, FormData>(pedirLinkAccion, {});
  if (estado.ok) {
    return (
      <p role="status" className={c.aviso} data-link-pedido>
        Si ese email tiene compras en este sitio, te llega un link en un minuto. Abrilo desde este navegador (vence en 30 minutos).
      </p>
    );
  }
  return (
    <form action={accion} className="flex max-w-md flex-col gap-4" data-pedir-link>
      <label className="flex flex-col gap-1 text-sm font-bold">
        El email con el que compraste
        <input name="email" type="email" autoComplete="email" required defaultValue={estado.email} className={c.campo} />
      </label>
      {estado.error && (
        <p role="alert" className={c.aviso}>
          {estado.error}
        </p>
      )}
      <button type="submit" className={c.boton} disabled={enviando}>
        {enviando ? "Enviando…" : "Mandame el link"}
      </button>
    </form>
  );
}

/** Canjea el link del mail (token después de "#") y vuelve a pedir la página. */
export function CanjearLinkDelFan() {
  const router = useRouter();
  const [vencido, setVencido] = useState(false);
  useEffect(() => {
    const canjear = () => {
      const token = window.location.hash.slice(1);
      if (!/^[0-9a-f]{64}$/.test(token)) return;
      window.history.replaceState(null, "", window.location.pathname);
      void (async () => {
        if (await canjearLinkAccion(token)) router.refresh();
        else setVencido(true);
      })();
    };
    canjear();
    // El link del mail abierto en una pestaña que ya mostraba esta página: solo cambia el "#".
    window.addEventListener("hashchange", canjear);
    return () => window.removeEventListener("hashchange", canjear);
  }, [router]);
  if (!vencido) return null;
  return (
    <p role="alert" className={c.aviso} data-link-vencido>
      Ese link ya no sirve (se usó o venció). Pedí uno nuevo: te llega al mismo mail.
    </p>
  );
}

export function Salir() {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  return (
    <button
      type="button"
      className={c.botonSuave}
      disabled={pendiente}
      onClick={() =>
        empezar(async () => {
          await salirAccion();
          router.refresh();
        })
      }>
      Salir
    </button>
  );
}
