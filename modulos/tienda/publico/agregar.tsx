"use client";

import Link from "next/link";
import { useState } from "react";
import type { Opcion } from "../catalogo";
import { agregarAlCarrito } from "./carrito-local";
import { c } from "@/nucleo/publico/estilo";

/** Selección de variantes y "Agregar al carrito". Sin todas las opciones elegidas, no agrega. */
export function Agregar({
  producto,
  disponible,
}: {
  producto: { id: string; nombre: string; precio: number; variantes: Opcion[] };
  disponible: boolean;
}) {
  const [elegida, setElegida] = useState<Record<string, string>>({});
  const [cantidad, setCantidad] = useState(1);
  const [agregado, setAgregado] = useState(false);
  const faltan = producto.variantes.filter((o) => !elegida[o.nombre]).map((o) => o.nombre.toLowerCase());
  const completo = faltan.length === 0;

  return (
    <div className="flex flex-col gap-5">
      {producto.variantes.map((o) => (
        <fieldset key={o.nombre} data-opcion={o.nombre}>
          <legend className="mb-2 text-sm font-bold">{o.nombre}</legend>
          <div className="flex flex-wrap gap-2">
            {o.valores.map((v) => {
              const activo = elegida[o.nombre] === v;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => {
                    setElegida({ ...elegida, [o.nombre]: v });
                    setAgregado(false);
                  }}
                  className={`min-w-11 rounded-full border px-3.5 py-1.5 text-sm font-bold ${
                    activo ? "border-[var(--acento,#111)] bg-[var(--acento,#111)] text-[var(--sobre-acento,#fff)]" : `${c.linea}`
                  }`}
                >
                  {v}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
      <label className="flex items-center gap-3 text-sm font-bold">
        Cantidad
        <select value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} className={c.cantidad} name="cantidad">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={c.boton}
          disabled={!disponible || !completo}
          onClick={() => {
            if (!completo || !disponible) return;
            agregarAlCarrito({ productoId: producto.id, variante: elegida, cantidad, nombre: producto.nombre, precio: producto.precio });
            setAgregado(true);
          }}
        >
          Agregar al carrito
        </button>
        {!disponible ? (
          <span className={`text-sm ${c.suave}`}>La tienda no está recibiendo pedidos en este momento.</span>
        ) : !completo ? (
          <span className={`text-sm ${c.suave}`} data-falta>
            Elegí {faltan.join(" y ")}.
          </span>
        ) : agregado ? (
          <span role="status" className="text-sm font-bold">
            Agregado. <Link href="/tienda/carrito" className="underline">Ver carrito</Link>
          </span>
        ) : null}
      </div>
    </div>
  );
}
