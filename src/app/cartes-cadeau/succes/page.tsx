/**
 * /cartes-cadeau/succes — Page de confirmation après achat Stripe.
 *
 * Affichée immédiatement au retour Stripe Checkout. L'activation effective
 * de la carte (status ACTIVE + envoi emails) est gérée par le webhook
 * Stripe (asynchrone, peut prendre quelques secondes).
 *
 * Le `token` dans l'URL est l'ID de la session Stripe ({CHECKOUT_SESSION_ID}).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";

export const metadata: Metadata = {
  title: "Achat confirmé · Carte cadeau Clochette Nails",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = { token?: string };

export default async function GiftCardSuccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { token } = await searchParams;

  // Lookup carte via stripeSessionId pour confirmer le succès et lire les infos.
  // Si webhook pas encore traité, on affiche un message d'attente.
  const card = token
    ? await prisma.giftCard.findFirst({
        where: { stripeSessionId: token },
        select: {
          status: true,
          initialAmountCents: true,
          recipientName: true,
          recipientEmail: true,
          buyerEmail: true,
          buyerName: true,
        },
      })
    : null;

  const isActive = card?.status === "ACTIVE";
  const isPending = card?.status === "PENDING_PAYMENT";

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-[var(--color-cream)] grid place-items-center pt-32 pb-20 px-5">
      <div className="max-w-md w-full bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-8 md:p-10 text-center space-y-5">
        <div className="mx-auto w-14 h-14 rounded-full grid place-items-center bg-[var(--color-success)]/15 text-[var(--color-success)]">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <div>
          <p
            className="text-xs uppercase tracking-[0.22em] text-[var(--color-success)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Paiement confirmé
          </p>
          <h1
            className="mt-3 text-2xl md:text-3xl"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Merci pour votre achat !
          </h1>
        </div>

        {card ? (
          <div className="space-y-3">
            <p
              className="text-sm text-[var(--color-ink-700)]"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              {isActive ? (
                <>
                  Votre carte cadeau de{" "}
                  <strong>
                    {(card.initialAmountCents / 100).toFixed(2)} €
                  </strong>{" "}
                  est active.
                </>
              ) : isPending ? (
                <>
                  Votre paiement est confirmé. La carte est en cours
                  d&apos;activation (quelques secondes).
                </>
              ) : (
                "Votre carte cadeau est en cours de traitement."
              )}
            </p>
            <div
              className="text-sm text-[var(--color-ink-700)] text-left bg-[var(--color-violet-50)]/40 border border-[var(--color-violet-100)] rounded-[var(--radius-sm)] p-4 space-y-2"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              {card.recipientEmail && card.recipientEmail !== card.buyerEmail ? (
                <>
                  <p>
                    ✉️ La carte cadeau a bien été transmise à{" "}
                    <strong>{card.recipientName}</strong> par email à{" "}
                    <strong>{card.recipientEmail}</strong>.
                  </p>
                  <p>
                    🧾 Votre reçu d&apos;achat vient d&apos;être envoyé à{" "}
                    <strong>{card.buyerEmail}</strong>.
                  </p>
                </>
              ) : (
                <p>
                  ✉️ La carte cadeau et le reçu d&apos;achat viennent de vous
                  être envoyés à <strong>{card.buyerEmail}</strong>.
                </p>
              )}
            </div>
          </div>
        ) : (
          <p
            className="text-sm text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Votre paiement est confirmé. L&apos;email avec le code arrive dans
            quelques secondes.
          </p>
        )}

        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
      </main>
      <SiteFooter />
    </>
  );
}
