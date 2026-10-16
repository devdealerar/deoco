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

export const { handlers, auth, signIn, signOut } = NextAuth({
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
    async jwt({ token, user }) {
      const sub = user?.id ?? token.sub;
      if (!sub) return null;
      const actual = await versionDeSesion(sub);
      if (actual === null) return null;
      const v = user ? actual : token.v;
      if (v !== actual) return null;
      return { sub, v };
    },
    session({ session, token }) {
      return { expires: session.expires, user: { id: token.sub! } };
    },
  },
});
