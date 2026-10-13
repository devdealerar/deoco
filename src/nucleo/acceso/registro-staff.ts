/**
 * Punto de registro de los accesos del staff de Deoco a una banda donde no tiene
 * membresía. Hoy no escribe en ninguna tabla; cuando se defina dónde se guarda,
 * se cambia solo esta función.
 */
export type AccesoStaff = { usuarioId: string; tenantId: string; ruta: string; fecha: Date };

export async function registrarAccesoStaff(acceso: AccesoStaff): Promise<void> {
  void acceso; // PENDIENTE: persistir (tabla o bitácora) cuando se defina.
}
