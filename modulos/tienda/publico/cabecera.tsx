"use client";

import Link from "next/link";
import { useCarrito } from "./carrito-local";

/** Elemento de cabecera del sitio (contrato: cabeceraPublica): el carrito con su contador. */
export function ContadorCarrito() {
  const unidades = useCarrito().reduce((s, l) => s + l.cantidad, 0);
  return (
    <Link href="/tienda/carrito" data-carrito={unidades} className="rounded-full px-3 py-1.5 text-sm font-bold hover:bg-[var(--superficie,#f5f5f4)]">
      Carrito{unidades > 0 && ` (${unidades})`}
    </Link>
  );
}
