/**
 * NextAuth v5 — config edge-safe (lite)
 *
 * Cette config ne touche pas à Prisma ni bcrypt → compatible avec
 * le runtime edge utilisé par le middleware (`proxy.ts`).
 *
 * Le fichier `src/auth.ts` étend cette config avec le Credentials
 * provider qui utilise Prisma (Node runtime).
 *
 * Convention : on garde JWT strategy pour que le middleware puisse
 * vérifier la session sans appel DB.
 */

import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/admin/connexion",
  },

  session: { strategy: "jwt" },

  providers: [
    // Les providers complets sont dans src/auth.ts (Node-side avec Prisma).
    // Ici on laisse vide pour rester edge-compatible.
  ],

  callbacks: {
    /**
     * Edge-safe authorization check pour le middleware.
     * Retourne true si l'utilisateur peut accéder à la route, false sinon.
     * Pour des redirections custom, retourner une `Response` ou `NextResponse`.
     */
    authorized({ auth, request: { nextUrl } }) {
      const { pathname } = nextUrl;
      const isLoggedIn = !!auth?.user;
      const isAdmin = auth?.user?.role === "ADMIN";

      // Routes admin publiques (login, mot de passe oublié, reset)
      const PUBLIC_ADMIN_PATHS = [
        "/admin/connexion",
        "/admin/mot-de-passe-oublie",
        "/admin/reinitialiser-mot-de-passe",
      ];
      const isPublicAdmin = PUBLIC_ADMIN_PATHS.some((p) =>
        pathname.startsWith(p),
      );

      // Si déjà loggé et tape /admin/connexion, redirige vers /admin
      if (isPublicAdmin && isLoggedIn && isAdmin) {
        return Response.redirect(new URL("/admin", nextUrl));
      }

      // Routes admin protégées
      if (pathname.startsWith("/admin") && !isPublicAdmin) {
        if (!isLoggedIn) return false;
        if (!isAdmin) return false;
      }

      return true;
    },

    /**
     * Enrichit le JWT avec les infos utiles (id, role).
     * Appelé lors du sign-in (avec user) et à chaque accès (sans).
     */
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        token.role = user.role;
      }
      return token;
    },

    /**
     * Expose les infos JWT côté session côté Client.
     */
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.role = token.role as "ADMIN" | "CLIENT";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
