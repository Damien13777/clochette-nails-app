/**
 * Vérification d'authentification des endpoints cron (`/api/v1/cron/*`).
 *
 * Auth : header `Authorization: Bearer <CRON_SECRET>`.
 *
 * Comparaison constant-time (`crypto.timingSafeEqual`) pour ne pas fuiter
 * d'information de timing sur le secret. Le secret est haute-entropie donc
 * le risque réel est faible, mais la garde est triviale à durcir.
 */

import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

export function verifyCronAuth(request: Request): CronAuthResult {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET non configuré");
    return { ok: false, status: 503, error: "CRON_SECRET non configuré" };
  }
  const auth = request.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}
