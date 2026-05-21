/**
 * Page Réservation — /reservation
 *
 * Server Component qui charge le catalog (services + options + bookable months)
 * et hydrate <ReservationFlow /> côté Client.
 *
 * Note SEO : page conversion, donc on bloque l'indexation.
 */

import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { ReservationFlow } from "./reservation-flow";
import { isStripeConfigured } from "@/lib/stripe";

export const metadata: Metadata = {
  title: "Réserver un rendez-vous",
  description:
    "Réservez votre prestation chez Clochette Nails. Acompte sécurisé via Stripe.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/reservation" },
};

export const dynamic = "force-dynamic"; // données live, pas d'ISR

export default async function ReservationPage() {
  const [services, options, bookableMonths, settings] = await Promise.all([
    prisma.service.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ category: "asc" }, { displayOrder: "asc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        shortDesc: true,
        category: true,
        durationMinutes: true,
        priceCents: true, // pour calcul d'acompte côté client
        disclaimer: true,
      },
    }),
    prisma.serviceOption.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { displayOrder: "asc" },
      select: {
        id: true,
        title: true,
        description: true,
        addedDurationMinutes: true,
        addedPriceCents: true, // pour calcul d'acompte côté client
        applicableCategories: true,
        disclaimer: true,
      },
    }),
    prisma.bookableMonth.findMany({
      orderBy: [{ year: "asc" }, { month: "asc" }],
      select: { year: true, month: true },
    }),
    prisma.platformSettings.findFirst({
      select: {
        depositMode: true,
        depositPercent: true,
        depositFixedCents: true,
        bookingsEnabled: true,
      },
    }),
  ]);

  if (settings && !settings.bookingsEnabled) {
    return (
      <main className="min-h-screen grid place-items-center p-6">
        <div className="text-center max-w-md">
          <h1 className="text-3xl mb-4" style={{ fontFamily: "var(--font-serif)" }}>
            Réservations temporairement fermées
          </h1>
          <p className="text-[var(--color-ink-500)]">
            Le salon est indisponible pour la prise de RDV en ligne. Contactez-nous
            par téléphone au 06 88 68 66 99.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--color-cream)]">
      <ReservationFlow
        services={services}
        options={options}
        bookableMonths={bookableMonths}
        stripeConfigured={isStripeConfigured()}
        depositSettings={
          settings
            ? {
                depositMode: settings.depositMode,
                depositPercent: settings.depositPercent,
                depositFixedCents: settings.depositFixedCents,
              }
            : null
        }
      />
    </main>
  );
}
