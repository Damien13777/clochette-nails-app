/**
 * Page /admin/bookings/[id] — détail d'une réservation.
 *
 * Server Component qui fetch la booking + relations puis affiche :
 *  - Status badge + back link
 *  - Bloc client (nom, email, téléphone)
 *  - Bloc réservation (service, options, créneau, durée)
 *  - Bloc tarification (total, acompte, frais Stripe, refunded)
 *  - Message client si présent
 *  - Notes admin (éditable, Client component)
 *  - Panneau actions à droite (Client component, contextuel selon status)
 */

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  STATUS_VISUAL,
  formatBookingDate,
  formatCents,
  formatDuration,
} from "@/lib/booking-display";
import { BookingActions } from "./booking-actions";
import { BookingPhotos } from "./booking-photos";
import { InvoiceBlock } from "@/components/admin/invoice-block";
import { BookingNotes } from "./booking-notes";
import { BookingReminders } from "./booking-reminders";
import { PaymentBlock } from "./payment-block";
import { RecalculateStripeFeeButton } from "@/components/admin/recalculate-stripe-fee";
import { BackButton } from "@/components/admin/back-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Réservation ${id.slice(0, 8)} · Admin` };
}

export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  const { id } = await params;
  const { from } = await searchParams;
  const backHref = from ? `/admin/bookings?${from}` : "/admin/bookings";

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      service: { select: { title: true, slug: true } },
      options: {
        include: {
          serviceOption: {
            select: { title: true, addedDurationMinutes: true },
          },
        },
      },
      giftCardRedemptions: {
        // Inclut DEPOSIT (acompte) ET SERVICE (complément markCompleted).
        // Le filtre par type est fait côté composant pour distinguer les deux.
        include: {
          giftCard: {
            select: { code: true, prefix: true },
          },
        },
      },
      files: {
        select: { id: true, url: true, originalName: true, sizeBytes: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!booking) notFound();

  const visual = STATUS_VISUAL[booking.status];
  const isStripePaid = !!booking.stripePaymentId;

  // Catalogue éditable (changement de prestation depuis le dialog Modifier).
  // Chargé seulement pour les statuts éditables — sinon listes vides.
  const reviewSettings = await prisma.platformSettings.findFirst({
    select: { googleReviewUrl: true },
  });

  const isEditable =
    booking.status === "AWAITING_DEPOSIT" || booking.status === "CONFIRMED";
  const [editableServices, editableOptions] = isEditable
    ? await Promise.all([
        prisma.service.findMany({
          where: { status: "PUBLISHED" },
          orderBy: { displayOrder: "asc" },
          select: {
            id: true,
            title: true,
            category: true,
            durationMinutes: true,
            priceCents: true,
          },
        }),
        prisma.serviceOption.findMany({
          where: { status: "PUBLISHED" },
          orderBy: { displayOrder: "asc" },
          select: {
            id: true,
            title: true,
            applicableCategories: true,
            addedDurationMinutes: true,
            addedPriceCents: true,
          },
        }),
      ])
    : [[], []];

  return (
    <div className="max-w-[1400px] px-5 lg:px-8 py-10">
      {/* Back link — revient à la page précédente (calendrier+semaine, liste+filtre…) */}
      <BackButton fallbackHref={backHref} />

      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8 mb-10">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.12em] whitespace-nowrap ${visual.bgClass} ${visual.textClass}`}
              style={{ fontFamily: "var(--font-display)" }}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${visual.dotClass}`} />
              {visual.label}
            </span>
            <span
              className="text-xs text-[var(--color-ink-500)] font-mono"
            >
              #{booking.id.slice(0, 8)}
            </span>
          </div>
          <h1
            className="text-[clamp(1.75rem,3vw,2.25rem)] leading-tight capitalize"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {formatBookingDate(booking.date)}
          </h1>
          <p
            className="mt-2 text-base text-[var(--color-ink-700)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            {booking.startTime} – {booking.endTime}
            <span className="text-[var(--color-ink-500)]">
              {" "}· {formatDuration(booking.totalDurationMinutes)}
            </span>
          </p>
        </div>
      </header>

      {/* Layout 2 cols desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-8">
        {/* ── Colonne gauche : info ─────────────────── */}
        <div className="space-y-6 min-w-0">
          {/* Client */}
          <Section title="Cliente">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Nom"
                value={`${booking.clientFirstName} ${booking.clientLastName}`}
              />
              <Field label="Email" value={booking.clientEmail} mono />
              <Field label="Téléphone" value={booking.clientPhone} mono />
            </dl>
          </Section>

          {/* Prestation */}
          <Section title="Prestation">
            <dl className="space-y-3">
              <Field label="Service" value={booking.service.title} />
              {booking.options.length > 0 && (
                <div>
                  <dt
                    className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)] mb-1"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Options
                  </dt>
                  <ul className="space-y-1 text-sm">
                    {booking.options.map((o, i) => (
                      <li
                        key={`${booking.id}-opt-${i}`}
                        className="flex justify-between gap-3"
                        style={{ fontFamily: "var(--font-ui)" }}
                      >
                        <span>{o.serviceOption.title}</span>
                        <span className="text-[var(--color-ink-500)] text-xs shrink-0">
                          +{o.serviceOption.addedDurationMinutes} min
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Field
                label="Durée totale"
                value={formatDuration(booking.totalDurationMinutes)}
              />
            </dl>
          </Section>

          {/* Tarification */}
          <Section title="Tarification">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Total prestation" value={formatCents(booking.totalPriceCents)} />
              <Field label="Acompte demandé" value={formatCents(booking.depositCents)} emphasized />
              {booking.stripePaymentId != null && (
                <Field
                  label="Frais Stripe (acompte)"
                  value={
                    booking.stripeFeeCents != null
                      ? formatCents(booking.stripeFeeCents)
                      : "— (webhook charge.updated en attente)"
                  }
                  action={
                    booking.stripeFeeCents == null ? (
                      <RecalculateStripeFeeButton resource="booking" id={booking.id} />
                    ) : null
                  }
                />
              )}
              {booking.refundedAmount != null && booking.refundedAmount > 0 && (
                <Field
                  label="Remboursé"
                  value={formatCents(booking.refundedAmount)}
                />
              )}
            </dl>

            {/* Breakdown du paiement de l'acompte */}
            {(() => {
              const depositRedemptions = booking.giftCardRedemptions.filter(
                (r) => r.type === "BOOKING_DEPOSIT" && !r.reversedAt,
              );
              const reversedDepositRedemptions =
                booking.giftCardRedemptions.filter(
                  (r) => r.type === "BOOKING_DEPOSIT" && r.reversedAt,
                );
              const redemptionAmount = depositRedemptions.reduce(
                (sum, r) => sum + r.amountUsedCents,
                0,
              );
              const reversedAmount = reversedDepositRedemptions.reduce(
                (sum, r) => sum + (r.reversedAmountCents ?? 0),
                0,
              );
              const pendingAmount = booking.pendingGiftCardAmountCents ?? 0;
              // On affiche le breakdown dès qu'une carte cadeau a été impliquée :
              //  - redemption confirmée (source de vérité) si présente
              //  - sinon redemption reversée (l'acompte GC a été re-crédité après annulation)
              //  - sinon le montant "pending" (intention au moment de la création)
              const giftCardPortion =
                redemptionAmount > 0
                  ? redemptionAmount
                  : reversedAmount > 0
                    ? reversedAmount
                    : pendingAmount;
              const hasGiftCard =
                giftCardPortion > 0 || !!booking.pendingGiftCardId;
              if (!hasGiftCard) return null;

              const stripePortion = Math.max(
                0,
                booking.depositCents - giftCardPortion,
              );
              const giftCardLabel =
                depositRedemptions[0]?.giftCard.prefix ??
                reversedDepositRedemptions[0]?.giftCard.prefix ??
                null;
              // Statut visuel de la redemption :
              //  - "applied" si redemption confirmée en DB
              //  - "reversed" si redemption re-créditée (annulation > 72h avec acompte GC)
              //  - "pending" si AWAITING_DEPOSIT (paiement Stripe pas reçu)
              //  - "missing" si CONFIRMED mais pas de redemption (anomalie)
              const redemptionStatus =
                redemptionAmount > 0
                  ? "applied"
                  : reversedAmount > 0
                    ? "reversed"
                    : booking.status === "AWAITING_DEPOSIT"
                      ? "pending"
                      : "missing";

              return (
                <div className="mt-5 pt-5 border-t border-[var(--color-line)] space-y-2">
                  <p
                    className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)] mb-2"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Répartition du paiement
                  </p>
                  <div
                    className="flex justify-between items-baseline text-sm flex-wrap gap-y-1"
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    <span
                      className={
                        redemptionStatus === "reversed"
                          ? "text-[var(--color-ink-500)]"
                          : "text-[var(--color-success)]"
                      }
                    >
                      Carte cadeau
                      {giftCardLabel && (
                        <span className="ml-1.5 font-mono text-[11px] text-[var(--color-ink-500)]">
                          …{giftCardLabel}
                        </span>
                      )}
                      {redemptionStatus === "pending" && (
                        <span className="ml-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--color-warning)]">
                          (en attente)
                        </span>
                      )}
                      {redemptionStatus === "missing" && (
                        <span className="ml-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--color-danger)]">
                          (non confirmée)
                        </span>
                      )}
                      {redemptionStatus === "reversed" && (
                        <span className="ml-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-500)]">
                          (re-créditée)
                        </span>
                      )}
                    </span>
                    <span
                      className={
                        redemptionStatus === "reversed"
                          ? "text-[var(--color-ink-500)] line-through"
                          : "text-[var(--color-success)]"
                      }
                    >
                      − {formatCents(giftCardPortion)}
                    </span>
                  </div>
                  <div
                    className="flex justify-between items-baseline text-sm"
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    <span className="text-[var(--color-ink-700)]">
                      Via Stripe
                    </span>
                    <span className="text-[var(--color-ink-900)]">
                      {formatCents(stripePortion)}
                    </span>
                  </div>
                </div>
              );
            })()}
          </Section>

          {/* Paiement — adapté selon le mode (Stripe, physique, sans acompte) */}
          <Section title="Paiement">
            <PaymentBlock
              paymentMethod={booking.paymentMethod}
              paidAt={booking.paidAt}
              confirmedAt={booking.confirmedAt}
              depositCents={booking.depositCents}
              giftCardAmountCents={booking.giftCardRedemptions
                .filter((r) => r.type === "BOOKING_DEPOSIT" && !r.reversedAt)
                .reduce((sum, r) => sum + r.amountUsedCents, 0)}
              stripeSessionId={booking.stripeSessionId}
              stripePaymentId={booking.stripePaymentId}
              createdByAdmin={booking.createdByAdmin}
              completion={
                booking.status === "COMPLETED"
                  ? (() => {
                      const svcRedemptions = booking.giftCardRedemptions.filter(
                        (r) => r.type === "BOOKING_SERVICE" && !r.reversedAt,
                      );
                      return {
                        revenueCents: booking.revenueCents ?? 0,
                        completionPaymentMethod:
                          booking.completionPaymentMethod,
                        giftCardServiceCents: svcRedemptions.reduce(
                          (sum, r) => sum + r.amountUsedCents,
                          0,
                        ),
                        giftCardServicePrefix:
                          svcRedemptions[0]?.giftCard.prefix ?? null,
                        completedAt: booking.completedAt,
                      };
                    })()
                  : null
              }
            />
          </Section>

          {/* Facture de la prestation (générée au markCompleted, fallback ici) */}
          <InvoiceBlock
            source={{ sourceType: "BOOKING", bookingId: booking.id }}
            canGenerate={booking.status === "COMPLETED"}
          />

          {/* Message client */}
          {booking.clientMessage && (
            <Section title="Message de la cliente">
              <p
                className="text-sm whitespace-pre-wrap text-[var(--color-ink-700)]"
                style={{ fontFamily: "var(--font-ui)" }}
              >
                {booking.clientMessage}
              </p>
            </Section>
          )}

          {/* Photos jointes par la cliente */}
          {booking.files.length > 0 && (
            <Section title={`Photos jointes (${booking.files.length})`}>
              <BookingPhotos files={booking.files} />
            </Section>
          )}

          {/* Annulation */}
          {(booking.cancelledAt || booking.cancellationReason) && (
            <Section title="Annulation">
              <dl className="space-y-3">
                {booking.cancelledAt && (
                  <Field
                    label="Annulée le"
                    value={booking.cancelledAt.toLocaleString("fr-FR")}
                  />
                )}
                {booking.cancellationReason && (
                  <Field label="Raison" value={booking.cancellationReason} />
                )}
              </dl>

              {/* Détail du remboursement effectué */}
              {(() => {
                const stripeRefunded = booking.refundedAmount ?? 0;
                const reversedRedemptions =
                  booking.giftCardRedemptions.filter(
                    (r) => r.type === "BOOKING_DEPOSIT" && r.reversedAt,
                  );
                const gcReversed = reversedRedemptions.reduce(
                  (sum, r) => sum + (r.reversedAmountCents ?? 0),
                  0,
                );
                const total = stripeRefunded + gcReversed;
                if (total === 0) return null;
                const gcPrefix =
                  reversedRedemptions[0]?.giftCard.prefix ?? null;
                return (
                  <div className="mt-5 pt-5 border-t border-[var(--color-line)]">
                    <p
                      className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)] mb-3"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      Remboursement effectué
                    </p>
                    <dl
                      className="space-y-1.5 text-sm"
                      style={{ fontFamily: "var(--font-ui)" }}
                    >
                      {stripeRefunded > 0 && (
                        <div className="flex justify-between">
                          <dt className="text-[var(--color-ink-700)]">
                            Via Stripe (3-5 jours ouvrés)
                          </dt>
                          <dd className="text-[var(--color-ink-900)]">
                            {formatCents(stripeRefunded)}
                          </dd>
                        </div>
                      )}
                      {gcReversed > 0 && (
                        <div className="flex justify-between">
                          <dt className="text-[var(--color-ink-700)]">
                            Re-crédité sur carte cadeau
                            {gcPrefix && (
                              <span className="ml-1.5 font-mono text-[11px] text-[var(--color-ink-500)]">
                                ••{gcPrefix}
                              </span>
                            )}
                          </dt>
                          <dd className="text-[var(--color-ink-900)]">
                            {formatCents(gcReversed)}
                          </dd>
                        </div>
                      )}
                      <div className="flex justify-between pt-2 border-t border-[var(--color-line)] font-medium">
                        <dt className="text-[var(--color-ink-900)]">Total</dt>
                        <dd className="text-[var(--color-violet-700)]">
                          {formatCents(total)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                );
              })()}
            </Section>
          )}

          {/* Rappels par mail (J-7 / J-1) */}
          <Section title="Rappels par mail">
            <BookingReminders
              bookingId={booking.id}
              bookingDate={booking.date.toISOString()}
              status={booking.status}
              reminderJ7SentAt={booking.reminderJ7SentAt?.toISOString() ?? null}
              reminderJ1SentAt={booking.reminderJ1SentAt?.toISOString() ?? null}
              reminderJ7OpenedAt={booking.reminderJ7OpenedAt?.toISOString() ?? null}
              reminderJ1OpenedAt={booking.reminderJ1OpenedAt?.toISOString() ?? null}
              reminderJ7BouncedAt={booking.reminderJ7BouncedAt?.toISOString() ?? null}
              reminderJ1BouncedAt={booking.reminderJ1BouncedAt?.toISOString() ?? null}
            />
          </Section>

          {/* Notes admin (éditable) */}
          <Section title="Notes admin (visible uniquement par toi)">
            <BookingNotes
              bookingId={booking.id}
              initialNotes={booking.adminNotes ?? ""}
            />
          </Section>
        </div>

        {/* ── Colonne droite : actions ────────────────── */}
        <aside>
          <div className="sticky top-20">
            <BookingActions
              bookingId={booking.id}
              status={booking.status}
              hasStripePayment={isStripePaid}
              depositCents={booking.depositCents}
              refundedAmount={booking.refundedAmount ?? 0}
              giftCardAmountCents={booking.giftCardRedemptions.reduce(
                (sum, r) => sum + r.amountUsedCents,
                0,
              )}
              currentDate={booking.date.toISOString().slice(0, 10)}
              currentStartTime={booking.startTime}
              totalPriceCents={booking.totalPriceCents}
              paymentMethod={booking.paymentMethod}
              isDepositReceived={
                booking.paymentMethod === "stripe" && !!booking.paidAt
              }
              revenueCents={booking.revenueCents}
              completionPaymentMethod={booking.completionPaymentMethod}
              editableServices={editableServices}
              editableOptions={editableOptions}
              currentServiceId={booking.serviceId}
              currentOptionIds={booking.options.map((o) => o.serviceOptionId)}
              clientFirstName={booking.clientFirstName}
              clientLastName={booking.clientLastName}
              clientEmail={booking.clientEmail}
              clientPhone={booking.clientPhone}
              clientMessage={booking.clientMessage ?? ""}
              googleReviewUrl={reviewSettings?.googleReviewUrl ?? null}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Présentationnels
// ─────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6">
      <h2
        className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-500)] mb-4"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  emphasized,
  mono,
  truncate,
  action,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
  mono?: boolean;
  truncate?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt
        className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-500)] mb-1"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </dt>
      <dd
        className={`text-sm ${truncate ? "truncate" : ""} ${
          emphasized ? "text-[var(--color-violet-700)] text-base" : "text-[var(--color-ink-900)]"
        }`}
        style={{
          fontFamily: mono
            ? "var(--font-mono)"
            : emphasized
              ? "var(--font-serif)"
              : "var(--font-ui)",
        }}
        title={truncate ? value : undefined}
      >
        {value}
      </dd>
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}
