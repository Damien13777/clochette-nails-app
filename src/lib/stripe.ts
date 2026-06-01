/**
 * Stripe SDK singleton — Clochette Nails.
 *
 * Mode dev tolérant : si STRIPE_SECRET_KEY n'est pas configurée, on
 * expose `stripe = null` au lieu de throw. Les call sites checkent
 * `if (stripe)` et fall back vers un mode dev qui confirme directement
 * la booking sans Stripe Checkout.
 *
 * En prod, STRIPE_SECRET_KEY DOIT être définie.
 */

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;

export const stripe: Stripe | null = key
  ? new Stripe(key, {
      // Version API épinglée sur celle que ce SDK embarque (LatestApiVersion).
      // À chaque bump majeur du paquet `stripe`, recaler cette valeur sur la
      // nouvelle version épinglée (cf. CHANGELOG du SDK) — sinon erreur de type.
      apiVersion: "2026-04-22.dahlia",
      typescript: true,
    })
  : null;

if (!stripe && process.env.NODE_ENV !== "test") {
  console.warn(
    "[stripe] STRIPE_SECRET_KEY non configurée → mode dev (auto-confirm bookings)",
  );
}

/**
 * Helper booléen utilisable côté Server Components / Server Actions
 * pour brancher l'UI sur la dispo de Stripe.
 */
export function isStripeConfigured(): boolean {
  return stripe !== null;
}
