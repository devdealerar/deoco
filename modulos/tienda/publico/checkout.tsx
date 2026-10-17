"use client";

import { enviarSinBorrar } from "@/nucleo/publico/sin-borrar";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { PROVINCIAS } from "../comun";
import { confirmarAccion, type EstadoCheckout } from "./acciones";
import { guardarCarrito } from "./carrito-local";
import { c } from "@/nucleo/publico/estilo";
import { Problemas, Resumen, useRevision } from "./revision";

function Campo({ name, etiqueta, ...props }: { name: string; etiqueta: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1 text-sm font-bold">
      {etiqueta}
      <input name={name} className={c.campo} {...props} />
    </label>
  );
}

/** Checkout: datos del fan, dirección, resumen. El servidor revalida todo al confirmar. */
export function Checkout({ novedades }: { novedades?: string | null }) {
  const { lineas, estado, cambios, hidratado } = useRevision();
  const [resultado, confirmar, pendiente] = useActionState<EstadoCheckout, FormData>(confirmarAccion, {});
  const router = useRouter();

  useEffect(() => {
    if (!resultado.pedidoId) return;
    guardarCarrito([]);
    // A la pasarela de la banda (otro sitio); si no se pudo crear el cobro, a la página del pedido.
    if (resultado.redireccion) window.location.assign(resultado.redireccion);
    else router.push(`/tienda/pedido/${resultado.pedidoId}`);
  }, [resultado.pedidoId, resultado.redireccion, router]);

  if (!hidratado) return null;
  if (lineas.length === 0 && !resultado.pedidoId) return <p className={c.suave}>Tu carrito está vacío.</p>;
  const bloqueado = !estado || !estado.disponible || estado.problemas.length > 0;

  return (
    <form action={confirmar} onSubmit={enviarSinBorrar(confirmar)} className="grid gap-8 lg:grid-cols-[1fr_22rem]" data-checkout>
      <input type="hidden" name="carrito" value={JSON.stringify(lineas.map(({ productoId, variante, cantidad }) => ({ productoId, variante, cantidad })))} />
      <div className="flex flex-col gap-6">
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-lg font-black">Tus datos</legend>
          <Campo name="nombre" etiqueta="Nombre y apellido" autoComplete="name" required />
          <Campo name="email" etiqueta="Email" type="email" autoComplete="email" required />
          <Campo name="telefono" etiqueta="Teléfono" type="tel" autoComplete="tel" required />
          <Campo name="documento" etiqueta="DNI o CUIT (opcional, para la factura)" inputMode="numeric" />
          {novedades && (
            // Aparte y sin marcar: la compra no la exige (consentimiento libre).
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="novedades" value="si" className="mt-1" />
              <span>{novedades}</span>
            </label>
          )}
        </fieldset>
        <fieldset className="grid gap-4 sm:grid-cols-6">
          <legend className="mb-3 text-lg font-black">Envío</legend>
          <div className="sm:col-span-4">
            <Campo name="calle" etiqueta="Calle" autoComplete="address-line1" required />
          </div>
          <div className="sm:col-span-1">
            <Campo name="numero" etiqueta="Número" required />
          </div>
          <div className="sm:col-span-1">
            <Campo name="piso" etiqueta="Piso / depto" autoComplete="address-line2" />
          </div>
          <div className="sm:col-span-3">
            <Campo name="ciudad" etiqueta="Ciudad" autoComplete="address-level2" required />
          </div>
          <label className="flex flex-col gap-1 text-sm font-bold sm:col-span-2">
            Provincia
            <select name="provincia" className={c.campo} defaultValue="" required>
              <option value="" disabled>
                Elegí
              </option>
              {PROVINCIAS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-1">
            <Campo name="codigoPostal" etiqueta="Código postal" autoComplete="postal-code" required />
          </div>
        </fieldset>
      </div>
      <aside className="flex flex-col gap-4">
        <h2 className="text-lg font-black">Resumen</h2>
        {cambios.length > 0 && <Problemas problemas={cambios} />}
        {estado && <Problemas problemas={estado.disponible ? estado.problemas : ["La tienda no está recibiendo pedidos en este momento."]} />}
        {estado && <Resumen estado={estado} />}
        {resultado.problemas && <Problemas problemas={resultado.problemas} />}
        <button type="submit" className={c.boton} disabled={bloqueado || pendiente}>
          {pendiente || resultado.pedidoId ? "Yendo a pagar…" : "Confirmar y pagar"}
        </button>
      </aside>
    </form>
  );
}
