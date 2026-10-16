import { createHmac, timingSafeEqual } from "node:crypto";
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verificarCredenciales, versionDeSesion } from "./credenciales";

declare module "next-auth" {
  /** La sesión guarda SOLO el id del usuario. Nunca tenant, nunca rol. */
  interface Session {
    user: { id: string };
    expires: DefaultSession["expires"];
  }
}

const enProduccion = process.env.NODE_ENV === "production";

// Renovar la sesión propia después de cambiar la clave (la versión subió y, si no, también se
// cerraría la sesión de quien la cambió). La prueba la arma solo el servidor: un `update` pedido
// desde el navegador (POST /api/auth/session) no la tiene, así una sesión vieja no se revive.
const pruebaDeRenovacion = (sub: string, v: number) =>
  createHmac("sha256", process.env.AUTH_SECRET ?? "").update(`renovar:${sub}:${v}`).digest("base64url");
const coincide = (a: unknown, b: string) =>
  typeof a === "string" && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const { handlers, auth, signIn, signOut, unstable_update: actualizarSesion } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/ingresar" },
  providers: [
    Credentials({
      credentials: { email: {}, contrasena: {} },
      async authorize(c) {
        if (typeof c?.email !== "string" || typeof c?.contrasena !== "string") return null;
        return verificarCredenciales(c.email, c.contrasena);
      },
    }),
  ],
  cookies: {
    // Cookie SOLO del host del panel (app.deocoartist.com / app.lvh.me): sin `domain`,
    // así los sitios públicos de las bandas no la reciben nunca. En producción el
    // prefijo __Host- lo garantiza el navegador (prohíbe `domain` y exige https).
    sessionToken: {
      name: enProduccion ? "__Host-deoco.sesion" : "deoco.sesion",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: enProduccion },
    },
  },
  callbacks: {
    // El token lleva solo `sub` (id del usuario) y `v`, la versión de sesión con la que se abrió
    // (nada de nombre, email, banda ni rol). En cada pedido se compara `v` con la de la base: si
    // cambió (cambió la clave, el staff cerró las sesiones) o la persona ya no existe, la sesión
    // deja de valer en ese mismo movimiento, no al vencer.
    async jwt({ token, user, trigger, session }) {
      const sub = user?.id ?? token.sub;
      if (!sub) return null;
      const actual = await versionDeSesion(sub);
      if (actual === null) return null;
      const renovada = trigger === "update" && coincide((session as { renovar?: unknown } | undefined)?.renovar, pruebaDeRenovacion(sub, actual));
      const v = user || renovada ? actual : token.v;
      if (v !== actual) return null;
      return { sub, v };
    },
    session({ session, token }) {
      return { expires: session.expires, user: { id: token.sub! } };
    },
  },
});

/** Después de cambiar la clave: la sesión de quien la cambió sigue (las demás se cierran). */
export async function renovarSesionPropia(usuarioId: string) {
  const v = await versionDeSesion(usuarioId);
  if (v !== null) await actualizarSesion({ renovar: pruebaDeRenovacion(usuarioId, v) } as never);
}
