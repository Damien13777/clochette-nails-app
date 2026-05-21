/**
 * /cartes-cadeau/echec — Page de retour si Stripe Checkout annulé/échoué.
 *
 * La carte cadeau reste en status PENDING_PAYMENT et sera nettoyée par un
 * futur cron (ou peut être réutilisée si la cliente relance le checkout).
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Paiement non finalisé · Carte cadeau",
  robots: { index: false, follow: false },
};

export default function GiftCardCancelPage() {
  return (
    <main className="min-h-screen bg-[var(--color-cream)] grid place-items-center py-12 px-5">
      <div className="max-w-md w-full bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-8 md:p-10 text-center space-y-5">
        <div className="mx-auto w-14 h-14 rounded-full grid place-items-center bg-[var(--color-warning)]/15 text-[var(--color-warning)]">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <div>
          <p
            className="text-xs uppercase tracking-[0.22em] text-[var(--color-warning)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Paiement non finalisé
          </p>
          <h1
            className="mt-3 text-2xl md:text-3xl"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            L&apos;achat n&apos;a pas abouti
          </h1>
        </div>

        <p
          className="text-sm text-[var(--color-ink-700)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Aucun montant n&apos;a été débité. Vous pouvez réessayer ou nous
          contacter directement si le problème persiste.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link
            href="/cartes-cadeau"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Réessayer
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-full border border-[var(--color-line)] text-[var(--color-ink-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-bone)] transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    </main>
  );
}
