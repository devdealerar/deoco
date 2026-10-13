import { revalidatePath } from "next/cache";
import type { EstadoFormulario } from "@/ui";
import { ErrorFormulario } from "@/ui/servidor";
import { exigirStaff } from "./acceso";

/**
 * Envoltorio de toda server action del back office: exige staff (404 si no), traduce
 * errores esperables a { error } y refresca /admin.
 */
export async function accionAdmin(fn: (staffId: string) => Promise<string | void>): Promise<EstadoFormulario> {
  const { usuarioId } = await exigirStaff();
  try {
    const ok = await fn(usuarioId);
    revalidatePath("/admin", "layout");
    return { ok: ok ?? "Listo." };
  } catch (e) {
    if (e instanceof ErrorFormulario) return { error: e.message };
    throw e;
  }
}
