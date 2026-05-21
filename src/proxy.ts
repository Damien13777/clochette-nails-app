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
import { authConfig } from "@/auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export default middleware;

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
