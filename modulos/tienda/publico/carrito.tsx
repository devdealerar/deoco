"use client";

import Link from "next/link";
import { formatearPesos } from "../dinero";
import { describirVariante } from "../comun";
import { cambiarCantidad } from "./carrito-local";
import { c } from "./estilo";
import { Problemas, Resumen, useRevision } from "./revision";

/** Página del carrito: lo del navegador, revisado contra el servidor. */
export function Carrito() {
  const { lineas, estado, cambios, hidratado } = useRevision();
  if (!hidratado) return null;
  if (lineas.length === 0) {
    return (
      <p className={c.suave} data-carrito-vacio>
        Tu carrito está vacío. <Link href="/tienda" className="underline">Ver la tienda</Link>
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col gap-3">
        {lineas.map((l) => (
          <li key={l.productoId + JSON.stringify(l.variante)} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-bold">{l.nombre}</div>
              <div className={`text-sm ${c.suave}`}>
                {describirVariante(l.variante)} {formatearPesos(l.precio)} c/u
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select
                aria-label={`Cantidad de ${l.nombre}`}
                value={l.cantidad}
                onChange={(e) => cambiarCantidad(l, Number(e.target.value))}
                className={c.cantidad}
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
              <button type="button" className={c.botonSuave} onClick={() => cambiarCantidad(l, 0)}>
                Sacar
              </button>
            </div>
          </li>
        ))}
      </ul>
      {cambios.length > 0 && <Problemas problemas={cambios} />}
      {estado && (
        <>
          <Problemas problemas={estado.disponible ? estado.problemas : ["La tienda no está recibiendo pedidos en este momento."]} />
          <Resumen estado={estado} />
          {estado.disponible && estado.problemas.length === 0 && (
            <Link href="/tienda/checkout" className={c.boton}>
              Ir a pagar
            </Link>
          )}
        </>
      )}
    </div>
  );
}
