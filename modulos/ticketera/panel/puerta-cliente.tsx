"use client";

import jsQR from "jsqr";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ResultadoValidacion, ResumenPuerta } from "../puerta";
import { resumenAccion, validarAccion } from "./acciones";

const HORA = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
const sinSuscripcion = () => () => {};
/** Id de este intento (se repite en los reintentos). getRandomValues anda también fuera de https. */
const nuevoIntento = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Estado =
  | { tipo: "listo" }
  | { tipo: "validando"; codigo: string; reintentos: number }
  | { tipo: "resultado"; codigo: string; r: ResultadoValidacion };

/**
 * Pantalla de la puerta, pensada para el celular. Escanea el QR (cámara) o se tipea el código.
 * El servidor decide siempre; sin señal reintenta el MISMO intento (no deja entrar dos veces y
 * no confunde un reintento con "ya entró"). Sin respuesta, nunca muestra verde.
 */
export function Puerta({ slug, eventoId, resumenInicial }: { slug: string; eventoId: string; resumenInicial: ResumenPuerta }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "listo" });
  const [resumen, setResumen] = useState(resumenInicial);
  const [codigo, setCodigo] = useState("");
  const [camara, setCamara] = useState(false);
  const [errorCamara, setErrorCamara] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const ocupado = useRef(false);
  const cancelado = useRef(false);
  const hidratado = useSyncExternalStore(sinSuscripcion, () => true, () => false);

  const actualizarResumen = useCallback(async () => {
    try {
      setResumen(await resumenAccion(slug, eventoId));
    } catch {
      // sin señal: queda el último
    }
  }, [slug, eventoId]);

  useEffect(() => {
    const t = setInterval(actualizarResumen, 5000);
    return () => clearInterval(t);
  }, [actualizarResumen]);

  const validar = useCallback(
    async (crudo: string) => {
      const limpio = crudo.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!limpio || ocupado.current) return;
      ocupado.current = true;
      cancelado.current = false;
      const intento = nuevoIntento();
      for (let i = 0; !cancelado.current; i++) {
        setEstado({ tipo: "validando", codigo: limpio, reintentos: i });
        try {
          const r = await validarAccion(slug, eventoId, limpio, intento);
          setEstado({ tipo: "resultado", codigo: limpio, r });
          if ("vibrate" in navigator) navigator.vibrate(r.resultado === "valida" ? 80 : [200, 80, 200]);
          void actualizarResumen();
          break;
        } catch {
          await espera(Math.min(5000, 800 * (i + 1)));
        }
      }
      if (cancelado.current) setEstado({ tipo: "listo" });
      ocupado.current = false;
      setCodigo("");
    },
    [slug, eventoId, actualizarResumen],
  );

  // Cámara: un cuadro cada 250 ms a jsQR. Mientras se valida o se muestra un resultado, no lee.
  useEffect(() => {
    if (!camara) return;
    let flujo: MediaStream | undefined;
    let reloj: ReturnType<typeof setInterval> | undefined;
    const lienzo = document.createElement("canvas");
    (async () => {
      try {
        flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (!video.current) return;
        video.current.srcObject = flujo;
        await video.current.play();
        reloj = setInterval(() => {
          const v = video.current;
          if (!v || ocupado.current || !v.videoWidth) return;
          lienzo.width = v.videoWidth;
          lienzo.height = v.videoHeight;
          const ctx = lienzo.getContext("2d", { willReadFrequently: true });
          if (!ctx) return;
          ctx.drawImage(v, 0, 0);
          const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
          const qr = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (qr?.data) void validar(qr.data);
        }, 250);
      } catch {
        setErrorCamara("No se pudo abrir la cámara. Tipeá el código.");
        setCamara(false);
      }
    })();
    return () => {
      clearInterval(reloj);
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, [camara, validar]);

  const siguiente = () => setEstado({ tipo: "listo" });

  return (
    <div className="flex flex-col gap-4" data-puerta data-hidratado={hidratado || undefined}>
      <div className="grid grid-cols-2 gap-3 text-center" data-resumen>
        <div className="rounded-xl bg-primary p-4 ring-1 ring-secondary ring-inset">
          <div className="text-display-sm font-bold tabular-nums text-primary" data-entraron>
            {resumen.entraron}
          </div>
          <div className="text-sm text-tertiary">entraron</div>
        </div>
        <div className="rounded-xl bg-primary p-4 ring-1 ring-secondary ring-inset">
          <div className="text-display-sm font-bold tabular-nums text-primary" data-faltan>
            {resumen.faltan}
          </div>
          <div className="text-sm text-tertiary">faltan de {resumen.vendidas}</div>
        </div>
      </div>

      {estado.tipo === "resultado" ? (
        <Resultado estado={estado} siguiente={siguiente} />
      ) : estado.tipo === "validando" ? (
        <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-2xl bg-primary p-6 text-center ring-1 ring-secondary ring-inset" data-validando>
          <div className="font-mono text-xl tracking-widest text-primary">{estado.codigo}</div>
          <div className="text-lg font-semibold text-secondary">
            {estado.reintentos === 0 ? "Validando…" : `Sin señal: reintentando (${estado.reintentos})…`}
          </div>
          <div className="text-sm text-tertiary">No lo dejes pasar hasta ver el resultado.</div>
          {estado.reintentos > 0 && (
            <button type="button" className="rounded-lg px-4 py-2 font-semibold text-secondary ring-1 ring-secondary" onClick={() => (cancelado.current = true)}>
              Cancelar
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {camara && <video ref={video} playsInline muted className="aspect-square w-full rounded-2xl bg-black object-cover" />}
          <button
            type="button"
            onClick={() => {
              setErrorCamara("");
              setCamara((c) => !c);
            }}
            className="rounded-xl bg-brand-solid px-4 py-4 text-lg font-bold text-white"
          >
            {camara ? "Cerrar cámara" : "Escanear QR"}
          </button>
          {errorCamara && <p className="text-sm text-error-primary">{errorCamara}</p>}
          <form
            className="flex gap-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              void validar(codigo);
            }}
          >
            <input
              name="codigo"
              value={codigo}
              onChange={(ev) => setCodigo(ev.target.value)}
              placeholder="Código de la entrada"
              autoCapitalize="characters"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-xl px-4 py-4 font-mono text-lg tracking-widest uppercase ring-1 ring-primary"
            />
            <button type="submit" className="rounded-xl bg-primary px-5 py-4 text-lg font-bold text-primary ring-1 ring-primary">
              Validar
            </button>
          </form>
        </div>
      )}

      <details className="rounded-xl bg-primary p-4 ring-1 ring-secondary ring-inset">
        <summary className="cursor-pointer text-sm font-semibold text-secondary">Por tipo</summary>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {resumen.porTipo.map((t) => (
            <li key={t.nombre} className="flex justify-between tabular-nums">
              <span>{t.nombre}</span>
              <span>
                {t.entraron} / {t.vendidas}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function Resultado({ estado, siguiente }: { estado: Extract<Estado, { tipo: "resultado" }>; siguiente: () => void }) {
  const { r, codigo } = estado;
  const caja = (color: string, titulo: string, cuerpo: React.ReactNode) => (
    <button type="button" onClick={siguiente} className={`flex min-h-56 w-full flex-col items-center justify-center gap-2 rounded-2xl p-6 text-center text-white ${color}`} data-resultado={r.resultado}>
      <div className="text-display-md font-black tracking-tight">{titulo}</div>
      {cuerpo}
      <div className="mt-2 font-mono text-sm tracking-widest opacity-80">{codigo}</div>
      <div className="mt-2 text-sm font-semibold underline">Tocá para seguir</div>
    </button>
  );
  switch (r.resultado) {
    case "valida":
      return caja(
        "bg-success-solid",
        "PASA",
        <>
          <div className="text-2xl font-bold">{r.nombre}</div>
          <div className="text-lg">
            DNI {r.documento} · {r.tipo}
          </div>
        </>,
      );
    case "ya-validada":
      return caja(
        "bg-error-solid",
        "YA ENTRÓ",
        <>
          <div className="text-2xl font-bold">{r.nombre}</div>
          <div className="text-lg">Validada a las {HORA.format(new Date(r.validadaEn))}</div>
        </>,
      );
    case "otro-show":
      return caja("bg-warning-solid", "OTRO SHOW", <div className="text-lg">Es una entrada para «{r.show}».</div>);
    case "transferida":
      return caja("bg-error-solid", "TRANSFERIDA", <div className="text-lg">Ese QR ya no vale: la entrada se transfirió y la persona nueva tiene otro.</div>);
    default:
      return caja("bg-error-solid", "NO VÁLIDA", <div className="text-lg">Ese código no es una entrada de este show.</div>);
  }
}
