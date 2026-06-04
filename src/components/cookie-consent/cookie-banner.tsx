"use client";

/**
 * Bandeau de consentement cookies — RGPD / CNIL compliant.
 *
 * Conformité :
 *  - Refuser aussi facile qu'accepter (CNIL 2020 recommandation)
 *  - Choix granulaire (catégories) accessible au 1er niveau
 *  - Pas de cookies non strictement nécessaires avant consentement
 *  - Conservation du choix 13 mois max (durée légale CNIL)
 *  - Possibilité de revenir sur son choix à tout moment (lien footer)
 *
 * Catégories couvertes :
 *  - "essential" : session NextAuth, CSRF, panier. Toujours actif, non négociable.
 *  - "functional" : préférences UI (ex: filtre portfolio mémorisé). Désactivable.
 *  - "analytics" : Google Analytics, Plausible si ajoutés un jour. Désactivable.
 *  - "marketing" : pixel Meta, retargeting si ajoutés un jour. Désactivable.
 *
 * Pour réouvrir le bandeau depuis ailleurs (lien footer) :
 *   document.dispatchEvent(new CustomEvent("cookie-banner-open"))
 *
 * Pour vérifier si une catégorie est consentie côté Client :
 *   import { hasCookieConsent } from "@/lib/cookie-consent";
 *   if (hasCookieConsent("analytics")) { load analytics script }
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CONSENT_CHANGED_EVENT,
  CONSENT_OPEN_EVENT,
  CONSENT_STORAGE_KEY,
  type ConsentCategories,
  type ConsentRecord,
  isConsentValid,
} from "@/lib/cookie-consent";

const DEFAULT_DECLINED: ConsentCategories = {
  essential: true,
  functional: false,
  analytics: false,
  marketing: false,
};

const DEFAULT_ACCEPTED: ConsentCategories = {
  essential: true,
  functional: true,
  analytics: true,
  marketing: true,
};

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [choices, setChoices] = useState<ConsentCategories>(DEFAULT_DECLINED);

  const openBanner = useCallback(() => {
    // Réinitialise les choices depuis le storage si dispo
    try {
      const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
      if (raw) {
        const record = JSON.parse(raw) as ConsentRecord;
        if (record.categories) setChoices(record.categories);
      }
    } catch {
      // ignore JSON parse error
    }
    setVisible(true);
    setExpanded(false);
  }, []);

  useEffect(() => {
    // Au mount : check si on doit montrer le bandeau
    try {
      const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
      if (!raw || !isConsentValid(JSON.parse(raw))) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage indispo au SSR : le check ne peut se faire qu'au mount
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }

    // Écoute l'event de réouverture (lien footer "Gérer les cookies")
    document.addEventListener(CONSENT_OPEN_EVENT, openBanner);
    return () => {
      document.removeEventListener(CONSENT_OPEN_EVENT, openBanner);
    };
  }, [openBanner]);

  function saveAndClose(categories: ConsentCategories) {
    const record: ConsentRecord = {
      version: 1,
      decidedAt: new Date().toISOString(),
      categories,
    };
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
    } catch {
      // ignore storage full / disabled
    }
    // Notifie les autres composants (analytics, scripts tiers...) du changement
    document.dispatchEvent(
      new CustomEvent(CONSENT_CHANGED_EVENT, { detail: { categories } }),
    );
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Consentement cookies"
      className="fixed bottom-0 inset-x-0 z-[55] p-4 sm:p-6"
    >
      <div className="max-w-[640px] mx-auto bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] overflow-hidden">
        {/* Texte principal */}
        <div className="p-5 md:p-6">
          <p
            className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)] mb-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Cookies & confidentialité
          </p>
          <h2
            className="text-lg leading-tight mb-3"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Vos données, votre choix
          </h2>
          <p
            className="text-sm text-[var(--color-ink-700)] leading-relaxed"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Ce site utilise des cookies strictement nécessaires à son
            fonctionnement (session, paiement). Avec votre accord, nous pouvons
            aussi déposer des cookies d&apos;analyse ou de mesure. Vous pouvez
            modifier votre choix à tout moment depuis le bas de page.{" "}
            <Link
              href="/confidentialite"
              className="text-[var(--color-violet-700)] underline underline-offset-2"
            >
              En savoir plus
            </Link>
          </p>

          {/* Choix granulaire (panneau collapsible) */}
          {expanded && (
            <fieldset className="mt-5 pt-5 border-t border-[var(--color-line)] space-y-3">
              <legend className="sr-only">Catégories de cookies</legend>

              <CategoryToggle
                label="Strictement nécessaires"
                description="Session de connexion, sécurité, paiement Stripe. Toujours actifs — sans eux le site ne peut pas fonctionner."
                checked
                disabled
                onChange={() => {}}
              />
              <CategoryToggle
                label="Fonctionnels"
                description="Mémorisation de préférences d'affichage (filtres portfolio, choix de langue…)."
                checked={choices.functional}
                onChange={(v) =>
                  setChoices((c) => ({ ...c, functional: v }))
                }
              />
              <CategoryToggle
                label="Mesure d'audience"
                description="Statistiques de visites anonymisées (pages vues, pays, durée). Aucun cookie publicitaire."
                checked={choices.analytics}
                onChange={(v) =>
                  setChoices((c) => ({ ...c, analytics: v }))
                }
              />
              <CategoryToggle
                label="Marketing"
                description="Publicité ciblée et reciblage (non utilisés actuellement, prévu pour l'avenir)."
                checked={choices.marketing}
                onChange={(v) =>
                  setChoices((c) => ({ ...c, marketing: v }))
                }
              />
            </fieldset>
          )}
        </div>

        {/* CTAs */}
        <div className="px-5 md:px-6 pb-5 md:pb-6 flex flex-col sm:flex-row gap-2">
          {expanded ? (
            <>
              <button
                type="button"
                onClick={() => saveAndClose(choices)}
                className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Enregistrer mes choix
              </button>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-full border border-[var(--color-line)] text-[var(--color-ink-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-bone)] transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Annuler
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => saveAndClose(DEFAULT_ACCEPTED)}
                className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Tout accepter
              </button>
              <button
                type="button"
                onClick={() => saveAndClose(DEFAULT_DECLINED)}
                className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-full border border-[var(--color-violet-600)] text-[var(--color-violet-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-50)] transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Tout refuser
              </button>
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-full text-[var(--color-ink-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-bone)] transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Personnaliser
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={`flex items-start gap-3 ${disabled ? "opacity-60" : "cursor-pointer"}`}
    >
      <span className="relative inline-block w-9 h-5 shrink-0 mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          className={`absolute inset-0 rounded-full transition-colors ${
            checked
              ? "bg-[var(--color-violet-600)]"
              : "bg-[var(--color-ink-300)]"
          }`}
        />
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
      <span className="flex-1 min-w-0">
        <span
          className="block text-sm"
          style={{ fontFamily: "var(--font-ui)", fontWeight: 500 }}
        >
          {label}
          {disabled && (
            <span
              className="ml-2 text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Toujours actif
            </span>
          )}
        </span>
        <span
          className="block text-xs text-[var(--color-ink-500)] mt-0.5 leading-relaxed"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {description}
        </span>
      </span>
    </label>
  );
}
