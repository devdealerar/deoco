"use client";

import { startTransition, type FormEvent } from "react";

/**
 * `onSubmit` para los formularios del sitio público con `useActionState`: manda la acción sin que
 * React vacíe el formulario al terminar (lo hace con `<form action>`). Si la acción devuelve un
 * error (un código postal mal escrito), el fan no pierde lo que escribió. Igual que `Formulario`
 * de @/ui en el panel. El `action` del form queda para cuando no hay JavaScript.
 */
export function enviarSinBorrar(despachar: (datos: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    startTransition(() => despachar(datos));
  };
}
