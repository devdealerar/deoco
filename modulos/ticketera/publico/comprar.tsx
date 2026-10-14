"use client";

import { useActionState, useState } from "react";
import { comprarAccion, type EstadoCompra } from "./acciones";
import { c } from "@/nucleo/publico/estilo";

type Tipo = { id: string; nombre: string; precio: string; disponibles: number };

/** Formulario de compra: tipo, cantidad, quién compra y a nombre de quién va cada entrada. */
export function Comprar({ tipos, maximo }: { tipos: Tipo[]; maximo: number }) {
  const [estado, enviar, pendiente] = useActionState<EstadoCompra, FormData>(comprarAccion, {});
  const [tipoId, setTipoId] = useState(tipos[0]?.id ?? "");
  const [cantidad, setCantidad] = useState(1);
  const tope = Math.min(maximo, tipos.find((t) => t.id === tipoId)?.disponibles ?? 0);

  return (
    <form action={enviar} className="flex flex-col gap-6" data-comprar>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-lg font-black">Entrada</legend>
        {tipos.map((t) => (
          <label key={t.id} className={`flex items-center gap-3 rounded-lg border p-3 ${c.linea}`}>
            <input type="radio" name="tipoId" value={t.id} checked={tipoId === t.id} onChange={() => setTipoId(t.id)} />
            <span className="flex-1 font-bold">{t.nombre}</span>
            <span className="tabular-nums">{t.precio}</span>
          </label>
        ))}
      </fieldset>
      <label className="flex items-center gap-3 font-bold">
        Cantidad
        <select name="cantidad" value={Math.min(cantidad, Math.max(1, tope))} onChange={(e) => setCantidad(Number(e.target.value))} className={`${c.campo} w-24`}>
          {Array.from({ length: Math.max(1, tope) }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-black">Tus datos</legend>
        <label className="flex flex-col gap-1 text-sm font-bold">
          Nombre y apellido
          <input name="nombre" autoComplete="name" required className={c.campo} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          Email (te llegan las entradas)
          <input name="email" type="email" autoComplete="email" required className={c.campo} />
        </label>
      </fieldset>
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-black">¿A nombre de quién?</legend>
        <p className={`text-sm ${c.suave}`}>Cada entrada es nominada: en la puerta pueden pedir el documento.</p>
        {Array.from({ length: Math.min(cantidad, Math.max(1, tope)) }, (_, i) => (
          <div key={i} className="grid gap-3 sm:grid-cols-2" data-asistente={i}>
            <label className="flex flex-col gap-1 text-sm font-bold">
              Entrada {i + 1} · Nombre y apellido
              <input name={`asistente-${i}-nombre`} required className={c.campo} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-bold">
              Documento
              <input name={`asistente-${i}-documento`} required inputMode="numeric" className={c.campo} />
            </label>
          </div>
        ))}
      </fieldset>
      {estado.error && (
        <p role="alert" className={c.aviso}>
          {estado.error}
        </p>
      )}
      <div>
        <button type="submit" className={c.boton} disabled={pendiente || tope === 0}>
          {pendiente ? "Reservando…" : "Ir a pagar"}
        </button>
      </div>
    </form>
  );
}
