/**
 * Page /admin/parametres — édition du singleton PlatformSettings.
 *
 * Couvre :
 *  - Identité salon (nom, SIRET, adresse, email/tel contact public)
 *  - Réservations (mode acompte, % ou montant fixe, délai min, granularité, politique annul)
 *  - Modules on/off (kill-switches) + mode maintenance
 *
 * Les paramètres "cartes cadeau" (expiry, min/max) seront édités depuis la
 * page A-6 quand on l'aura faite — plus contextuel là-bas.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = {
  title: "Paramètres · Admin",
};

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  const settings = await prisma.platformSettings.findFirstOrThrow({
    select: {
      businessName: true,
      businessSiret: true,
      businessAddress: true,
      contactEmail: true,
      contactPhone: true,
      depositMode: true,
      depositPercent: true,
      depositFixedCents: true,
      bookingMinAdvanceHours: true,
      bookingGranularityMinutes: true,
      bookingCancellationPolicy: true,
      bookingsEnabled: true,
      ebooksEnabled: true,
      blogEnabled: true,
      newsletterEnabled: true,
      giftCardsEnabled: true,
      maintenanceMode: true,
      maintenanceMessage: true,
      emailSignature: true,
      emailFooterNote: true,
      emailHeaderImageUrl: true,
      emailFooterImageUrl: true,
      invoiceHeaderName: true,
      invoiceLegalOwner: true,
      invoiceVatMention: true,
      invoiceLegalFooter: true,
      invoiceLogoUrl: true,
      updatedAt: true,
    },
  });

  return (
    <div className="max-w-3xl px-5 lg:px-8 py-10">
      <header className="mb-8">
        <p
          className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Configuration
        </p>
        <h1
          className="mt-3 text-[clamp(1.5rem,2.8vw,2rem)]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Paramètres
        </h1>
        <p
          className="mt-2 text-sm text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Identité salon, paramètres de réservation et activation des modules.
          Dernière modification :{" "}
          {settings.updatedAt.toLocaleString("fr-FR", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      </header>

      <SettingsForm
        initial={{
          businessName: settings.businessName,
          businessSiret: settings.businessSiret ?? "",
          businessAddress: settings.businessAddress ?? "",
          contactEmail: settings.contactEmail,
          contactPhone: settings.contactPhone ?? "",
          depositMode: settings.depositMode,
          depositPercent: settings.depositPercent,
          depositFixedCents: settings.depositFixedCents,
          bookingMinAdvanceHours: settings.bookingMinAdvanceHours,
          bookingGranularityMinutes: settings.bookingGranularityMinutes,
          bookingCancellationPolicy: settings.bookingCancellationPolicy ?? "",
          bookingsEnabled: settings.bookingsEnabled,
          ebooksEnabled: settings.ebooksEnabled,
          blogEnabled: settings.blogEnabled,
          newsletterEnabled: settings.newsletterEnabled,
          giftCardsEnabled: settings.giftCardsEnabled,
          maintenanceMode: settings.maintenanceMode,
          maintenanceMessage: settings.maintenanceMessage ?? "",
          emailSignature: settings.emailSignature,
          emailFooterNote: settings.emailFooterNote ?? "",
          emailHeaderImageUrl: settings.emailHeaderImageUrl,
          emailFooterImageUrl: settings.emailFooterImageUrl,
          invoiceHeaderName: settings.invoiceHeaderName ?? "",
          invoiceLegalOwner: settings.invoiceLegalOwner ?? "",
          invoiceVatMention: settings.invoiceVatMention,
          invoiceLegalFooter: settings.invoiceLegalFooter ?? "",
          invoiceLogoUrl: settings.invoiceLogoUrl,
        }}
      />

      <Link
        href="/admin/parametres/avis"
        className="mt-6 flex items-center justify-between bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 hover:border-[var(--color-violet-600)] transition-colors group"
      >
        <div>
          <h2
            className="text-xs uppercase tracking-[0.18em] text-[var(--color-ink-700)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Avis clientes
          </h2>
          <p
            className="mt-2 text-sm text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Gérer les avis affichés sur la page d&apos;accueil (ajout, ordre, publication).
          </p>
        </div>
        <span
          aria-hidden="true"
          className="text-[var(--color-ink-500)] group-hover:text-[var(--color-violet-700)] transition-colors"
        >
          →
        </span>
      </Link>
    </div>
  );
}
