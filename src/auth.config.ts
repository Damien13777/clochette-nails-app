/**
 * NextAuth v5 — config partagée (middleware + serveur)
 *
 * Le proxy Next 16 (`proxy.ts`) tourne en **runtime Node** (imposé) : on peut
 * donc lire Prisma ici. `src/auth.ts` étend cette config avec le Credentials
 * provider (bcrypt). Stratégie JWT conservée.
 *
 * Révocation immédiate : le callback `jwt` re-valide `isActive` en DB à chaque
 * résolution de session pour un utilisateur authentifié (token présent) → un
 * compte désactivé/supprimé perd le rôle ADMIN sur **tous** les chemins
 * (middleware, pages, actions) sans attendre l'expiry du JWT. Les visiteurs
 * anonymes (pas de token) ne déclenchent aucune requête DB.
 */

import type { NextAuthConfig } from "next-auth";
import { prisma } from "@/lib/prisma";

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
     *  - Au sign-in (`user` présent) : on fait confiance aux données fraîches.
     *  - Aux accès suivants : on re-valide `isActive` + `role` en DB. Un compte
     *    désactivé/supprimé est dégradé en "CLIENT" (perd l'accès admin), et un
     *    changement de rôle est reflété immédiatement.
     */
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        token.role = user.role;
        return token;
      }
      if (token.sub) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub },
            select: { isActive: true, role: true },
          });
          token.role = dbUser?.isActive ? dbUser.role : "CLIENT";
        } catch {
          // Fail-open sur erreur DB : on garde le rôle courant pour ne pas
          // verrouiller l'admin légitime sur un incident transitoire.
        }
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
