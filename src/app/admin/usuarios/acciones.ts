"use server";

import type { EstadoFormulario } from "@/ui";
import { accionAdmin } from "../_servidor/accion";
import { cerrarSesiones } from "../_servidor/usuarios";

export async function cerrarSesionesAccion(usuarioId: string, _: EstadoFormulario) {
  return accionAdmin(async (staffId) => {
    await cerrarSesiones(staffId, usuarioId);
    return "Sesiones cerradas: en su próximo movimiento tiene que volver a ingresar.";
  });
}
