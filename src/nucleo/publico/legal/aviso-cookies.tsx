"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { decidirCookiesAccion } from "@/nucleo/legal/acciones";
import { c } from "@/nucleo/publico/estilo";

/** El pie del sitio lo abre con este evento ("Preferencias de cookies"). */
export const ABRIR_COOKIES = "deoco:abrir-cookies";

/**
 * Aviso de cookies del sitio de la banda, con su estilo (las variables CSS del marco). Aparece si
 * el visitante no decidió (o el aviso cambió de versión); "Preferencias de cookies" lo reabre para
 * cambiar o revocar. Rechazar es tan fácil como aceptar: los tres botones en la primera capa.
 */
export function AvisoCookies({ decidido, analitica: a0, marketing: m0 }: { decidido: boolean; analitica: boolean; marketing: boolean }) {
  const [abierto, setAbierto] = useState(!decidido);
  const [detalle, setDetalle] = useState(false);
  const [analitica, setAnalitica] = useState(a0);
  const [marketing, setMarketing] = useState(m0);
  const [enviando, iniciar] = useTransition();
  useEffect(() => {
    const abrir = () => {
      setAbierto(true);
      setDetalle(true);
    };
    window.addEventListener(ABRIR_COOKIES, abrir);
    return () => window.removeEventListener(ABRIR_COOKIES, abrir);
  }, []);
  if (!abierto) return null;
  const decidir = (d: { analitica: boolean; marketing: boolean }) =>
    iniciar(async () => {
      await decidirCookiesAccion(d);
      setAnalitica(d.analitica);
      setMarketing(d.marketing);
      setAbierto(false);
    });
  return (
    <div
      role="dialog"
      aria-label="Cookies"
      data-aviso-cookies
      className={`fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-2xl border p-5 shadow-lg ${c.linea} bg-[var(--fondo,#fff)] ${c.texto}`}>
      <p className="text-sm">
        Este sitio usa cookies necesarias para funcionar (tu carrito, el acceso a tus compras). Si se suman cookies de medición o de publicidad, solo
        corren si decís que sí. Podés cambiar tu decisión cuando quieras desde el pie del sitio.{" "}
        <Link href="/privacidad" className="underline">
          Política de privacidad
        </Link>
        .
      </p>
      {detalle && (
        <fieldset className="mt-4 flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2 opacity-70">
            <input type="checkbox" checked disabled /> Necesarias (siempre: sin ellas el sitio no funciona)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="analitica" checked={analitica} onChange={(e) => setAnalitica(e.target.checked)} /> Medición (cuánta gente visita el sitio)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="marketing" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} /> Publicidad (anuncios en otras plataformas)
          </label>
        </fieldset>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={c.boton} disabled={enviando} onClick={() => decidir({ analitica: true, marketing: true })}>
          Aceptar todas
        </button>
        <button type="button" className={c.botonSuave} disabled={enviando} onClick={() => decidir({ analitica: false, marketing: false })}>
          Solo las necesarias
        </button>
        {detalle ? (
          <button type="button" className={c.botonSuave} disabled={enviando} onClick={() => decidir({ analitica, marketing })}>
            Guardar mi elección
          </button>
        ) : (
          <button type="button" className={c.botonSuave} onClick={() => setDetalle(true)}>
            Configurar
          </button>
        )}
      </div>
    </div>
  );
}

/** Botón del pie: reabre el aviso para cambiar o revocar. */
export function PreferenciasCookies() {
  return (
    <button type="button" className="underline" onClick={() => window.dispatchEvent(new Event(ABRIR_COOKIES))} data-preferencias-cookies>
      Preferencias de cookies
    </button>
  );
}
