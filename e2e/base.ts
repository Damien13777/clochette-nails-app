/**
 * Base de test E2E.
 *
 * Pré-règle le consentement cookies dans localStorage AVANT chaque navigation,
 * pour que le bandeau (position fixed en bas) n'intercepte pas les clics sur
 * les éléments de page (créneaux de réservation, boutons d'achat…).
 *
 * Clé + forme alignées sur src/lib/cookie-consent.ts
 * (CONSENT_STORAGE_KEY = "clochette.cookie-consent.v1", type ConsentRecord).
 *
 * Override du fixture `page` → ne s'applique que quand un test utilise `page`
 * (les specs basées sur `request` ne paient pas ce coût).
 */
import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem(
          "clochette.cookie-consent.v1",
          JSON.stringify({
            version: 1,
            decidedAt: new Date().toISOString(),
            categories: {
              essential: true,
              functional: true,
              analytics: false,
              marketing: false,
            },
          }),
        );
      } catch {
        /* localStorage indispo → on ignore, le bandeau sera juste présent */
      }
    });
    await use(page);
  },
});

export { expect };
