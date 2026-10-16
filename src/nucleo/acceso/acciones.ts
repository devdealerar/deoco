// Acciones de formularios del panel de un módulo (las que usa <Formulario> de @/ui). Antes cada
// módulo tenía su copia; ahora la regla es una: sesión y banda del pedido → permiso del
// contrato (`edicion`) → la acción → refrescar la pantalla. Un error esperable (los que nombra
// el módulo) se muestra tal cual; cualquier otro sigue de largo (error.tsx, log).
import { revalidatePath } from "next/cache";
import { conTenant } from "@/nucleo/db/con-tenant";
import { registro as registroGlobal } from "@/nucleo/modulos";
import type { Modulo } from "@/nucleo/modulos/contrato";
import type { Registro } from "@/nucleo/modulos/registro";
import { accesoPanel, MENSAJE_SOLO_LECTURA, puedeEnPedido } from "./panel";

export type ContextoAccion = { tenantId: string; usuarioId: string };
export type EstadoAccion = { ok?: string; error?: string };
type ClaseError = abstract new (...args: never[]) => Error;

/**
 * `conEdicion` del módulo: `const conEdicion = accionesDelPanel(() => miModulo, [MiError])` y en
 * cada acción `return conEdicion(slug, async ({ tenantId }) => { … })`. El permiso, la pantalla
 * y los mensajes salen de `edicion` en el contrato (validado al arrancar).
 *
 * El contrato se pide con una función: el archivo de acciones lo importan las pantallas, que
 * importa el contrato (index.ts). Leerlo al cargar el archivo cae en esa importación circular.
 */
export function accionesDelPanel(contrato: () => Modulo, errores: ClaseError[], reg?: Registro) {
  return async function conEdicion(slug: string, fn: (c: ContextoAccion) => Promise<string | void>): Promise<EstadoAccion> {
    const modulo = contrato();
    if ((reg ?? registroGlobal()).modulo(modulo.id) !== modulo) throw new Error(`"${modulo.id}" no es un módulo registrado.`);
    const edicion = modulo.edicion;
    if (!edicion) throw new Error(`"${modulo.id}" no declara edicion en su contrato.`);
    const volver = `/b/${slug}${edicion.ruta}`;
    const acceso = await accesoPanel(volver);
    if (acceso.soloLectura) return { error: MENSAJE_SOLO_LECTURA };
    if (!(await puedeEnPedido(edicion.permiso, volver))) return { error: edicion.sinPermiso };
    try {
      const ok = await fn({ tenantId: acceso.tenantId, usuarioId: acceso.usuarioId });
      // Registro de actividad obligatorio (td3): quién guardó qué pantalla, y qué le dijo el panel.
      const mensaje = ok ?? edicion.guardado ?? "Guardado.";
      await conTenant(acceso.tenantId, (tx) =>
        tx.auditoria.createMany({
          data: [
            {
              usuarioId: acceso.usuarioId,
              tenantId: acceso.tenantId,
              accion: `${modulo.id}.panel_guardado`,
              // Hecho por soporte (D3): la banda lo ve así en su actividad, con el motivo.
              detalle: { pantalla: edicion.ruta, mensaje, ...(acceso.soporte ? { soporte: { sesionId: acceso.soporte.id, motivo: acceso.soporte.motivo } } : {}) },
            },
          ],
        }),
      );
      revalidatePath(volver, "layout");
      return { ok: mensaje };
    } catch (e) {
      if (errores.some((E) => e instanceof E)) return { error: (e as Error).message };
      throw e;
    }
  };
}
