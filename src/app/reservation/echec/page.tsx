/**
 * Page échec — /reservation/echec
 *
 * Accessible depuis le cancel_url Stripe. On libère le créneau
 * (passe la booking de AWAITING_DEPOSIT à EXPIRED) si on retrouve
 * la booking via le token.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Paiement non abouti",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = {
  token?: string;
};

export default async function FailurePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  // Libère le créneau si on retrouve la booking
  if (params.token) {
    await prisma.booking.updateMany({
      where: {
        confirmationToken: params.token,
        status: "AWAITING_DEPOSIT",
      },
      data: {
        status: "EXPIRED",
        cancelledAt: new Date(),
        cancellationReason: "Paiement annulé ou échoué",
      },
    });
  }

  return (
    <main className="min-h-screen bg-[var(--color-cream)] flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-8 md:p-10 text-center">
        <div className="mx-auto w-16 h-16 rounded-full grid place-items-center mb-6 bg-[var(--color-warning)]/15 text-[var(--color-warning)]">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </div>

        <p
          className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Paiement non abouti
        </p>
        <h1
          className="text-2xl mt-3 mb-4"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Votre créneau n&apos;a pas été réservé
        </h1>
        <p
          className="text-sm text-[var(--color-ink-500)] mb-6"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          Le paiement a été annulé ou n&apos;a pas pu aboutir. Aucun montant
          n&apos;a été débité. Vous pouvez recommencer la réservation à tout
          moment.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/reservation"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Recommencer
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full border border-[var(--color-ink-300)] text-[var(--color-ink-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-bone)] transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    </main>
  );
}
