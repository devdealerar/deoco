// Tipografías del sitio público: la banda elige una de tres. Se sirven desde el propio
// sitio (paquetes @fontsource), sin pedir nada a terceros.
import "@fontsource/inter/400.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/900.css";
import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/700.css";
import "@fontsource/fraunces/900.css";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import type { CSSProperties } from "react";
import type { ContenidoSitio, Tipografia } from "../contenido";

export const FUENTES: Record<Tipografia, { nombre: string; familia: string }> = {
  SANS: { nombre: "Moderna (Inter)", familia: "'Inter', system-ui, sans-serif" },
  SERIF: { nombre: "Clásica (Fraunces)", familia: "'Fraunces', Georgia, serif" },
  MONO: { nombre: "Máquina de escribir (Space Mono)", familia: "'Space Mono', 'Courier New', monospace" },
};

/** true si el color es oscuro (el texto encima va claro). */
export function esOscuro(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4;
}

/** Variables CSS del sitio de la banda: todo el estilo sale de acá. */
export function variables(c: ContenidoSitio): CSSProperties {
  const fondo = c.identidad.colorFondo ?? "#111111";
  const oscuro = esOscuro(fondo);
  const acento = c.identidad.colorAcento;
  return {
    "--fondo": fondo,
    "--texto": oscuro ? "#f5f5f4" : "#1c1917",
    "--texto-suave": oscuro ? "rgba(245,245,244,.68)" : "rgba(28,25,23,.64)",
    "--linea": oscuro ? "rgba(255,255,255,.14)" : "rgba(0,0,0,.12)",
    "--superficie": oscuro ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.04)",
    "--acento": acento,
    "--sobre-acento": esOscuro(acento) ? "#ffffff" : "#111111",
    "--fuente": FUENTES[c.identidad.tipografia].familia,
  } as CSSProperties;
}

/** Cómo arma URLs la vista: en el sitio público o en la vista previa del panel. */
export type Rutas = {
  archivo: (ref: { id: string; nombre: string; web: boolean }, o?: { web?: boolean; descargar?: boolean }) => string;
  home: string;
  prensa: string;
};
