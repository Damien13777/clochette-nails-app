/**
 * Page /reservation/annuler?token=…
 *
 * Accessible depuis le lien sécurisé du mail de confirmation.
 * Le token (clientActionToken) résout 5 états :
 *  - missing / invalid → message d'erreur
 *  - used → déjà annulé/déplacé
 *  - wrong-status → booking pas dans un état modifiable
 *  - too-late → < 72h, affiche CTA téléphone + email
 *  - actionable → form de confirmation
 */

import type { Metadata } from "next";
import Link from "next/link";
import { resolveClientToken } from "@/lib/booking-client-token";
import { prisma } from "@/lib/prisma";
import { CancelForm } from "./cancel-form";

export const metadata: Metadata = {
  title: "Annuler mon rendez-vous",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = {
  token?: string;
};

const PHONE_HREF = "tel:0688686699";
const EMAIL_HREF = "mailto:contact@clochette-nails.fr";

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

export default async function CancelPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { token } = await searchParams;
  const resolved = await resolveClientToken(token);

  // Si le booking est en état modifiable, on regarde s'il y a une portion
  // d'acompte payée par carte cadeau (BOOKING_DEPOSIT non-réversée).
  // Ça change le message et la logique : refund possible aussi via GC.
  let giftCardDeposit: { amountCents: number; prefix: string | null } | null =
    null;
  if (resolved.state === "actionable" || resolved.state === "too-late") {
    const redemptions = await prisma.giftCardRedemption.findMany({
      where: {
        bookingId: resolved.booking.id,
        type: "BOOKING_DEPOSIT",
        reversedAt: null,
      },
      select: {
        amountUsedCents: true,
        giftCard: { select: { prefix: true } },
      },
    });
    if (redemptions.length > 0) {
      giftCardDeposit = {
        amountCents: redemptions.reduce(
          (sum, r) => sum + r.amountUsedCents,
          0,
        ),
        prefix: redemptions[0].giftCard.prefix,
      };
    }
  }

  return (
    <main className="min-h-screen bg-[var(--color-cream)] flex items-center justify-center px-6 py-16">
      <div className="max-w-xl w-full bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-8 md:p-10">
        {resolved.state === "missing" || resolved.state === "invalid" ? (
          <ErrorCard
            title="Lien invalide"
            body="Ce lien n'est pas reconnu. Vérifiez qu'il provient bien de votre email de confirmation Clochette Nails, ou contactez-nous."
          />
        ) : resolved.state === "used" ? (
          <ErrorCard
            title="Lien déjà utilisé"
            body="Ce lien a déjà servi à annuler ou déplacer votre rendez-vous. Pour toute modification supplémentaire, contactez directement le salon."
          />
        ) : resolved.state === "wrong-status" ? (
          <ErrorCard
            title="Réservation non modifiable"
            body={`Cette réservation n'est plus active (statut : ${resolved.status}). Si vous pensez qu'il s'agit d'une erreur, contactez le salon.`}
          />
        ) : resolved.state === "too-late" || resolved.state === "actionable" ? (
          <ActionableCard
            booking={resolved.booking}
            hoursLeft={resolved.hoursLeft}
            token={token!}
            // depositKept = true SAUF si on peut rembourser :
            //  - state actionable ET (paiement Stripe OU acompte payé via GC)
            depositKept={
              resolved.state === "too-late" ||
              (resolved.booking.paymentMethod !== "stripe" &&
                !giftCardDeposit)
            }
            paymentMethod={resolved.booking.paymentMethod}
            isTooLate={resolved.state === "too-late"}
            giftCardDeposit={giftCardDeposit}
          />
        ) : null}
      </div>
    </main>
  );
}

// ─── Sous-composants UI ────────────────────────────────────────

function ErrorCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center">
      <div className="mx-auto w-14 h-14 rounded-full grid place-items-center mb-6 bg-[var(--color-warning)]/15 text-[var(--color-warning)]">
        <svg
          width="28"
          height="28"
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
        Annulation impossible
      </p>
      <h1 className="text-2xl mt-3 mb-4" style={{ fontFamily: "var(--font-serif)" }}>
        {title}
      </h1>
      <p
        className="text-sm text-[var(--color-ink-500)] mb-6"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {body}
      </p>
      <ContactRow />
      <div className="mt-6">
        <Link
          href="/"
          className="text-xs uppercase tracking-[0.06em] text-[var(--color-ink-500)] hover:text-[var(--color-ink-900)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          ← Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}

/** Détermine la "raison" de la conservation de l'acompte selon le contexte. */
type DepositKeptReason =
  | "stripe-too-late" // Paiement Stripe, mais <72h → CGV §11 délai dépassé
  | "paid-in-person" // Paiement physique → CGV §11 paiement main propre
  | "no-deposit"; // Pas d'acompte → annulation libre

