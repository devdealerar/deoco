import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verificarCredenciales } from "./credenciales";

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
    // El token lleva solo `sub` (id del usuario); se descarta nombre, email, etc.
    jwt({ token, user }) {
      return { sub: user?.id ?? token.sub };
    },
    session({ session, token }) {
      return { expires: session.expires, user: { id: token.sub! } };
    },
  },
});
