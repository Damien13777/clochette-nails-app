"use client";

/**
 * Error boundary global — capture toute erreur runtime non gérée
 * dans une route (Server ou Client). Doit être un Client Component
 * (utilise useEffect + onClick).
 *
 * Affiche un message friendly + bouton "Réessayer" qui re-render la
 * route, et un fallback vers la home. En dev, log l'erreur côté client
 * pour debug.
 *
 * NB : ne capture PAS les erreurs du root layout — pour ça il y a
 * `global-error.tsx`.
 */

import { useEffect } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/landing/site-header";
import { FooterContent } from "@/components/landing/footer-content";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log côté client pour Sentry / monitoring (à wirer plus tard)
    console.error("[error boundary]", error);
  }, [error]);

  return (
    <>
      <SiteHeader />
      <main className="bg-[var(--color-cream)] min-h-[60vh] flex items-center">
        <div className="max-w-[640px] mx-auto px-5 md:px-8 lg:px-12 pt-32 md:pt-40 pb-20 md:pb-28 text-center">
          <p
            className="text-xs uppercase tracking-[0.22em] text-[var(--color-danger)] flex items-center justify-center gap-3"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <span
              className="inline-block w-9 h-px bg-[var(--color-danger)]/40"
              aria-hidden="true"
            />
            Une erreur est survenue
            <span
              className="inline-block w-9 h-px bg-[var(--color-danger)]/40"
              aria-hidden="true"
            />
          </p>

          <h1
            className="mt-6 text-[clamp(2rem,5vw,3rem)] leading-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Oups, quelque chose a coincé
          </h1>

          <p
            className="mt-5 text-sm md:text-base text-[var(--color-ink-700)] leading-relaxed max-w-md mx-auto"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Un incident technique nous empêche d&apos;afficher cette page. Vous
            pouvez réessayer ou revenir à l&apos;accueil — si le problème
            persiste, contactez-nous à{" "}
            <a
              href="mailto:contact@clochette-nails.fr"
              className="text-[var(--color-violet-700)] underline underline-offset-2"
            >
              contact@clochette-nails.fr
            </a>
            .
          </p>

          {error.digest && (
            <p
              className="mt-4 text-[11px] text-[var(--color-ink-500)] font-mono"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Code incident : {error.digest}
            </p>
          )}

          <nav
            aria-label="Actions"
            className="mt-10 flex flex-col sm:flex-row gap-3 justify-center"
          >
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] transition-all"
              style={{ fontFamily: "var(--font-display)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Réessayer
            </button>
            <Link
              href="/"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-full border border-[var(--color-line)] text-[var(--color-ink-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-bone)] transition-all"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Retour à l&apos;accueil
            </Link>
          </nav>
        </div>
      </main>
      <FooterContent />
    </>
  );
}
