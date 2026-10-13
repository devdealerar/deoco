"use client";

import { type ReactNode, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ContextoEdicion } from "./contexto";
import { Boton } from "./index";

export type EstadoFormulario = { ok?: string; error?: string };

function Enviar({
  etiqueta,
  variante,
  puedeEditar,
}: {
  etiqueta: string;
  variante: "primario" | "secundario" | "peligro";
  puedeEditar: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" variante={variante} disabled={pending || !puedeEditar}>
      {pending ? "Guardando…" : etiqueta}
    </Boton>
  );
}

/**
 * Formulario de panel sobre una server action `(estado, datos) => estado`.
 * Muestra el resultado (ok / error). Sin permiso de edición, todos los campos del kit
 * se muestran deshabilitados (por contexto) y el fieldset también: es solo la cara
 * visible, el servidor igual rechaza.
 */
export function Formulario({
  accion,
  puedeEditar,
  etiqueta = "Guardar",
  variante = "primario",
  enLinea = false,
  children,
}: {
  accion: (estado: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;
  puedeEditar: boolean;
  etiqueta?: string;
  variante?: "primario" | "secundario" | "peligro";
  enLinea?: boolean;
  children?: ReactNode;
}) {
  const [estado, enviar] = useActionState(accion, {});
  return (
    <ContextoEdicion.Provider value={puedeEditar}>
      <form action={enviar} className={enLinea ? "inline-flex items-center gap-2" : "flex flex-col gap-4"}>
        <fieldset disabled={!puedeEditar} className={enLinea ? "contents" : "flex flex-col gap-4"}>
          {children}
          <div className="flex items-center gap-3">
            <Enviar etiqueta={etiqueta} variante={variante} puedeEditar={puedeEditar} />
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
