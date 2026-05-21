/**
 * /admin/cartes-cadeau/[id] — détail + historique redemptions + actions.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { GiftCardStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GiftCardActions } from "./gift-card-actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const card = await prisma.giftCard.findUnique({
    where: { id },
    select: { prefix: true },
  });
  return {
    title: card ? `Carte •${card.prefix} · Admin` : "Carte · Admin",
    robots: { index: false, follow: false },
  };
}

const STATUS_META: Record<GiftCardStatus, { label: string; cls: string }> = {
  ACTIVE: {
    label: "Active",
    cls: "bg-[var(--color-success)]/12 text-[var(--color-success)]",
  },
  PARTIALLY_USED: {
    label: "Entamée",
    cls: "bg-[var(--color-violet-100)] text-[var(--color-violet-700)]",
  },
  FULLY_USED: {
    label: "Épuisée",
    cls: "bg-[var(--color-bone)] text-[var(--color-ink-500)]",
  },
  EXPIRED: {
    label: "Expirée",
    cls: "bg-[var(--color-warning)]/12 text-[var(--color-warning)]",
  },
  REFUNDED: {
    label: "Remboursée",
    cls: "bg-[var(--color-bone)] text-[var(--color-ink-500)]",
  },
  CANCELLED: {
    label: "Annulée",
    cls: "bg-[var(--color-bone)] text-[var(--color-ink-500)]",
  },
  PENDING_PAYMENT: {
    label: "Paiement en cours",
    cls: "bg-[var(--color-bone)] text-[var(--color-ink-500)]",
  },
};

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

function paymentMethodLabel(method: string): string {
  switch (method) {
    case "cash":
      return "Espèces";
    case "transfer":
      return "Virement";
    case "check":
      return "Chèque";
    case "card_terminal":
      return "TPE / CB";
    default:
      return method;
  }
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateTime(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function GiftCardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  const { id } = await params;
  const card = await prisma.giftCard.findUnique({
    where: { id },
    include: {
      redemptions: {
        orderBy: { redeemedAt: "desc" },
        include: {
          booking: {
            select: {
              id: true,
              date: true,
              startTime: true,
              clientFirstName: true,
              clientLastName: true,
            },
          },
        },
      },
    },
  });
  if (!card) notFound();

  const status = STATUS_META[card.status];
  const isExpired = card.expiresAt < new Date();
  const usedCents = card.initialAmountCents - card.remainingAmountCents;
  const usedPercent =
    card.initialAmountCents > 0
      ? Math.round((usedCents / card.initialAmountCents) * 100)
      : 0;
  const isIntact = card.remainingAmountCents === card.initialAmountCents;

  return (
    <div className="max-w-[1200px] mx-auto p-6 lg:p-8 space-y-6">
      <nav>
        <Link
          href="/admin/cartes-cadeau"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-700)] hover:text-[var(--color-violet-700)] transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Retour aux cartes
        </Link>
      </nav>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        {/* Colonne principale */}
        <div className="space-y-6">
          <header className="space-y-2">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.06em] ${status.cls}`}
              style={{ fontFamily: "var(--font-display)" }}
            >
              {status.label}
            </span>
            <h1
              className="text-2xl md:text-3xl font-mono break-all"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Carte •{card.prefix}
            </h1>
            <p
              className={`text-sm ${
                isExpired && card.status !== "FULLY_USED"
                  ? "text-[var(--color-warning)]"
                  : "text-[var(--color-ink-500)]"
              }`}
              style={{ fontFamily: "var(--font-ui)" }}
            >
              {isExpired && card.status !== "FULLY_USED"
                ? `Expirée le ${formatDate(card.expiresAt)}`
                : `Valable jusqu'au ${formatDate(card.expiresAt)}`}
            </p>
          </header>

          {/* Bloc solde */}
          <section className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-4">
            <h2
              className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Solde
            </h2>
            <div className="flex items-baseline gap-3">
              <p
                className="text-4xl text-[var(--color-violet-700)]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {formatCents(card.remainingAmountCents)}
              </p>
              <p
                className="text-sm text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                / {formatCents(card.initialAmountCents)} initial
              </p>
            </div>
            <div className="w-full h-2 bg-[var(--color-bone)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--color-violet-600)] transition-all"
                style={{ width: `${100 - usedPercent}%` }}
              />
            </div>
            <p
              className="text-xs text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-ui)" }}
            >
              Utilisé : {formatCents(usedCents)} ({usedPercent}%)
            </p>
          </section>

          {/* Bloc bénéficiaire / acheteur */}
          <section className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-3">
            <h2
              className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Bénéficiaire & acheteur
            </h2>
            <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <Row
                label="Bénéficiaire"
                value={
                  card.recipientName || card.recipientEmail
                    ? `${card.recipientName ?? "—"}${
                        card.recipientEmail ? ` · ${card.recipientEmail}` : ""
                      }`
                    : "—"
                }
              />
              <Row
                label="Acheteur"
                value={`${card.buyerName} · ${card.buyerEmail}`}
              />
              <Row
                label="Livraison"
                value={
                  card.deliveryMode === "EMAIL_TO_RECIPIENT"
                    ? "Email au bénéficiaire"
                    : card.deliveryMode === "EMAIL_TO_BUYER"
                    ? "Email à l'acheteur"
                    : "PDF imprimable"
                }
              />
              <Row
                label="Émise le"
                value={formatDate(card.createdAt)}
              />
              {card.giftMessage && (
                <Row label="Message" value={card.giftMessage} fullWidth />
              )}
            </dl>
          </section>

          {/* Bloc paiement */}
          <section className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-3">
            <h2
              className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Paiement
            </h2>
            <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <Row
                label="Statut"
                value={
                  card.paymentStatus === "PAID"
                    ? "Payée"
                    : card.paymentStatus === "PENDING"
                    ? "En attente"
                    : card.paymentStatus
                }
              />
              <Row
                label="Origine"
                value={
                  card.creationMode === "PUBLIC"
                    ? "Achat en ligne (Stripe)"
                    : card.creationMode === "ADMIN_SALE"
                    ? "Vente en salon"
                    : "Cadeau offert (admin)"
                }
              />
              {card.creationMode === "ADMIN_SALE" && card.paymentMethod && (
                <Row
                  label="Mode de paiement"
                  value={paymentMethodLabel(card.paymentMethod)}
                />
              )}
              {card.refundedAmount !== null && card.refundedAmount > 0 && (
                <Row
                  label="Remboursé"
                  value={formatCents(card.refundedAmount)}
                />
              )}
            </dl>
          </section>

          {/* Bloc historique redemptions */}
          <section className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6 space-y-3">
            <h2
              className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Historique d&apos;utilisation
            </h2>
            {card.redemptions.length === 0 ? (
              <p
                className="text-sm text-[var(--color-ink-500)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                Aucune utilisation pour le moment.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {card.redemptions.map((r) => (
                  <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-sm text-[var(--color-ink-900)]"
                          style={{ fontFamily: "var(--font-ui)" }}
                        >
                          {r.type === "BOOKING_DEPOSIT"
                            ? "Acompte de réservation"
                            : r.type === "BOOKING_SERVICE"
                            ? "Paiement de prestation"
                            : "Achat ebook"}
                          {r.reversedAt && (
                            <span className="ml-2 text-[var(--color-warning)] text-xs">
                              (annulé)
                            </span>
                          )}
                        </p>
                        {r.booking && (
                          <Link
                            href={`/admin/bookings/${r.booking.id}`}
                            className="text-xs text-[var(--color-violet-700)] hover:underline"
                            style={{ fontFamily: "var(--font-ui)" }}
                          >
                            RDV {r.booking.clientFirstName}{" "}
                            {r.booking.clientLastName} ·{" "}
                            {r.booking.date.toLocaleDateString("fr-FR")}{" "}
                            {r.booking.startTime}
                          </Link>
                        )}
                        <p
                          className="text-xs text-[var(--color-ink-500)] mt-0.5"
                          style={{ fontFamily: "var(--font-ui)" }}
                        >
                          {formatDateTime(r.redeemedAt)} ·{" "}
                          {r.redeemedByEmail}
                        </p>
                      </div>
                      <p
                        className={`text-sm whitespace-nowrap ${
                          r.reversedAt
                            ? "text-[var(--color-ink-500)] line-through"
                            : "text-[var(--color-ink-900)]"
                        }`}
                        style={{ fontFamily: "var(--font-serif)" }}
                      >
                        −{formatCents(r.amountUsedCents)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Colonne droite : actions */}
        <aside>
          <div className="sticky top-20">
            <GiftCardActions
              id={card.id}
              status={card.status}
              expiresAtIso={card.expiresAt.toISOString()}
              hasStripePayment={!!card.stripePaymentId}
              isIntact={isIntact}
              canResendEmail={
                !!(card.recipientEmail ?? card.buyerEmail) &&
                !(card.recipientEmail ?? card.buyerEmail).startsWith("admin@")
              }
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  fullWidth,
}: {
  label: string;
  value: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? "sm:col-span-2" : ""}>
      <dt
        className="text-[var(--color-ink-500)] text-[10px] uppercase tracking-[0.14em]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </dt>
      <dd
        className="text-[var(--color-ink-900)] text-sm mt-0.5 break-words"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {value}
      </dd>
    </div>
  );
}
