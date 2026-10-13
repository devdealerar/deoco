"use client";

import { createContext, useContext } from "react";

/** ¿El usuario puede editar lo que muestra este formulario? Lo fija <Formulario>. */
export const ContextoEdicion = createContext(true);

/** true si el campo tiene que mostrarse deshabilitado (sin permiso de edición). */
export const useDeshabilitado = () => !useContext(ContextoEdicion);
