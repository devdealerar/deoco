"use client";

import { type ReactNode, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Boton } from "./index";

export type EstadoFormulario = { ok?: string; error?: string };

function Enviar({ etiqueta, variante }: { etiqueta: string; variante: "primario" | "secundario" | "peligro" }) {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" variante={variante} disabled={pending} tamano="sm">
      {pending ? "Guardando…" : etiqueta}
    </Boton>
  );
}

/**
 * Formulario de panel sobre una server action `(estado, datos) => estado`.
 * Muestra el resultado (ok / error). Sin permiso de edición, todo queda deshabilitado
 * (el servidor igual rechaza: esto es solo la cara visible).
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
    <form action={enviar} className={enLinea ? "inline-flex items-center gap-2" : "flex flex-col gap-4"}>
      <fieldset disabled={!puedeEditar} className={enLinea ? "contents" : "flex flex-col gap-4"}>
        {children}
        <div className="flex items-center gap-3">
          <Enviar etiqueta={etiqueta} variante={variante} />
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
  );
}
