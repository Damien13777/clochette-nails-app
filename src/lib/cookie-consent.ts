/**
 * Types + helpers de gestion du consentement cookies.
 *
 * Le bandeau persiste le choix dans localStorage avec une durée de validité
 * de 13 mois (recommandation CNIL). Au-delà, l'utilisateur est re-prompté.
 *
 * Pour intégrer un nouveau script tiers (Google Analytics, etc.) :
 *   1. Charger conditionnellement avec `if (hasCookieConsent("analytics")) { ... }`
 *   2. Écouter `cookie-consent-changed` pour réagir au changement de choix
 */

export const CONSENT_STORAGE_KEY = "clochette.cookie-consent.v1";
const CONSENT_TTL_MS = 13 * 30 * 24 * 60 * 60 * 1000; // ~13 mois

/** Event dispatché sur `document` quand le user change ses choix. */
export const CONSENT_CHANGED_EVENT = "cookie-consent-changed";
/** Event dispatché sur `document` pour rouvrir le bandeau (lien footer). */
export const CONSENT_OPEN_EVENT = "cookie-banner-open";

export type ConsentCategory =
  | "essential"
  | "functional"
  | "analytics"
  | "marketing";

export type ConsentCategories = Record<ConsentCategory, boolean>;

export type ConsentRecord = {
  version: 1;
  decidedAt: string; // ISO date
  categories: ConsentCategories;
};

/**
 * Vérifie si un ConsentRecord est encore valide (non expiré + bien formé).
 */
export function isConsentValid(record: unknown): record is ConsentRecord {
  if (!record || typeof record !== "object") return false;
  const r = record as Partial<ConsentRecord>;
  if (r.version !== 1) return false;
  if (typeof r.decidedAt !== "string") return false;
  if (!r.categories || typeof r.categories !== "object") return false;
  const decidedTime = new Date(r.decidedAt).getTime();
  if (Number.isNaN(decidedTime)) return false;
  if (Date.now() - decidedTime > CONSENT_TTL_MS) return false;
  return true;
}

/**
 * Helper Client-side pour vérifier qu'une catégorie est consentie.
 * À utiliser dans les Client Components AVANT de charger un script tiers.
 * Retourne false si pas de consentement (côté safe par défaut).
 */
export function hasCookieConsent(category: ConsentCategory): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return category === "essential";
    const record = JSON.parse(raw);
    if (!isConsentValid(record)) return category === "essential";
    return record.categories[category] === true;
  } catch {
    return category === "essential";
  }
}
