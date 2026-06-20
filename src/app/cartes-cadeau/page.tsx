/**
 * /cartes-cadeau — Page publique d'achat de cartes cadeau.
 *
 * Server Component qui vérifie le feature flag `giftCardsEnabled` côté
 * platformSettings. Si désactivé : page maintenance.
 */

import { safeJsonLd } from "@/lib/jsonld";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { GiftCardPurchaseForm } from "./purchase-form";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { SITE_URL, BEAUTYSALON_ID, breadcrumbJsonLd } from "@/lib/seo-jsonld";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await prisma.platformSettings.findFirst({
    select: { giftCardExpiryDays: true },
  });
  const validityMonths = Math.round((settings?.giftCardExpiryDays ?? 180) / 30);
  return {
    title: "Cartes cadeau · Clochette Nails",
    description: `Offrez une pause beauté. Carte cadeau Clochette Nails utilisable sur toutes les prestations du salon — valable ${validityMonths} mois.`,
    alternates: { canonical: "/cartes-cadeau" },
    openGraph: {
      title: "Offrez une carte cadeau Clochette Nails",
      description: `Une pause beauté à offrir : carte cadeau utilisable sur toutes les prestations du salon, valable ${validityMonths} mois.`,
      url: "/cartes-cadeau",
      type: "website",
      locale: "fr_FR",
      siteName: "Clochette Nails",
    },
  };
}

export const dynamic = "force-dynamic";

export default async function GiftCardsPublicPage() {
  const settings = await prisma.platformSettings.findFirst({
    select: { giftCardsEnabled: true, giftCardExpiryDays: true },
  });

  if (settings && !settings.giftCardsEnabled) {
    return (
      <>
        <SiteHeader />
        <main className="min-h-screen grid place-items-center p-6 pt-32">
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
        <SiteFooter />
      </>
    );
  }

  const validityMonths = Math.round(
    (settings?.giftCardExpiryDays ?? 180) / 30,
  );

  return (
    <>
      <SiteHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "Product",
            name: "Carte cadeau Clochette Nails",
            description: `Carte cadeau utilisable sur toutes les prestations du salon Clochette Nails, valable ${validityMonths} mois.`,
            brand: { "@type": "Brand", name: "Clochette Nails" },
            category: "Gift Card",
            image: `${SITE_URL}/opengraph-image.png`,
            offers: {
              "@type": "AggregateOffer",
              priceCurrency: "EUR",
              lowPrice: "10",
              highPrice: "1000",
              offerCount: 5,
              availability: "https://schema.org/InStock",
              url: `${SITE_URL}/cartes-cadeau`,
              seller: { "@id": BEAUTYSALON_ID },
            },
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(
            breadcrumbJsonLd([
              { name: "Accueil", path: "/" },
              { name: "Cartes cadeau", path: "/cartes-cadeau" },
            ]),
          ),
        }}
      />
      <main className="min-h-screen bg-[var(--color-cream)] pt-32 pb-20">
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
      <SiteFooter />
    </>
  );
}
