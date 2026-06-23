/**
 * Garde-fou anti-spam pour la demande d'avis Google post-RDV.
 * Module pur (zéro dépendance serveur) — testable directement sous Vitest.
 */

export type ShouldSendReviewRequestArgs = {
  requestReview: boolean;
  googleReviewUrl: string | null;
  clientEmail: string | null;
  lastRequestForEmailAt: Date | null;
  now: Date;
};

/**
 * Décide si on envoie la demande d'avis. Pur, testable.
 * Envoi si : opt-in + URL configurée + e-mail présent et non "admin@" +
 * aucune demande à ce même e-mail dans les 120 derniers jours.
 */
export function shouldSendReviewRequest(args: ShouldSendReviewRequestArgs): boolean {
  const { requestReview, googleReviewUrl, clientEmail, lastRequestForEmailAt, now } = args;
  if (!requestReview || !googleReviewUrl || !clientEmail) return false;
  if (clientEmail.toLowerCase().startsWith("admin@")) return false;
  if (lastRequestForEmailAt) {
    const days120Ms = 120 * 24 * 60 * 60 * 1000;
    if (now.getTime() - lastRequestForEmailAt.getTime() < days120Ms) return false;
  }
  return true;
}
