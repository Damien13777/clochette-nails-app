/**
 * Page success — /reservation/succes
 *
 * Accessible :
 *  - Via Stripe Checkout success redirect (?session_id=...)
 *  - Via fallback dev / gift-card-covered (?token=...)
 *
 * Server Component qui fetch la booking, valide la légitimité de l'accès,
 * et affiche le récap.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Réservation confirmée",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = {
  session_id?: string;
  token?: string;
};

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  // Trouve la booking soit par stripeSessionId, soit par confirmationToken
  const booking = await prisma.booking.findFirst({
    where: params.session_id
      ? { stripeSessionId: params.session_id }
      : params.token
      ? { confirmationToken: params.token }
      : { id: "__noop__" }, // force pas trouvé
    select: {
      id: true,
      status: true,
      date: true,
      startTime: true,
      endTime: true,
      depositCents: true,
      pendingGiftCardAmountCents: true,
      clientFirstName: true,
      clientEmail: true,
      totalDurationMinutes: true,
      service: { select: { title: true } },
      options: {
        select: {
          serviceOption: { select: { title: true } },
        },
      },
      giftCardRedemptions: {
        where: { type: "BOOKING_DEPOSIT" },
        select: { amountUsedCents: true },
      },
    },
  });

  if (!booking) {
    redirect("/reservation");
  }

  const isConfirmed = booking.status === "CONFIRMED";
  const isPending = booking.status === "AWAITING_DEPOSIT";

  return (
    <main className="min-h-screen bg-[var(--color-cream)] flex items-center justify-center px-6 py-16">
      <div className="max-w-lg w-full bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-8 md:p-10 text-center">
        {/* Icon */}
        <div
          className={`mx-auto w-16 h-16 rounded-full grid place-items-center mb-6 ${
            isConfirmed
              ? "bg-[var(--color-success)]/15 text-[var(--color-success)]"
              : "bg-[var(--color-violet-100)] text-[var(--color-violet-700)]"
          }`}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>

        <p
          className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {isConfirmed ? "Réservation confirmée" : "Paiement en cours"}
        </p>
        <h1
          className="text-3xl mt-3 mb-3"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Merci{" "}
          <em className="text-[var(--color-violet-700)]">
            {booking.clientFirstName}
          </em>
        </h1>

        {isPending && (
          <p
            className="text-sm text-[var(--color-ink-500)] mb-6"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Votre paiement est en cours de validation. Vous recevrez un email
            de confirmation dès qu&apos;il sera traité.
          </p>
        )}

        {isConfirmed && (
          <p
            className="text-sm text-[var(--color-ink-500)] mb-6"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Votre rendez-vous est réservé. Un email récapitulatif a été envoyé à{" "}
            <strong>{booking.clientEmail}</strong>.
          </p>
        )}

        {/* Récap */}
        <div className="text-left bg-[var(--color-bone)]/30 border border-[var(--color-line)] rounded-[var(--radius-sm)] p-5 mb-6 space-y-3">
          <Row label="Prestation" value={booking.service.title} />
          {booking.options.length > 0 && (
            <Row
              label="Options"
              value={booking.options.map((o) => o.serviceOption.title).join(", ")}
            />
          )}
          <Row
            label="Date"
            value={formatDateFr(booking.date)}
          />
          <Row label="Horaire" value={`${booking.startTime} – ${booking.endTime}`} />
          {(() => {
            const giftCardUsed = booking.giftCardRedemptions.reduce(
              (s, r) => s + r.amountUsedCents,
              0,
            );
            const pendingGiftCard =
              booking.status === "AWAITING_DEPOSIT"
                ? (booking.pendingGiftCardAmountCents ?? 0)
                : 0;
            const giftCardPortion = giftCardUsed + pendingGiftCard;
            const stripePortion = Math.max(
              0,
              booking.depositCents - giftCardPortion,
            );
            return (
              <>
                {giftCardPortion > 0 ? (
                  <>
                    <Row
                      label="Acompte demandé"
                      value={formatCents(booking.depositCents)}
                    />
                    <Row
                      label="Code cadeau"
                      value={`− ${formatCents(giftCardPortion)}`}
                    />
                    <Row
                      label={stripePortion === 0 ? "Total" : "Payé via carte"}
                      value={formatCents(stripePortion)}
                      emphasized
                    />
                  </>
                ) : (
                  <Row
                    label="Acompte"
                    value={formatCents(booking.depositCents)}
                    emphasized
                  />
                )}
              </>
            );
          })()}
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[var(--color-violet-600)] text-[var(--color-violet-700)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-50)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  emphasized,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span
        className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-500)] pt-0.5"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </span>
      <span
        className={`text-right ${emphasized ? "text-base text-[var(--color-violet-700)]" : "text-[var(--color-ink-900)]"}`}
        style={{
          fontFamily: emphasized ? "var(--font-serif)" : "var(--font-ui)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function formatDateFr(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}
