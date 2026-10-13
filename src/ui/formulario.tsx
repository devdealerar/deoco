"use client";

import { type FormEvent, type ReactNode, startTransition, useActionState, useEffect, useRef, useSyncExternalStore } from "react";
import { ContextoEdicion } from "./contexto";
import { Boton } from "./index";

export type EstadoFormulario = { ok?: string; error?: string };

const sinSuscripcion = () => () => {};

/**
 * Formulario de panel sobre una server action `(estado, datos) => estado`.
 *
 * Lo que escribió el usuario NO se pierde si el servidor rechaza: React 19 vacía un
 * <form action={…}> al terminar cualquier acción, así que, ya hidratado, onSubmit
 * cancela ese camino y despacha la acción a mano. `action` queda igual en el <form>
 * para que un envío antes de hidratar (o sin JavaScript) llegue al servidor.
 * Solo `limpiarAlGuardar` (formularios de "agregar") vacía los campos, y únicamente
 * cuando guardar salió bien.
 *
 * Sin permiso de edición, los campos del kit se muestran deshabilitados (por contexto)
 * y el fieldset también: es solo la cara visible, el servidor igual rechaza.
 */
export function Formulario({
  accion,
  puedeEditar,
  etiqueta = "Guardar",
  variante = "primario",
  enLinea = false,
  limpiarAlGuardar = false,
  children,
}: {
  accion: (estado: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;
  puedeEditar: boolean;
  etiqueta?: string;
  variante?: "primario" | "secundario" | "peligro";
  enLinea?: boolean;
  /** Vaciar los campos después de guardar bien (p. ej. "agregar fecha"). */
  limpiarAlGuardar?: boolean;
  children?: ReactNode;
}) {
  const [estado, despachar, pendiente] = useActionState(accion, {});
  const form = useRef<HTMLFormElement>(null);
  // false en el servidor y al hidratar; true después (marca data-hidratado, útil en pruebas).
  const hidratado = useSyncExternalStore(sinSuscripcion, () => true, () => false);

  useEffect(() => {
    if (estado.ok && limpiarAlGuardar) form.current?.reset();
  }, [estado, limpiarAlGuardar]);

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    startTransition(() => despachar(datos));
  }

  return (
    <ContextoEdicion.Provider value={puedeEditar}>
      <form
        ref={form}
        action={despachar}
        onSubmit={enviar}
        data-hidratado={hidratado || undefined}
        className={enLinea ? "inline-flex items-center gap-2" : "flex flex-col gap-4"}>
        <fieldset disabled={!puedeEditar} className={enLinea ? "contents" : "flex flex-col gap-4"}>
          {children}
          <div className="flex items-center gap-3">
            <Boton type="submit" variante={variante} disabled={pendiente || !puedeEditar}>
              {pendiente ? "Guardando…" : etiqueta}
            </Boton>
            {estado.ok && !enLinea && (
              <span role="status" className="text-sm text-success-primary">
                {estado.ok}
              </span>
            )}
          </div>
        </fieldset>
        {estado.error && (
          <p role="alert" className="text-sm text-error-primary">
            {estado.error}
          </p>
        )}
      </form>
    </ContextoEdicion.Provider>
  );
}
