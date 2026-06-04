/**
 * NextAuth v5 — config complète côté Node (avec Prisma + bcrypt)
 *
 * Importé par :
 *  - `app/api/auth/[...nextauth]/route.ts` (route handler)
 *  - Server Components / Server Actions qui ont besoin d'`auth()`
 *  - `signIn`, `signOut` côté Client via `next-auth/react`
 *
 * Le middleware `src/proxy.ts` utilise `auth.config.ts` (lite, edge-safe).
 */

import NextAuth, { type AuthError } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { authConfig } from "@/auth.config";
import { getClientIp } from "@/lib/client-ip";
import { prisma } from "@/lib/prisma";
import {
  AUTH_FAIL,
  checkRateLimit,
  recordRateLimit,
  resetRateLimit,
} from "@/lib/rate-limit";

// Hash bcrypt sentinel pour timing-constant lookup quand user inexistant.
// Coût 12, jamais utilisable comme vrai password.
const DUMMY_HASH =
  "$2a$12$DummyHashUsedToPreventTimingAttacksOnAuthAttemptsAAAAAAAA";

const loginSchema = z.object({
  email: z.string().email().max(150),
  password: z.string().min(1).max(128),
});

class RateLimitedError extends Error {
  readonly code = "RATE_LIMITED";
  readonly retryAfterSec: number;
  constructor(retryAfterSec: number) {
    super(`Rate limited (retry after ${retryAfterSec}s)`);
    this.retryAfterSec = retryAfterSec;
  }
}

export const { auth, signIn, signOut, handlers } = NextAuth({
  ...authConfig,
  // PrismaAdapter pour persister les Account/Session si OAuth ajouté plus tard.
  // Pour Credentials + JWT strategy, l'adapter n'est pas strictement requis
  // mais bon à avoir si on enable Google OAuth (CLIENT role à J+6 mois).
  // @ts-ignore — typing mismatch connu entre @auth/prisma-adapter et next-auth v5 beta
  adapter: PrismaAdapter(prisma),

  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials, request) {
        // 1. Récup IP pour rate-limit
        const ip = getClientIp(request?.headers);

        // 2. Rate limit AVANT toute requête DB
        const rl = checkRateLimit(
          AUTH_FAIL.bucket,
          ip,
          AUTH_FAIL.max,
          AUTH_FAIL.windowMs,
        );
        if (!rl.allowed) {
          throw new RateLimitedError(rl.retryAfterSec ?? 60);
        }

        // 3. Validation des credentials (Zod)
        const parsed = loginSchema.safeParse(rawCredentials);
        if (!parsed.success) {
          recordRateLimit(AUTH_FAIL.bucket, ip, AUTH_FAIL.windowMs);
          return null;
        }
        const { email, password } = parsed.data;

        // 4. Lookup user — toujours suivi de bcrypt.compare pour timing constant
        const user = await prisma.user.findUnique({
          where: { email: email.trim().toLowerCase() },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            role: true,
            isActive: true,
            hashedPassword: true,
          },
        });

        // 5. bcrypt.compare TOUJOURS (même si user absent → DUMMY_HASH)
        // → empêche les attaques par timing pour détecter quels emails existent
        const hashToCompare = user?.hashedPassword ?? DUMMY_HASH;
        const isValid = await bcrypt.compare(password, hashToCompare);

        // 6. Echec : enregistre l'échec rate limit + return null
        if (!user || !user.hashedPassword || !user.isActive || !isValid) {
          recordRateLimit(AUTH_FAIL.bucket, ip, AUTH_FAIL.windowMs);
          return null;
        }

        // 7. Succès : reset le compteur, update lastLoginAt
        resetRateLimit(AUTH_FAIL.bucket, ip);
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        // 8. Renvoie l'objet User minimal pour le JWT
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
          role: user.role,
        };
      },
    }),
  ],

  events: {
    async signOut() {
      // Optionnel : log de déconnexion via OutboundEvent (futur Phase 2)
    },
  },
});

export type { AuthError };
export { RateLimitedError };
