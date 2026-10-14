// Acceso a algo privado del sitio público (las entradas de una compra, un pedido) sin cuenta y
// sin que el secreto viaje en una URL que vea un tercero:
// - Al comprar, el sitio de la banda guarda una cookie (httpOnly, solo ese sitio) con el token.
//   Al volver de la pasarela, la página la lee: la pasarela nunca ve el token.
// - En el mail va el link con el token después de "#": el navegador no lo manda a ningún
//   servidor (ni en Referer ni en logs). La página lo canjea por la cookie (CanjearLink).
import { cookies } from "next/headers";

const CLAVE = /^[a-z0-9-]{1,80}$/;
const nombre = (clave: string) => {
  if (!CLAVE.test(clave)) throw new Error(`Clave de acceso inválida: ${clave}`);
  return `deoco_acceso_${clave}`;
};

/** Guarda el acceso (en una acción del servidor, en el sitio de la banda). Un año. */
export async function recordarAcceso(clave: string, token: string) {
  (await cookies()).set(nombre(clave), token, {
    httpOnly: true,
    sameSite: "lax", // la vuelta de la pasarela es una navegación: la cookie viaja
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
}

/** El token guardado para esa clave en este navegador, o null. */
export async function accesoRecordado(clave: string): Promise<string | null> {
  return (await cookies()).get(nombre(clave))?.value ?? null;
}
