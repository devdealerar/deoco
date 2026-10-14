"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { formatearPesos } from "@/nucleo/dinero";
import { describirVariante, tituloEnvio } from "../comun";
import { type EstadoCarrito, revisarAccion } from "./acciones";
import { guardarCarrito, type LineaLocal, useCarrito } from "./carrito-local";
import { c } from "@/nucleo/publico/estilo";

/**
 * Revisa el carrito del navegador contra el servidor cada vez que cambia. Lo que muestra
 * (precios, envíos, total) es lo que dice el servidor; si un precio cambió, actualiza la copia
 * local para mostrar y avisa.
 */
const sinSuscripcion = () => () => {};

export function useRevision() {
  const lineas = useCarrito();
  // Hasta hidratar, el carrito "es" el del servidor (vacío): no se revisa eso.
  const hidratado = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  const [revisada, setRevisada] = useState<{ clave: string; estado: EstadoCarrito } | null>(null);
  const [cambios, setCambios] = useState<string[]>([]);
  const [, empezar] = useTransition();
  const clave = JSON.stringify(lineas.map(({ productoId, variante, cantidad }) => ({ productoId, variante, cantidad })));

  useEffect(() => {
    if (!hidratado) return;
    empezar(async () => {
      const r = await revisarAccion(JSON.parse(clave));
      const avisos: string[] = [];
      const nuevas: LineaLocal[] = lineas.map((l) => {
        const s = r.lineas.find((x) => x.productoId === l.productoId && JSON.stringify(x.variante) === JSON.stringify(l.variante));
        if (s && s.precio !== l.precio) avisos.push(`El precio de "${s.nombre}" cambió: ahora es ${formatearPesos(s.precio)}.`);
        return s ? { ...l, precio: s.precio, nombre: s.nombre } : l;
      });
      if (avisos.length) {
        setCambios(avisos);
        guardarCarrito(nuevas);
      }
      setRevisada({ clave, estado: r });
    });
    // `lineas` cambia con `clave`; solo se revisa cuando cambia lo que importa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, hidratado]);

  // Solo vale la revisión del carrito que se ve ahora (una respuesta vieja no se muestra).
  const estado = revisada && revisada.clave === clave ? revisada.estado : null;
  return { lineas, estado, cambios, hidratado };
}

/** Renglones, envío y total, según el servidor. */
export function Resumen({ estado }: { estado: EstadoCarrito }) {
  return (
    <div className="flex flex-col gap-3" data-resumen>
      <ul className={`divide-y ${c.linea} border-y ${c.linea}`}>
        {estado.lineas.map((l) => (
          <li key={l.productoId + JSON.stringify(l.variante)} className="flex justify-between gap-4 py-3" data-linea={l.nombre}>
            <div>
              <div className="font-bold">
                {l.nombre} × {l.cantidad}
              </div>
              {Object.keys(l.variante).length > 0 && <div className={`text-sm ${c.suave}`}>{describirVariante(l.variante)}</div>}
            </div>
            <div className="tabular-nums" data-subtotal-linea>
              {formatearPesos(l.precio * l.cantidad)}
            </div>
          </li>
        ))}
      </ul>
      <dl className="flex flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <dt className={c.suave}>Productos</dt>
          <dd className="tabular-nums" data-subtotal>
            {formatearPesos(estado.subtotal)}
          </dd>
        </div>
        {estado.envios.length > 1 ? (
          // Más de un proveedor: un paquete (y un envío) por cada uno.
          estado.envios.map((e) => (
            <div key={e.proveedorId} className="flex justify-between gap-4" data-envio-proveedor>
              <dt className={c.suave}>{tituloEnvio(e, estado.envios)}</dt>
              <dd className="tabular-nums">{formatearPesos(e.monto)}</dd>
            </div>
          ))
        ) : null}
        <div className="flex justify-between">
          <dt className={c.suave}>{estado.envios.length > 1 ? `Envío total (${estado.envios.length} paquetes)` : "Envío"}</dt>
          <dd className="tabular-nums" data-envio>
            {formatearPesos(estado.envio)}
          </dd>
        </div>
        <div className="flex justify-between text-lg font-black">
          <dt>Total</dt>
          <dd className="tabular-nums" data-total>
            {formatearPesos(estado.total)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function Problemas({ problemas }: { problemas: string[] }) {
  if (!problemas.length) return null;
  return (
    <ul role="alert" className={`${c.aviso} flex flex-col gap-1`} data-problemas>
      {problemas.map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ul>
  );
}
