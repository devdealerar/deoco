"use client";

// El carrito vive en el navegador del fan (localStorage del sitio de la banda): no hay cuenta
// de fan. Guarda qué y cuánto; nombre y precio solo para mostrar. El precio que vale lo
// decide el servidor al revisar y al confirmar.
import { useSyncExternalStore } from "react";
import type { LineaCarrito } from "../pedidos";

export type LineaLocal = LineaCarrito & { nombre: string; precio: number };

const CLAVE = "deoco.carrito";
const EVENTO = "deoco-carrito";
const VACIO: LineaLocal[] = [];

let cacheCrudo: string | null = null;
let cache: LineaLocal[] = VACIO;

function leerCrudo(): string | null {
  try {
    return window.localStorage.getItem(CLAVE);
  } catch {
    return null; // modo privado o almacenamiento bloqueado: carrito vacío, la página igual anda
  }
}

export function leerCarrito(): LineaLocal[] {
  const crudo = leerCrudo();
  if (crudo === cacheCrudo) return cache;
  cacheCrudo = crudo;
  try {
    const v = crudo ? JSON.parse(crudo) : [];
    cache = Array.isArray(v) ? v : VACIO;
  } catch {
    cache = VACIO;
  }
  return cache;
}

export function guardarCarrito(lineas: LineaLocal[]) {
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(lineas));
  } catch {
    // sin almacenamiento no hay carrito persistente
  }
  window.dispatchEvent(new Event(EVENTO));
}

const misma = (a: LineaCarrito, b: LineaCarrito) => a.productoId === b.productoId && JSON.stringify(a.variante) === JSON.stringify(b.variante);

export function agregarAlCarrito(linea: LineaLocal) {
  const lineas = [...leerCarrito()];
  const igual = lineas.findIndex((l) => misma(l, linea));
  if (igual >= 0) lineas[igual] = { ...lineas[igual], cantidad: Math.min(lineas[igual].cantidad + linea.cantidad, 10) };
  else lineas.push(linea);
  guardarCarrito(lineas);
}

export function cambiarCantidad(linea: LineaCarrito, cantidad: number) {
  guardarCarrito(
    leerCarrito()
      .map((l) => (misma(l, linea) ? { ...l, cantidad } : l))
      .filter((l) => l.cantidad > 0),
  );
}

function suscribir(aviso: () => void) {
  window.addEventListener("storage", aviso); // otra pestaña
  window.addEventListener(EVENTO, aviso); // esta pestaña
  return () => {
    window.removeEventListener("storage", aviso);
    window.removeEventListener(EVENTO, aviso);
  };
}

/** El carrito, reactivo (cambia en esta pestaña y en otras). En el servidor, vacío. */
export function useCarrito(): LineaLocal[] {
  return useSyncExternalStore(suscribir, leerCarrito, () => VACIO);
}
