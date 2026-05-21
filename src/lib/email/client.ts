/**
 * Client Resend — singleton avec fallback gracieux.
 *
 * Si RESEND_API_KEY n'est pas configurée (dev sans clé), on retourne null
 * et `sendEmail()` se rabat sur un console.log. Permet de tester le flow
 * complet sans payer Resend en dev.
 *
 * En prod : RESEND_API_KEY DOIT être set + RESEND_FROM_EMAIL aussi.
 */

import { Resend } from "resend";

const key = process.env.RESEND_API_KEY;

export const resend: Resend | null = key ? new Resend(key) : null;

if (!resend && process.env.NODE_ENV !== "test") {
  console.warn(
    "[email] RESEND_API_KEY non configurée → emails loggés en console (dev mode)",
  );
}

export const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "Clochette Nails <onboarding@resend.dev>";

export const ADMIN_EMAIL =
  process.env.ADMIN_NOTIF_EMAIL ?? "contact@clochette-nails.fr";

export function isEmailConfigured(): boolean {
  return resend !== null;
}
