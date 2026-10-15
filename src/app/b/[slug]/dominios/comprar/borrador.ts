// La compra de un dominio entre la pantalla del titular y la de pago: en una cookie del panel
// (httpOnly, solo la ruta de compra de esa banda, una hora). No es un secreto, son los datos que
// la banda acaba de escribir; igual se valida todo de nuevo al pagar (precio, disponibilidad,
// condiciones), así que tocarla no da nada.
import { cookies } from "next/headers";
import type { Contacto } from "@/nucleo/dominios/registrador";

export type Borrador = { dominio: string; contacto: Contacto; hacerPrincipal: boolean };

const NOMBRE = "deoco_compra_dominio";
const ruta = (slug: string) => `/b/${slug}/dominios/comprar`;

export async function guardarBorrador(slug: string, b: Borrador) {
  (await cookies()).set(NOMBRE, JSON.stringify(b), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: ruta(slug),
    maxAge: 60 * 60,
  });
}

/** El borrador de ese dominio, o null (otro dominio, vencido o roto). */
export async function leerBorrador(dominio: string): Promise<Borrador | null> {
  try {
    const b = JSON.parse((await cookies()).get(NOMBRE)?.value ?? "null") as Borrador | null;
    return b && b.dominio === dominio && typeof b.contacto === "object" ? b : null;
  } catch {
    return null;
  }
}

export async function borrarBorrador(slug: string) {
  (await cookies()).set(NOMBRE, "", { path: ruta(slug), maxAge: 0 });
}
