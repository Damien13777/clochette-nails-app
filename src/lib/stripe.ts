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
      // Épingler la version API pour éviter les surprises au upgrade
      apiVersion: "2025-09-30.clover",
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
