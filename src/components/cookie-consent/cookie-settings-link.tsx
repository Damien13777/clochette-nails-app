"use client";

/**
 * Lien "Gérer les cookies" — déclenche la réouverture du bandeau
 * de consentement via un CustomEvent. Utilisé dans le footer.
 */

import { CONSENT_OPEN_EVENT } from "@/lib/cookie-consent";

export function CookieSettingsLink() {
  return (
    <button
      type="button"
      onClick={() => {
        document.dispatchEvent(new CustomEvent(CONSENT_OPEN_EVENT));
      }}
      className="hover:text-[var(--color-ink-900)] transition-colors cursor-pointer"
    >
      Gérer les cookies
    </button>
  );
}