function ActionableCard({
  booking,
  hoursLeft,
  token,
  depositKept,
  paymentMethod,
  isTooLate,
  giftCardDeposit,
}: {
  booking: {
    date: Date;
    startTime: string;
    endTime: string;
    serviceTitle: string;
    clientFirstName: string;
    depositCents: number;
  };
  hoursLeft: number;
  token: string;
  /** true si l'acompte est conservé (pas de refund) */
  depositKept: boolean;
  /** Mode paiement effectif (cash, transfer, stripe, none, etc.) */
  paymentMethod: string | null;
  /** true si on est dans les 72h avant le RDV */
  isTooLate: boolean;
  /** Si défini, portion d'acompte payée par carte cadeau (re-créditée au refund). */
  giftCardDeposit: { amountCents: number; prefix: string | null } | null;
}) {
  const dateFr = formatDateFr(booking.date);
  const daysLeft = Math.floor(hoursLeft / 24);
  const hoursLeftRounded = Math.max(0, Math.round(hoursLeft));

  // Détermine la raison précise de la conservation pour adapter le wording
  const keptReason: DepositKeptReason | null = !depositKept
    ? null
    : paymentMethod === "none"
      ? "no-deposit"
      : isTooLate && paymentMethod === "stripe"
        ? "stripe-too-late"
        : "paid-in-person";

  // Type de remboursement (uniquement si !depositKept)
  const stripePortion =
    paymentMethod === "stripe"
      ? Math.max(0, booking.depositCents - (giftCardDeposit?.amountCents ?? 0))
      : 0;
  const refundType: "stripe-only" | "gc-only" | "mixed" | null = depositKept
    ? null
    : stripePortion > 0 && giftCardDeposit
      ? "mixed"
      : giftCardDeposit
        ? "gc-only"
        : "stripe-only";

  const intro = (() => {
    if (keptReason === "no-deposit")
      return "Vous êtes sur le point d'annuler le rendez-vous suivant. Aucun acompte n'avait été versé.";
    if (depositKept)
      return "Vous êtes sur le point d'annuler le rendez-vous suivant.";
    if (refundType === "gc-only")
      return `Vous êtes sur le point d'annuler le rendez-vous suivant. L'acompte sera re-crédité immédiatement sur votre carte cadeau${giftCardDeposit?.prefix ? ` ••${giftCardDeposit.prefix}` : ""}.`;
    if (refundType === "mixed")
      return `Vous êtes sur le point d'annuler le rendez-vous suivant. Vous serez remboursée : ${formatCents(stripePortion)} sur votre carte bancaire (3-5j) et ${formatCents(giftCardDeposit?.amountCents ?? 0)} re-crédités immédiatement sur votre carte cadeau${giftCardDeposit?.prefix ? ` ••${giftCardDeposit.prefix}` : ""}.`;
    return "Vous êtes sur le point d'annuler le rendez-vous suivant. L'acompte vous sera intégralement remboursé sous 3 à 5 jours ouvrés.";
  })();

  return (
    <div>
      <div className="text-center mb-6">
        <p
          className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Annulation en ligne
        </p>
        <h1
          className="text-2xl mt-3 mb-3"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Bonjour {booking.clientFirstName},
        </h1>
        <p
          className="text-sm text-[var(--color-ink-700)]"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {intro}
        </p>
      </div>

      <div className="bg-[var(--color-cream)] border border-[var(--color-line)] rounded-[var(--radius-sm)] p-5 mb-6">
        <p
          className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-500)] mb-2"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Rendez-vous à annuler
        </p>
        <p
          className="text-lg text-[var(--color-ink-900)] capitalize mb-1"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {dateFr}
        </p>
        <p
          className="text-sm text-[var(--color-ink-700)] mb-3"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {booking.startTime} – {booking.endTime} · {booking.serviceTitle}
        </p>
        {booking.depositCents > 0 && (
          <div className="border-t border-[var(--color-line)] pt-3 flex items-baseline justify-between text-sm">
            <span style={{ fontFamily: "var(--font-ui)" }} className="text-[var(--color-ink-500)]">
              {depositKept ? "Acompte" : "Acompte à rembourser"}
            </span>
            <span
              className="text-[var(--color-ink-900)] font-medium"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {formatCents(booking.depositCents)}
            </span>
          </div>
        )}
      </div>

      {keptReason === "stripe-too-late" ? (
        <div className="bg-[#fff5f0] border border-[#f0c8b0] rounded-[var(--radius-sm)] px-4 py-4 mb-6">
          <p
            className="text-xs uppercase tracking-[0.14em] text-[#c87850] mb-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            ⚠ Délai dépassé — Acompte conservé
          </p>
          <p
            className="text-sm text-[var(--color-ink-700)] leading-relaxed mb-2"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Votre rendez-vous est dans moins de 72 heures (environ{" "}
            <strong className="text-[var(--color-ink-900)]">{hoursLeftRounded} h</strong>).
            Conformément aux{" "}
            <Link
              href="/cgv#annulation"
              target="_blank"
              className="text-[var(--color-violet-700)] underline"
            >
              CGV §11
            </Link>{" "}
            que vous avez acceptées lors de votre réservation,{" "}
            <strong className="text-[var(--color-ink-900)]">
              l&apos;acompte de {formatCents(booking.depositCents)} sera conservé
            </strong>{" "}
            à titre d&apos;indemnité forfaitaire.
          </p>
          <p
            className="text-sm text-[var(--color-ink-700)] leading-relaxed"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Si vous préférez éviter cette indemnité, vous pouvez{" "}
            <a
              href={PHONE_HREF}
              className="text-[var(--color-violet-700)] underline"
            >
              appeler le salon
            </a>{" "}
            pour discuter d&apos;un éventuel arrangement.
          </p>
        </div>
      ) : keptReason === "paid-in-person" ? (
        <div className="bg-[#fff5f0] border border-[#f0c8b0] rounded-[var(--radius-sm)] px-4 py-4 mb-6">
          <p
            className="text-xs uppercase tracking-[0.14em] text-[#c87850] mb-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            ⚠ Acompte conservé (paiement en main propre)
          </p>
          <p
            className="text-sm text-[var(--color-ink-700)] leading-relaxed mb-2"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            L&apos;acompte de cette réservation a été réglé directement au salon.
            Conformément aux{" "}
            <Link
              href="/cgv#annulation"
              target="_blank"
              className="text-[var(--color-violet-700)] underline"
            >
              CGV §11
            </Link>
            ,{" "}
            <strong className="text-[var(--color-ink-900)]">
              l&apos;acompte de {formatCents(booking.depositCents)} est conservé
            </strong>{" "}
            à titre d&apos;indemnité forfaitaire et n&apos;est pas remboursable
            via ce lien.
          </p>
          <p
            className="text-sm text-[var(--color-ink-700)] leading-relaxed"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Pour toute demande spécifique,{" "}
            <a
              href={PHONE_HREF}
              className="text-[var(--color-violet-700)] underline"
            >
              appelez le salon
            </a>
            .
          </p>
        </div>
      ) : keptReason === "no-deposit" ? (
        <div className="bg-[var(--color-violet-50)] border border-[var(--color-violet-600)]/30 rounded-[var(--radius-sm)] px-4 py-4 mb-6">
          <p
            className="text-xs uppercase tracking-[0.14em] text-[var(--color-violet-700)] mb-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Annulation libre
          </p>
          <p
            className="text-sm text-[var(--color-ink-700)] leading-relaxed"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Aucun acompte n&apos;avait été versé pour ce rendez-vous. Vous pouvez
            l&apos;annuler librement, sans pénalité.
          </p>
        </div>
      ) : (
        <div className="bg-[var(--color-violet-50)] border-l-2 border-[var(--color-violet-600)] rounded-r-[var(--radius-sm)] px-4 py-3 mb-6">
          <p
            className="text-xs text-[var(--color-ink-700)] leading-relaxed"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            <strong style={{ fontFamily: "var(--font-display)" }} className="uppercase tracking-[0.06em]">
              Bon à savoir —
            </strong>{" "}
            Ce lien ne peut être utilisé qu&apos;une seule fois. Une fois confirmée,
            l&apos;annulation est définitive. Il reste{" "}
            {daysLeft > 0 ? `${daysLeft} jour${daysLeft > 1 ? "s" : ""}` : `${Math.round(hoursLeft)} h`} avant
            votre RDV.
          </p>
        </div>
      )}

      <CancelForm token={token} depositKept={depositKept} />

      {!depositKept && (
        <div className="mt-6 pt-6 border-t border-[var(--color-line)] text-center">
          <p
            className="text-xs text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            Vous préférez déplacer plutôt qu&apos;annuler ?{" "}
            <Link
              href={`/reservation/deplacer?token=${token}`}
              className="text-[var(--color-violet-700)] hover:underline"
            >
              Modifier la date
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}

function ContactRow() {
  return (
    <div className="flex flex-col sm:flex-row gap-3 justify-center">
      <a
        href={PHONE_HREF}
        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[var(--color-violet-600)] text-white text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-700)] transition-colors"
        style={{ fontFamily: "var(--font-display)" }}
      >
        📞 Appeler le salon
      </a>
      <a
        href={EMAIL_HREF}
        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full border border-[var(--color-violet-600)] text-[var(--color-violet-600)] text-xs uppercase tracking-[0.06em] hover:bg-[var(--color-violet-50)] transition-colors"
        style={{ fontFamily: "var(--font-display)" }}
      >
        ✉️ Email
      </a>
    </div>
  );
}
