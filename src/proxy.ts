/**
 * Next.js 16 — Middleware (anciennement middleware.ts)
 *
 * Utilise la config edge-safe (`auth.config.ts`) pour vérifier la session
 * via JWT sans toucher à Prisma (qui n'est pas compatible edge runtime).
 *
 * Le callback `authorized` dans authConfig gère la logique de protection
 * des routes /admin/*.
 */

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

export const { auth } = NextAuth(authConfig);

/**
 * On enveloppe le middleware d'auth : le callback `authorized` (auth.config.ts)
 * continue de gérer la protection /admin EN AMONT (s'il refuse, la requête est
 * redirigée et cette fonction ne s'exécute pas). Pour les requêtes autorisées,
 * on injecte le pathname dans un header de requête afin que le root layout
 * (Server Component, Node) puisse décider d'afficher le mode maintenance sur
 * les routes publiques uniquement.
 */
export default auth((req) => {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  /**
   * Matche toutes les routes sauf :
   *  - /api/* (les API routes gèrent leur propre auth via requireAdmin/auth())
   *  - assets Next.js et favicon
   *  - /uploads/* (servis statiquement par Nginx en prod, par Next en dev)
   */
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|uploads/).*)",
  ],
};
