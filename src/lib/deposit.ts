/**
 * Helper de calcul d'acompte — partagé serveur + client.
 *
 * Source de vérité : PlatformSettings.depositMode + depositPercent/Fixed.
 * Calcul appliqué identiquement côté server (booking action) et côté client
 * (récap réservation pour affichage en temps réel).
 */

export type DepositSettings = {
  depositMode: "PERCENT" | "FIXED";
  depositPercent: number;
  depositFixedCents: number;
};

export function computeDepositCents(
  totalCents: number,
  settings: DepositSettings | null | undefined,
): number {
  if (!settings) {
    // Fallback safe : 30% si pas de settings (premier run avant seed)
    return Math.round(totalCents * 0.3);
  }
  if (settings.depositMode === "FIXED") return settings.depositFixedCents;
  return Math.round((totalCents * settings.depositPercent) / 100);
}
