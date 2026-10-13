import type { Rol } from "@/generated/prisma/client";

/**
 * Permiso que declara un módulo al registrarse. Formato `modulo.recurso.accion`.
 * `exclusivoTitular`: solo el titular lo tiene; ni otro rol ni el staff de Deoco
 * (es el caso de la pasarela de cobro). Exige rolesPorDefecto = ["TITULAR"].
 */
export type DefinicionPermiso = {
  clave: string;
  rolesPorDefecto: Rol[];
  exclusivoTitular?: boolean;
};

const FORMATO = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;

const permisos = new Map<string, DefinicionPermiso & { moduloId: string }>();

/** Lo llama el registro de módulos al arrancar. El núcleo no define permisos de negocio. */
export function registrarPermisos(moduloId: string, definiciones: DefinicionPermiso[]) {
  for (const d of definiciones) {
    if (!FORMATO.test(d.clave)) {
      throw new Error(`Permiso "${d.clave}": el formato es modulo.recurso.accion`);
    }
    if (d.clave.split(".")[0] !== moduloId) {
      throw new Error(`Permiso "${d.clave}": un módulo solo declara permisos propios (${moduloId}.*)`);
    }
    if (permisos.has(d.clave)) throw new Error(`Permiso "${d.clave}" declarado dos veces`);
    if (d.exclusivoTitular && !(d.rolesPorDefecto.length === 1 && d.rolesPorDefecto[0] === "TITULAR")) {
      throw new Error(`Permiso "${d.clave}": exclusivoTitular exige rolesPorDefecto = ["TITULAR"]`);
    }
    permisos.set(d.clave, { ...d, moduloId });
  }
}

export function definicionPermiso(clave: string) {
  return permisos.get(clave);
}

/** Solo para pruebas. */
export function vaciarRegistroPermisos() {
  permisos.clear();
}
