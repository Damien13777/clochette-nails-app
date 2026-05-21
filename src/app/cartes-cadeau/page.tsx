/**
 * /cartes-cadeau — Page publique d'achat de cartes cadeau.
 *
 * Server Component qui vérifie le feature flag `giftCardsEnabled` côté
 * platformSettings. Si désactivé : page maintenance.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { GiftCardPurchaseForm } from "./purchase-form";

export const metadata: Metadata = {
  title: "Cartes cadeau · Clochette Nails",
  description:
    "Offrez une pause beauté. Carte cadeau Clochette Nails utilisable sur toutes les prestations du salon — valable 12 mois.",
  alternates: { canonical: "/cartes-cadeau" },
};

export const dynamic = "force-dynamic";

export default async function GiftCardsPublicPage() {
  const settings = await prisma.platformSettings.findFirst({
    select: { giftCardsEnabled: true, giftCardExpiryDays: true },
  });

  if (settings && !settings.giftCardsEnabled) {
    return (
      <main className="min-h-screen grid place-items-center p-6">
        <div className="text-center max-w-md">
          <h1
            className="text-3xl mb-4"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Cartes cadeau temporairement indisponibles
          </h1>
          <p className="text-[var(--color-ink-500)]">
            La vente de cartes cadeau est suspendue. Contactez le salon par
            téléphone pour toute demande exceptionnelle.
          </p>
        </div>
      </main>
    );
  }

  const validityMonths = Math.round(
    (settings?.giftCardExpiryDays ?? 180) / 30,
  );

  return (
    <main className="min-h-screen bg-[var(--color-cream)] py-12 md:py-20">
      <div className="max-w-2xl mx-auto px-5 lg:px-8">
        {/* Hero */}
        <header className="text-center mb-10">
          <p
            className="text-xs uppercase tracking-[0.22em] text-[var(--color-violet-700)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Offrir une pause beauté
          </p>
          <h1
            className="mt-4 text-[clamp(2rem,4vw,3rem)] leading-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Carte cadeau Clochette Nails
          </h1>
          <Link
            href="/"
            className="inline-flex items-center gap-1 mt-4 text-sm text-[var(--color-ink-500)] hover:text-[var(--color-violet-700)] transition-colors"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Retour au site
          </Link>
          <p
            className="mt-4 text-sm text-[var(--color-ink-700)] max-w-md mx-auto"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Utilisable pour régler une réservation en ligne, acheter un ebook,
            ou payer directement votre prestation au salon. Valable{" "}
            {validityMonths} mois à compter de l&apos;achat.
          </p>
        </header>

        <GiftCardPurchaseForm />
      </div>
    </main>
  );
}
