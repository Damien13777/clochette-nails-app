"use server";

/**
 * Server Actions — gestion admin des bookings.
 *
 * Toutes les actions :
 *  - Auth ADMIN required
 *  - Audit dans AuditLog (qui a fait quoi quand)
 *  - revalidatePath admin
 *
 * Actions :
 *  - markCompleted : CONFIRMED → COMPLETED (RDV honoré, saisie CA réel)
 *  - updateBookingRevenue : édite revenueCents d'un RDV COMPLETED
 *  - markNoShow : CONFIRMED → NO_SHOW (cliente absente)
 *  - cancelAdmin : * → CANCELLED_BY_ADMIN (avec raison)
 *  - forceConfirm : AWAITING_DEPOSIT → CONFIRMED (paiement out-of-band, cash, etc.)
 *  - refundFull : full refund via Stripe API + CANCELLED_BY_ADMIN
 *  - reschedule : déplace un booking CONFIRMED vers un nouveau créneau libre
 *  - getAvailableSlotsForReschedule : helper côté UI (exclut le booking lui-même)
 *  - saveAdminNotes : update adminNotes field
 */

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { sendEmail } from "@/lib/email/send";
import { ADMIN_EMAIL } from "@/lib/email/client";
import { buildBookingCancelledClientEmail } from "@/lib/email/templates/booking-cancelled-client";
import { buildBookingRefundedClientEmail } from "@/lib/email/templates/booking-refunded-client";
import { buildBookingRescheduledEmail } from "@/lib/email/templates/booking-rescheduled";
import { buildBookingAdminPaymentLinkEmail } from "@/lib/email/templates/booking-admin-payment-link";
import { buildBookingConfirmationEmail } from "@/lib/email/templates/booking-confirmation";
import { buildBookingNotifAdminEmail } from "@/lib/email/templates/booking-notif-admin";
import { computeAvailableSlots } from "@/lib/availability";
import { computeDepositCents } from "@/lib/deposit";
import { emitOutboundEvent } from "@/lib/outbound-events";
import { reverseGiftCardRedemption } from "@/lib/gift-card-redeem";
import { createInvoiceForBooking, InvoiceError } from "@/lib/invoice/create-invoice";
import { sendInvoiceEmail } from "@/lib/invoice/invoice-email";
import { shouldSendReviewRequest } from "@/lib/review-request-guard";

type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };


async function audit(
  adminId: string,
  bookingId: string,
  action: string,
  metadata?: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: {
      adminId,
      action,
      metadata: { bookingId, ...(metadata ?? {}) } as object,
    },
  });
}

export type MarkCompletedInput = {
  /** Part cash/CB/chèque/virement perçue (en cents). Hors carte cadeau.
   *  C'est ce qui ira au CA. Peut être 0 si la cliente paye 100% en GC. */
  revenueCents: number;
  /** Mode de paiement du complément. null/undefined si revenueCents === 0. */
  completionPaymentMethod?: "cash" | "card_terminal" | "transfer" | "check" | null;
  /** Si la cliente utilise une carte cadeau au complément. */
  giftCard?: {
    code: string;
    amountCents: number;
  };
  /** Envoyer la facture PDF à la cliente par email (opt-in, décoché par défaut). */
  sendInvoiceByEmail?: boolean;
  /** Envoyer une demande d'avis Google à la cliente (opt-in, coché par défaut côté UI). */
  requestReview?: boolean;
};

const COMPLETION_METHODS = ["cash", "card_terminal", "transfer", "check"] as const;

export async function markBookingCompleted(
  bookingId: string,
  input: MarkCompletedInput,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const { revenueCents, completionPaymentMethod, giftCard } = input;

  if (!Number.isInteger(revenueCents) || revenueCents < 0 || revenueCents > 100_000_00) {
    return { ok: false, error: "Montant complément invalide." };
  }

  if (revenueCents > 0) {
    if (
      !completionPaymentMethod ||
      !COMPLETION_METHODS.includes(completionPaymentMethod)
    ) {
      return {
        ok: false,
        error: "Mode de paiement requis pour le complément perçu.",
      };
    }
  }

  if (giftCard) {
    if (
      !giftCard.code ||
      !Number.isInteger(giftCard.amountCents) ||
      giftCard.amountCents <= 0
    ) {
      return { ok: false, error: "Montant carte cadeau invalide." };
    }
  }

  if (revenueCents === 0 && !giftCard) {
    return {
      ok: false,
      error: "Au moins une partie du paiement doit être saisie.",
    };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      status: true,
      clientEmail: true,
      clientFirstName: true,
      service: { select: { title: true } },
    },
  });
  if (!booking) return { ok: false, error: "Booking introuvable" };
  if (booking.status !== "CONFIRMED") {
    return {
      ok: false,
      error: `Action impossible : statut actuel ${booking.status}, attendu CONFIRMED`,
    };
  }

  // Si GC : on valide + applique avant le mark completed (transaction atomique).
  if (giftCard) {
    const trimmed = giftCard.code.trim().toUpperCase();
    const card = await prisma.giftCard.findUnique({
      where: { code: trimmed },
      select: {
        id: true,
        status: true,
        remainingAmountCents: true,
        expiresAt: true,
      },
    });
    if (!card) return { ok: false, error: "Code carte cadeau introuvable." };
    if (card.status === "CANCELLED" || card.status === "REFUNDED") {
      return { ok: false, error: "Carte annulée ou remboursée." };
    }
    if (card.status === "FULLY_USED" || card.remainingAmountCents <= 0) {
      return { ok: false, error: "Carte épuisée." };
    }
    if (card.expiresAt < new Date()) {
      return { ok: false, error: "Carte expirée." };
    }
    if (card.remainingAmountCents < giftCard.amountCents) {
      return {
        ok: false,
        error: `Solde insuffisant (${(card.remainingAmountCents / 100).toFixed(2)} €).`,
      };
    }

    try {
      const { applyGiftCardRedemption } = await import("@/lib/gift-card-redeem");
      await applyGiftCardRedemption({
        giftCardId: card.id,
        amountCents: giftCard.amountCents,
        bookingId,
        redeemedByEmail: booking.clientEmail,
        type: "BOOKING_SERVICE",
        redeemedByAdminId: admin.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur redemption";
      return { ok: false, error: `Échec utilisation carte cadeau : ${msg}` };
    }
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      revenueCents,
      completionPaymentMethod: revenueCents > 0 ? completionPaymentMethod : null,
    },
  });
  await audit(admin.id, bookingId, "booking.completed", {
    revenueCents,
    completionPaymentMethod,
    giftCardAmountCents: giftCard?.amountCents ?? 0,
  });
  await emitOutboundEvent("booking.completed", {
    bookingId,
    revenueCents,
    completionPaymentMethod: revenueCents > 0 ? completionPaymentMethod : null,
    giftCardAmountCents: giftCard?.amountCents ?? 0,
  });

  let invoiceNote = "";
  try {
    const invoice = await createInvoiceForBooking(bookingId, { createdById: admin.id });
    if (input.sendInvoiceByEmail) {
      const sent = await sendInvoiceEmail(invoice.id);
      invoiceNote = sent.ok
        ? ` Facture ${invoice.number} envoyée à la cliente.`
        : ` Facture ${invoice.number} générée, mais l'email a échoué (renvoi possible depuis la fiche).`;
    } else {
      invoiceNote = ` Facture ${invoice.number} générée.`;
    }
  } catch (err) {
    const detail = err instanceof InvoiceError ? ` (${err.message})` : "";
    console.error("[invoice] génération booking échouée:", err);
    invoiceNote = ` ⚠️ Facture non générée${detail} — bouton « Générer la facture » disponible sur la fiche.`;
  }

  let reviewNote = "";
  try {
    if (input.requestReview) {
      const settings = await prisma.platformSettings.findFirst({
        select: { googleReviewUrl: true },
      });
      const googleReviewUrl = settings?.googleReviewUrl ?? null;
      const last = booking.clientEmail
        ? await prisma.booking.findFirst({
            where: {
              clientEmail: booking.clientEmail,
              reviewRequestSentAt: { not: null },
            },
            orderBy: { reviewRequestSentAt: "desc" },
            select: { reviewRequestSentAt: true },
          })
        : null;
      const ok = shouldSendReviewRequest({
        requestReview: true,
        googleReviewUrl,
        clientEmail: booking.clientEmail,
        lastRequestForEmailAt: last?.reviewRequestSentAt ?? null,
        now: new Date(),
      });
      if (ok && googleReviewUrl && booking.clientEmail) {
        const { buildBookingReviewRequestEmail } = await import(
          "@/lib/email/templates/booking-review-request"
        );
        const mail = buildBookingReviewRequestEmail({
          clientFirstName: booking.clientFirstName,
          serviceTitle: booking.service.title,
          reviewUrl: googleReviewUrl,
        });
        const sent = await sendEmail({
          to: booking.clientEmail,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          tag: "booking.review_request",
        });
        if (sent.ok) {
          await prisma.booking.update({
            where: { id: bookingId },
            data: { reviewRequestSentAt: new Date() },
          });
          await emitOutboundEvent("booking.review_requested", {
            bookingId,
            clientEmail: booking.clientEmail,
          });
          reviewNote = " Demande d'avis envoyée à la cliente.";
        } else {
          reviewNote = " ⚠️ Email d'avis non envoyé (erreur d'envoi).";
        }
      } else if (googleReviewUrl) {
        reviewNote = " Avis déjà demandé récemment à cette cliente — non renvoyé.";
      }
    }
  } catch (err) {
    console.error("[review] envoi demande d'avis échoué:", err);
  }

  revalidatePath("/admin", "layout");
  return { ok: true, message: `Réservation marquée comme honorée.${invoiceNote}${reviewNote}` };
}

/**
 * Édite le montant perçu et/ou le mode de règlement après coup (correction de saisie).
 *
 * Le mode de règlement n'est PAS une mention légale obligatoire d'une facture :
 * sa correction (montant inchangé) est une simple correction de métadonnée comptable,
 * légitime dès lors qu'elle est tracée (audit). La facture déjà émise reste immuable
 * et valable — on ne déclenche d'avoir que si le MONTANT change (vrai cas légal).
 */
export async function updateBookingRevenue(
  bookingId: string,
  revenueCents: number,
  completionPaymentMethod?: (typeof COMPLETION_METHODS)[number] | null,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  if (!Number.isInteger(revenueCents) || revenueCents < 0 || revenueCents > 100_000_00) {
    return { ok: false, error: "Montant invalide" };
  }

  // Le mode n'a de sens qu'avec un montant perçu hors carte cadeau :
  // > 0 € → un mode valide est requis ; 0 € → pas de mode (réglé 100% carte cadeau).
  let resolvedMethod: (typeof COMPLETION_METHODS)[number] | null = null;
  if (revenueCents > 0) {
    if (
      !completionPaymentMethod ||
      !COMPLETION_METHODS.includes(completionPaymentMethod)
    ) {
      return { ok: false, error: "Mode de règlement requis pour le montant perçu." };
    }
    resolvedMethod = completionPaymentMethod;
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { status: true, revenueCents: true, completionPaymentMethod: true },
  });
  if (!booking) return { ok: false, error: "Booking introuvable" };
  if (booking.status !== "COMPLETED") {
    return {
      ok: false,
      error: "Le montant ne peut être modifié que sur un RDV honoré.",
    };
  }

  const amountChanged = booking.revenueCents !== revenueCents;
  const methodChanged = (booking.completionPaymentMethod ?? null) !== resolvedMethod;
  if (!amountChanged && !methodChanged) {
    return { ok: true, message: "Aucune modification." };
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: { revenueCents, completionPaymentMethod: resolvedMethod },
  });
  await audit(admin.id, bookingId, "booking.revenue_updated", {
    previousRevenueCents: booking.revenueCents,
    revenueCents,
    previousCompletionPaymentMethod: booking.completionPaymentMethod ?? null,
    completionPaymentMethod: resolvedMethod,
  });

  revalidatePath("/admin", "layout");

  const existingInvoice = await prisma.invoice.findFirst({
    where: { bookingId, docType: "INVOICE", status: "ISSUED" },
    select: { number: true },
  });
  if (existingInvoice) {
    if (amountChanged) {
      return {
        ok: true,
        message: `Mise à jour enregistrée. ⚠️ La facture ${existingInvoice.number} a déjà été émise avec l'ancien montant — crée un avoir depuis Finances → Factures si nécessaire.`,
      };
    }
    // Mode de règlement corrigé seul : mention non obligatoire → facture toujours valable.
    return {
      ok: true,
      message: `Mode de règlement corrigé. La facture ${existingInvoice.number} déjà émise conserve son ancien libellé (mention non obligatoire) ; la correction est tracée. Aucun avoir nécessaire.`,
    };
  }
  return { ok: true, message: "Mise à jour enregistrée." };
}

export async function markBookingNoShow(
  bookingId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { status: true },
  });
  if (!booking) return { ok: false, error: "Booking introuvable" };
  if (booking.status !== "CONFIRMED") {
    return {
      ok: false,
      error: `Action impossible : statut actuel ${booking.status}, attendu CONFIRMED`,
    };
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "NO_SHOW" },
  });
  await audit(admin.id, bookingId, "booking.no_show");
  await emitOutboundEvent("booking.no_show", { bookingId });

  revalidatePath("/admin", "layout");
  return { ok: true, message: "Cliente marquée absente (no-show)." };
}

export async function cancelBookingAdmin(
  bookingId: string,
  reason: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };
  if (!reason || reason.trim().length < 3) {
    return { ok: false, error: "Une raison d'annulation est requise (3 caractères min)." };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      status: true,
      date: true,
      startTime: true,
      clientFirstName: true,
      clientEmail: true,
      service: { select: { title: true } },
    },
  });
  if (!booking) return { ok: false, error: "Booking introuvable" };
  if (
    booking.status === "CANCELLED_BY_ADMIN" ||
    booking.status === "CANCELLED_BY_CLIENT" ||
    booking.status === "EXPIRED" ||
    booking.status === "COMPLETED"
  ) {
    return {
      ok: false,
      error: `Annulation impossible depuis le statut ${booking.status}`,
    };
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: "CANCELLED_BY_ADMIN",
      cancelledAt: new Date(),
      cancellationReason: reason.trim(),
    },
  });
  await audit(admin.id, bookingId, "booking.cancelled_admin", { reason });
  await emitOutboundEvent("booking.cancelled_by_admin", {
    bookingId,
    reason: reason.trim(),
  });

  // Email cliente — annulation sans remboursement.
  // depositKept=false côté admin : on ne sait pas si l'admin va rembourser
  // ensuite manuellement. Message neutre "communiqué séparément si applicable".
  try {
    const mail = buildBookingCancelledClientEmail({
      clientFirstName: booking.clientFirstName,
      serviceTitle: booking.service.title,
      date: booking.date,
      startTime: booking.startTime,
      reason: reason.trim(),
      depositKept: false,
    });
    await sendEmail({
      to: booking.clientEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tag: "booking.cancelled-by-admin",
    });
  } catch (err) {
    console.error("[cancelBookingAdmin] email cliente échoué:", err);
  }

  revalidatePath("/admin", "layout");
  return { ok: true, message: "Réservation annulée." };
}

export async function forceConfirmBooking(
  bookingId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { status: true },
  });
  if (!booking) return { ok: false, error: "Booking introuvable" };
  if (booking.status !== "AWAITING_DEPOSIT") {
    return {
      ok: false,
      error: `Force-confirm impossible : statut actuel ${booking.status}`,
    };
  }

  const now = new Date();
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: "CONFIRMED",
      confirmedAt: now,
      paidAt: now, // Paiement out-of-band, on considère payé
    },
  });
  await audit(admin.id, bookingId, "booking.force_confirmed");
  await emitOutboundEvent("booking.confirmed", {
    bookingId,
    paidVia: "out_of_band",
  });

  revalidatePath("/admin", "layout");
  return { ok: true, message: "Réservation confirmée manuellement (paiement out-of-band)." };
}

export async function refundBookingFull(
  bookingId: string,
  reason: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      status: true,
      stripePaymentId: true,
      depositCents: true,
      refundedAmount: true,
      paymentMethod: true,
      date: true,
      startTime: true,
      clientFirstName: true,
      clientEmail: true,
      service: { select: { title: true } },
    },
  });
  if (!booking) return { ok: false, error: "Booking introuvable" };

  // Récupère les redemptions DEPOSIT actives sur ce booking
  const depositRedemptions = await prisma.giftCardRedemption.findMany({
    where: {
      bookingId,
      type: "BOOKING_DEPOSIT",
      reversedAt: null,
    },
    select: {
      id: true,
      amountUsedCents: true,
      giftCard: { select: { prefix: true } },
    },
  });
  const gcDepositCents = depositRedemptions.reduce(
    (sum, r) => sum + r.amountUsedCents,
    0,
  );

  // Portion Stripe réellement encaissée
  const stripePortion =
    booking.paymentMethod === "stripe"
      ? Math.max(0, booking.depositCents - gcDepositCents)
      : 0;
  const alreadyRefundedStripe = booking.refundedAmount ?? 0;
  const remainingStripeToRefund = Math.max(
    0,
    stripePortion - alreadyRefundedStripe,
  );

  const canRefundStripe =
    remainingStripeToRefund > 0 && !!booking.stripePaymentId;
  const canRefundGC = depositRedemptions.length > 0;

  if (!canRefundStripe && !canRefundGC) {
    return {
      ok: false,
      error:
        "Aucun montant remboursable : pas de paiement Stripe rattaché et aucune carte cadeau à re-créditer.",
    };
  }

  let stripeRefundedCents = 0;
  let gcRefundedCents = 0;
  let gcPrefix: string | null = null;
  let stripeRefundId: string | null = null;

  if (canRefundStripe) {
    if (!stripe) {
      return {
        ok: false,
        error: "Stripe non configuré, impossible de rembourser la portion CB.",
      };
    }
    try {
      const refund = await stripe.refunds.create({
        payment_intent: booking.stripePaymentId!,
        reason: "requested_by_customer",
        metadata: { bookingId, adminId: admin.id, customReason: reason },
      });
      stripeRefundedCents = refund.amount;
      stripeRefundId = refund.id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur Stripe";
      return { ok: false, error: `Échec du remboursement Stripe : ${msg}` };
    }
  }

  if (canRefundGC) {
    for (const r of depositRedemptions) {
      try {
        const result = await reverseGiftCardRedemption(r.id);
        gcRefundedCents += result.reversedAmountCents;
        gcPrefix ??= result.giftCardPrefix;
      } catch (err) {
        console.error("[refundBookingFull] reverse GC échoué:", err);
      }
    }
  }

  const totalRefundedCents = stripeRefundedCents + gcRefundedCents;

  // Update booking
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: "CANCELLED_BY_ADMIN",
      cancelledAt: new Date(),
      cancellationReason: reason || "Remboursement administratif",
      ...(stripeRefundedCents > 0
        ? {
            refundedAmount:
              (booking.refundedAmount ?? 0) + stripeRefundedCents,
          }
        : {}),
    },
  });
  await audit(admin.id, bookingId, "booking.refunded_full", {
    stripeRefundId,
    stripeRefundedCents,
    gcRefundedCents,
    gcPrefix,
    reason,
  });
  await emitOutboundEvent("booking.refunded", {
    bookingId,
    stripeRefundedCents,
    gcRefundedCents,
    reason,
  });

  // Email cliente — annulation avec remboursement.
  try {
    const mail = buildBookingRefundedClientEmail({
      clientFirstName: booking.clientFirstName,
      serviceTitle: booking.service.title,
      date: booking.date,
      startTime: booking.startTime,
      reason: reason || "Annulation par le salon",
      refundedCents: totalRefundedCents,
      stripeRefundedCents,
      giftCardRefundedCents: gcRefundedCents,
      giftCardPrefix: gcPrefix,
    });
    await sendEmail({
      to: booking.clientEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tag: "booking.refunded-by-admin",
    });
  } catch (err) {
    console.error("[refundBookingFull] email cliente échoué:", err);
  }

  revalidatePath("/admin", "layout");

  const summaryParts: string[] = [];
  if (stripeRefundedCents > 0)
    summaryParts.push(
      `${(stripeRefundedCents / 100).toFixed(2)} € via Stripe`,
    );
  if (gcRefundedCents > 0)
    summaryParts.push(
      `${(gcRefundedCents / 100).toFixed(2)} € re-crédité sur carte ••${gcPrefix}`,
    );
  return {
    ok: true,
    message: `Remboursement initié : ${summaryParts.join(" + ")}.`,
  };
}

// ─────────────────────────────────────────────────────────
// Déplacement de RDV (admin)
// ─────────────────────────────────────────────────────────

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

type GetSlotsResult =
  | {
      ok: true;
      slots: string[];
      reason?: string;
      booking: {
        date: string; // YYYY-MM-DD
        startTime: string;
        endTime: string;
        durationMinutes: number;
      };
    }
  | { ok: false; error: string };

/**
 * Récupère les créneaux disponibles pour déplacer un booking donné à une date.
 * Le booking en cours de déplacement est exclu des overlaps — ses propres
 * créneaux apparaissent donc comme disponibles (le créneau actuel inclus).
 */
export async function getAvailableSlotsForReschedule(
  bookingId: string,
  newDate: string, // YYYY-MM-DD
): Promise<GetSlotsResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    return { ok: false, error: "Date invalide (format attendu : YYYY-MM-DD)." };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      status: true,
      date: true,
      startTime: true,
      endTime: true,
      totalDurationMinutes: true,
    },
  });
  if (!booking) return { ok: false, error: "Booking introuvable" };
  if (booking.status !== "CONFIRMED") {
    return {
      ok: false,
      error: `Déplacement impossible : statut ${booking.status} (CONFIRMED requis).`,
    };
  }

  const result = await computeAvailableSlots({
    date: newDate,
    totalDurationMinutes: booking.totalDurationMinutes,
    excludeBookingId: bookingId,
  });

  return {
    ok: true,
    slots: result.slots,
    reason: result.reason,
    booking: {
      date: booking.date.toISOString().slice(0, 10),
      startTime: booking.startTime,
      endTime: booking.endTime,
      durationMinutes: booking.totalDurationMinutes,
    },
  };
}

/**
 * Déplace un RDV CONFIRMED vers un nouveau créneau.
 * Vérifie côté serveur que le nouveau créneau est réellement libre
 * (computeAvailableSlots avec excludeBookingId).
 */
export async function rescheduleBookingAdmin(
  bookingId: string,
  newDate: string, // YYYY-MM-DD
  newStartTime: string, // HH:MM
  reason?: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    return { ok: false, error: "Date invalide." };
  }
  if (!/^\d{2}:\d{2}$/.test(newStartTime)) {
    return { ok: false, error: "Heure invalide." };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      status: true,
      date: true,
      startTime: true,
      endTime: true,
      totalDurationMinutes: true,
      clientFirstName: true,
      clientEmail: true,
      service: { select: { title: true } },
    },
  });
  if (!booking) return { ok: false, error: "Booking introuvable" };
  if (booking.status !== "CONFIRMED") {
    return {
      ok: false,
      error: `Déplacement impossible : statut ${booking.status} (CONFIRMED requis).`,
    };
  }

  const oldDateIso = booking.date.toISOString().slice(0, 10);
  if (oldDateIso === newDate && booking.startTime === newStartTime) {
    return {
      ok: false,
      error: "Le créneau choisi est identique au créneau actuel.",
    };
  }

  // Vérification serveur : créneau réellement disponible (defense in depth).
  const avail = await computeAvailableSlots({
    date: newDate,
    totalDurationMinutes: booking.totalDurationMinutes,
    excludeBookingId: bookingId,
  });
  if (!avail.slots.includes(newStartTime)) {
    return {
      ok: false,
      error: avail.reason
        ? `Créneau indisponible (${avail.reason}).`
        : "Ce créneau n'est plus disponible. Rafraîchissez la liste.",
    };
  }

  const newEndTime = addMinutesToTime(newStartTime, booking.totalDurationMinutes);
  const newDateObj = new Date(newDate + "T00:00:00.000Z");

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      date: newDateObj,
      startTime: newStartTime,
      endTime: newEndTime,
    },
  });

  await audit(admin.id, bookingId, "booking.rescheduled_admin", {
    oldDate: oldDateIso,
    oldStartTime: booking.startTime,
    oldEndTime: booking.endTime,
    newDate,
    newStartTime,
    newEndTime,
    reason: reason ?? null,
  });
  await emitOutboundEvent("booking.rescheduled", {
    bookingId,
    oldDate: oldDateIso,
    oldStartTime: booking.startTime,
    newDate,
    newStartTime,
    by: "admin",
  });

  // Notification in-app admin (trace dans la cloche)
  await prisma.notification.create({
    data: {
      userId: admin.id,
      type: "BOOKING_RESCHEDULED",
      title: `RDV déplacé : ${booking.clientFirstName}`,
      body: `${oldDateIso} ${booking.startTime} → ${newDate} ${newStartTime}`,
      link: `/admin/bookings/${bookingId}`,
      metadata: {
        bookingId,
        oldDate: oldDateIso,
        oldStartTime: booking.startTime,
        newDate,
        newStartTime,
        movedByAdmin: true,
      } as object,
    },
  });

  // Email cliente (obligatoire, sinon elle ne sait pas)
  try {
    const mail = buildBookingRescheduledEmail({
      clientFirstName: booking.clientFirstName,
      serviceTitle: booking.service.title,
      oldDate: booking.date,
      oldStartTime: booking.startTime,
      oldEndTime: booking.endTime,
      newDate: newDateObj,
      newStartTime,
      newEndTime,
      reason: reason ?? null,
    });
    await sendEmail({
      to: booking.clientEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tag: "booking.rescheduled-by-admin",
    });
  } catch (err) {
    console.error("[rescheduleBookingAdmin] email cliente échoué:", err);
  }

  revalidatePath("/admin", "layout");
  return {
    ok: true,
    message: `Réservation déplacée au ${newDate} à ${newStartTime}.`,
  };
}

// ─────────────────────────────────────────────────────────

export async function saveBookingAdminNotes(
  bookingId: string,
  notes: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  if (notes.length > 5000) {
    return { ok: false, error: "Notes trop longues (5000 caractères max)." };
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: { adminNotes: notes.trim() || null },
  });
  // Pas d'audit pour les notes (changements fréquents et bénins)

  revalidatePath(`/admin/bookings/${bookingId}`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────
// Création d'un RDV par l'admin via le calendrier (A-2.5)
// ─────────────────────────────────────────────────────────

const PAYMENT_METHODS_IN_PERSON = ["cash", "transfer", "check", "card_terminal"] as const;
type PaymentMethodInPerson = (typeof PAYMENT_METHODS_IN_PERSON)[number];

const createBookingAdminSchema = z
  .object({
    client: z.object({
      firstName: z.string().trim().min(1).max(50),
      lastName: z.string().trim().min(1).max(50),
      email: z.string().trim().toLowerCase().email().max(150),
      phone: z
        .string()
        .trim()
        .regex(/^(?:\+33|0)[1-9](?:[ .-]?\d{2}){4}$/, "Téléphone FR invalide"),
      message: z.string().trim().max(2000).optional().nullable(),
    }),
    serviceId: z.string().min(1),
    optionIds: z.array(z.string().min(1)).default([]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "Heure invalide"),
    paymentMode: z.enum(["SEND_LINK", "PAID_IN_PERSON", "NO_DEPOSIT"]),
    paidInPersonAmountCents: z.coerce.number().int().min(0).optional(),
    paidInPersonMethod: z.enum(PAYMENT_METHODS_IN_PERSON).optional(),
    adminNotes: z.string().trim().max(5000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.paymentMode === "PAID_IN_PERSON") {
      if (data.paidInPersonAmountCents === undefined || data.paidInPersonAmountCents <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ["paidInPersonAmountCents"],
          message: "Montant payé obligatoire (> 0).",
        });
      }
      if (!data.paidInPersonMethod) {
        ctx.addIssue({
          code: "custom",
          path: ["paidInPersonMethod"],
          message: "Méthode de paiement obligatoire.",
        });
      }
    }
  });

export type CreateBookingAdminInput = z.input<typeof createBookingAdminSchema>;

export type CreateBookingAdminResult =
  | {
      ok: true;
      bookingId: string;
      mode: "SEND_LINK" | "PAID_IN_PERSON" | "NO_DEPOSIT";
      /** URL Stripe Checkout (uniquement si SEND_LINK) — peut servir à afficher
       *  le lien à l'admin si l'email échoue */
      checkoutUrl?: string;
      message: string;
    }
  | {
      ok: false;
      error: string;
      code?: string;
      fieldErrors?: Record<string, string>;
    };

// Le créneau est réservé 3 jours (cron expire-pending le libère au-delà).
const SLOT_HOLD_HOURS = 72;
// Plafond dur de Stripe Checkout : expires_at ≤ 24h après création. Le lien
// est donc valable 24h ; au-delà, l'admin peut « Renvoyer le lien » (nouvelle
// session) tant que le créneau est encore réservé.
const STRIPE_LINK_TTL_HOURS = 24;

class AdminBookingConflictError extends Error {
  constructor() {
    super("Créneau indisponible");
    this.name = "AdminBookingConflictError";
  }
}

export async function createBookingAdmin(
  input: CreateBookingAdminInput,
): Promise<CreateBookingAdminResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  // ── Validation Zod ────────────────────────────────────
  const parsed = createBookingAdminSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (path && !fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return {
      ok: false,
      error: "Vérifiez les champs marqués.",
      code: "VALIDATION_ERROR",
      fieldErrors,
    };
  }
  const data = parsed.data;

  // Pas de création dans le passé.
  // On compare en heure locale (le serveur tourne en Europe/Paris pour V1).
  const appointmentAt = new Date(`${data.date}T${data.startTime}:00`);
  if (Number.isNaN(appointmentAt.getTime()) || appointmentAt <= new Date()) {
    return {
      ok: false,
      error: "Impossible de créer un RDV dans le passé.",
      code: "PAST_DATE",
    };
  }

  // ── Fetch service + options + settings ───────────────
  const [service, options, settings] = await Promise.all([
    prisma.service.findUnique({
      where: { id: data.serviceId, status: "PUBLISHED" },
      select: {
        id: true,
        title: true,
        durationMinutes: true,
        priceCents: true,
      },
    }),
    data.optionIds.length > 0
      ? prisma.serviceOption.findMany({
          where: { id: { in: data.optionIds }, status: "PUBLISHED" },
          select: {
            id: true,
            title: true,
            addedDurationMinutes: true,
            addedPriceCents: true,
          },
        })
      : Promise.resolve([] as Array<{
          id: string;
          title: string;
          addedDurationMinutes: number;
          addedPriceCents: number;
        }>),
    prisma.platformSettings.findFirst(),
  ]);

  if (!service) {
    return {
      ok: false,
      error: "Prestation introuvable ou non publiée.",
      code: "SERVICE_NOT_FOUND",
    };
  }
  if (data.optionIds.length > 0 && options.length !== data.optionIds.length) {
    return {
      ok: false,
      error: "Une ou plusieurs options sont introuvables.",
      code: "OPTION_NOT_FOUND",
    };
  }

  // ── Snapshot pricing ─────────────────────────────────
  const totalDurationMinutes =
    service.durationMinutes +
    options.reduce((sum, o) => sum + o.addedDurationMinutes, 0);
  const totalPriceCents =
    service.priceCents +
    options.reduce((sum, o) => sum + o.addedPriceCents, 0);
  const depositCents = settings
    ? computeDepositCents(totalPriceCents, settings)
    : Math.round(totalPriceCents * 0.3);

  const endTime = addMinutesToTime(data.startTime, totalDurationMinutes);
  const dateObj = new Date(data.date + "T00:00:00.000Z");

  // Pour PAID_IN_PERSON, le montant reçu peut être différent de l'acompte
  // attendu (geste commercial, etc.). On stocke ce que l'admin a saisi.
  const effectiveDepositCents =
    data.paymentMode === "PAID_IN_PERSON" && data.paidInPersonAmountCents !== undefined
      ? data.paidInPersonAmountCents
      : data.paymentMode === "NO_DEPOSIT"
        ? 0
        : depositCents;

  // ── Transaction : overlap detection + INSERT ─────────
  let booking: { id: string; confirmationToken: string | null };
  try {
    booking = await prisma.$transaction(async (tx) => {
      const conflict = await tx.booking.findFirst({
        where: {
          date: dateObj,
          status: { in: ["AWAITING_DEPOSIT", "CONFIRMED"] },
          AND: [
            { startTime: { lt: endTime } },
            { endTime: { gt: data.startTime } },
          ],
        },
        select: { id: true },
      });
      if (conflict) throw new AdminBookingConflictError();

      const confirmationToken = randomBytes(24).toString("base64url");

      return tx.booking.create({
        data: {
          date: dateObj,
          startTime: data.startTime,
          endTime,
          serviceId: data.serviceId,
          clientFirstName: data.client.firstName,
          clientLastName: data.client.lastName,
          clientEmail: data.client.email,
          clientPhone: data.client.phone,
          clientMessage: data.client.message?.trim() || null,
          totalDurationMinutes,
          totalPriceCents,
          depositCents: effectiveDepositCents,
          status:
            data.paymentMode === "SEND_LINK" ? "AWAITING_DEPOSIT" : "CONFIRMED",
          confirmationToken,
          createdByAdmin: true,
          adminNotes: data.adminNotes?.trim() || null,
          options: {
            create: data.optionIds.map((id) => ({ serviceOptionId: id })),
          },
        },
        select: { id: true, confirmationToken: true },
      });
    });
  } catch (err) {
    if (err instanceof AdminBookingConflictError) {
      return {
        ok: false,
        error: "Ce créneau est déjà pris. Choisissez-en un autre.",
        code: "CONFLICT",
      };
    }
    console.error("[createBookingAdmin] transaction failed:", err);
    return {
      ok: false,
      error: "Erreur interne lors de la création.",
      code: "INTERNAL_ERROR",
    };
  }

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // ─────────────────────────────────────────────────────
  // Mode 1 : SEND_LINK → Stripe Checkout + email payment link
  // ─────────────────────────────────────────────────────
  if (data.paymentMode === "SEND_LINK") {
    if (!stripe) {
      return {
        ok: false,
        error: "Stripe non configuré, impossible d'envoyer un lien de paiement.",
        code: "STRIPE_NOT_CONFIGURED",
      };
    }

    const nowMs = Date.now();
    const linkExpiresAt = new Date(nowMs + STRIPE_LINK_TTL_HOURS * 60 * 60 * 1000);
    const slotHeldUntil = new Date(nowMs + SLOT_HOLD_HOURS * 60 * 60 * 1000);

    let session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "eur",
              product_data: {
                name: `Acompte — ${service.title}`,
                description: `RDV du ${data.date} à ${data.startTime}`,
              },
              unit_amount: depositCents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          type: "booking",
          bookingId: booking.id,
          createdByAdmin: "true",
        },
        customer_email: data.client.email,
        locale: "fr",
        expires_at: Math.floor(linkExpiresAt.getTime() / 1000),
        success_url: `${origin}/reservation/succes?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/reservation/echec?token=${booking.confirmationToken}`,
      });
    } catch (err) {
      // Rollback : supprime le booking créé (transaction Prisma déjà commit,
      // mais on revient à un état propre)
      await prisma.booking.delete({ where: { id: booking.id } });
      const msg = err instanceof Error ? err.message : "Erreur Stripe";
      console.error("[createBookingAdmin] Stripe error:", err);
      return {
        ok: false,
        error: `Création Stripe échouée : ${msg}`,
        code: "STRIPE_ERROR",
      };
    }

    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        stripeSessionId: session.id,
        paymentExpiresAt: slotHeldUntil,
      },
    });

    await audit(admin.id, booking.id, "booking.created_by_admin_send_link", {
      depositCents,
      paymentExpiresAt: slotHeldUntil.toISOString(),
      linkExpiresAt: linkExpiresAt.toISOString(),
    });

    // Email cliente : lien de paiement
    try {
      const mail = buildBookingAdminPaymentLinkEmail({
        clientFirstName: data.client.firstName,
        serviceTitle: service.title,
        optionsTitles: options.map((o) => o.title),
        date: dateObj,
        startTime: data.startTime,
        endTime,
        totalDurationMinutes,
        depositCents,
        checkoutUrl: session.url!,
        expiresInHours: STRIPE_LINK_TTL_HOURS,
        slotHeldUntil,
      });
      await sendEmail({
        to: data.client.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        tag: "booking.admin-payment-link",
      });
    } catch (err) {
      console.error("[createBookingAdmin] email envoi échoué:", err);
      // L'admin verra le checkoutUrl dans la réponse → peut le copier-coller
    }

    revalidatePath("/admin", "layout");
    return {
      ok: true,
      bookingId: booking.id,
      mode: "SEND_LINK",
      checkoutUrl: session.url ?? undefined,
      message:
        "RDV créé. Lien de paiement envoyé à la cliente. Confirmation automatique dès le paiement.",
    };
  }

  // ─────────────────────────────────────────────────────
  // Mode 2 & 3 : PAID_IN_PERSON ou NO_DEPOSIT → CONFIRMED direct
  // ─────────────────────────────────────────────────────
  const now = new Date();
  const clientActionToken = randomBytes(32).toString("hex");

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      confirmedAt: now,
      paidAt: data.paymentMode === "PAID_IN_PERSON" ? now : null,
      paymentMethod:
        data.paymentMode === "PAID_IN_PERSON"
          ? (data.paidInPersonMethod as PaymentMethodInPerson)
          : "none",
      clientActionToken,
    },
  });

  const auditAction =
    data.paymentMode === "PAID_IN_PERSON"
      ? "booking.created_by_admin_paid_in_person"
      : "booking.created_by_admin_no_deposit";
  await audit(admin.id, booking.id, auditAction, {
    paymentMethod:
      data.paymentMode === "PAID_IN_PERSON" ? data.paidInPersonMethod : "none",
    paidAmountCents:
      data.paymentMode === "PAID_IN_PERSON"
        ? data.paidInPersonAmountCents
        : 0,
  });

  // Notification in-app admin (trace)
  await prisma.notification.create({
    data: {
      userId: admin.id,
      type: "NEW_BOOKING",
      title: `RDV admin créé : ${data.client.firstName} ${data.client.lastName}`,
      body: `${data.date} à ${data.startTime} — ${service.title}${
        data.paymentMode === "PAID_IN_PERSON"
          ? ` · Acompte ${(effectiveDepositCents / 100).toFixed(2)} € (${data.paidInPersonMethod})`
          : " · Sans acompte"
      }`,
      link: `/admin/bookings/${booking.id}`,
      metadata: {
        bookingId: booking.id,
        createdByAdmin: true,
        paymentMode: data.paymentMode,
      } as object,
    },
  });

  // Email cliente : confirmation standard
  try {
    const clientMail = buildBookingConfirmationEmail({
      clientFirstName: data.client.firstName,
      clientEmail: data.client.email,
      serviceTitle: service.title,
      optionsTitles: options.map((o) => o.title),
      date: dateObj,
      startTime: data.startTime,
      endTime,
      totalDurationMinutes,
      depositCents: effectiveDepositCents,
      giftCardAmountCents: 0,
      clientActionToken,
      paymentMethod:
        data.paymentMode === "PAID_IN_PERSON"
          ? data.paidInPersonMethod
          : data.paymentMode === "NO_DEPOSIT"
            ? "none"
            : "stripe",
    });
    await sendEmail({
      to: data.client.email,
      subject: clientMail.subject,
      html: clientMail.html,
      text: clientMail.text,
      tag: "booking.confirmation",
    });
  } catch (err) {
    console.error("[createBookingAdmin] email cliente échoué:", err);
  }

  // Email admin : notif (replyTo cliente pour répondre facilement)
  try {
    const adminMail = buildBookingNotifAdminEmail({
      bookingId: booking.id,
      serviceTitle: service.title,
      clientFirstName: data.client.firstName,
      clientLastName: data.client.lastName,
      clientEmail: data.client.email,
      clientPhone: data.client.phone,
      clientMessage: data.client.message ?? null,
      date: dateObj,
      startTime: data.startTime,
      endTime,
      depositCents: effectiveDepositCents,
      giftCardAmountCents: 0,
      paidVia:
        data.paymentMode === "PAID_IN_PERSON"
          ? `paid_in_person_${data.paidInPersonMethod}`
          : "admin_no_deposit",
    });
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: adminMail.subject,
      html: adminMail.html,
      text: adminMail.text,
      replyTo: data.client.email,
      tag: "booking.notif-admin",
    });
  } catch (err) {
    console.error("[createBookingAdmin] email admin échoué:", err);
  }

  revalidatePath("/admin", "layout");
  return {
    ok: true,
    bookingId: booking.id,
    mode: data.paymentMode,
    message:
      data.paymentMode === "PAID_IN_PERSON"
        ? `RDV créé et confirmé. Acompte de ${(effectiveDepositCents / 100).toFixed(2).replace(".", ",")} € enregistré.`
        : "RDV créé et confirmé sans acompte.",
  };
}

// ─────────────────────────────────────────────────────────
// Renvoi du lien de paiement (RDV admin AWAITING_DEPOSIT)
// ─────────────────────────────────────────────────────────

/**
 * Régénère une session Stripe Checkout (24h) pour un RDV encore en attente
 * de paiement, et renvoie le lien par email. Ré-arme le hold du créneau (72h).
 * Utile quand le lien initial a expiré (Stripe plafonne à 24h) mais que le
 * créneau est toujours réservé.
 */
export async function resendBookingPaymentLink(
  bookingId: string,
): Promise<ActionResult & { checkoutUrl?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  if (!stripe) {
    return { ok: false, error: "Stripe non configuré, impossible d'envoyer un lien." };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      date: true,
      startTime: true,
      endTime: true,
      totalDurationMinutes: true,
      depositCents: true,
      confirmationToken: true,
      clientFirstName: true,
      clientEmail: true,
      service: { select: { title: true } },
      options: { select: { serviceOption: { select: { title: true } } } },
    },
  });
  if (!booking) return { ok: false, error: "Booking introuvable" };
  if (booking.status !== "AWAITING_DEPOSIT") {
    return {
      ok: false,
      error: `Renvoi impossible : statut ${booking.status} (un lien ne se renvoie que sur un RDV en attente de paiement).`,
    };
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const nowMs = Date.now();
  const linkExpiresAt = new Date(nowMs + STRIPE_LINK_TTL_HOURS * 60 * 60 * 1000);
  const slotHeldUntil = new Date(nowMs + SLOT_HOLD_HOURS * 60 * 60 * 1000);

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `Acompte — ${booking.service.title}`,
              description: `RDV du ${booking.date.toISOString().slice(0, 10)} à ${booking.startTime}`,
            },
            unit_amount: booking.depositCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: "booking",
        bookingId: booking.id,
        createdByAdmin: "true",
      },
      customer_email: booking.clientEmail,
      locale: "fr",
      expires_at: Math.floor(linkExpiresAt.getTime() / 1000),
      success_url: `${origin}/reservation/succes?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/reservation/echec?token=${booking.confirmationToken}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur Stripe";
    console.error("[resendBookingPaymentLink] Stripe error:", err);
    return { ok: false, error: `Création Stripe échouée : ${msg}` };
  }

  // Nouvelle session + ré-armement du hold créneau (72h).
  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      stripeSessionId: session.id,
      paymentExpiresAt: slotHeldUntil,
    },
  });

  await audit(admin.id, booking.id, "booking.payment_link_resent", {
    paymentExpiresAt: slotHeldUntil.toISOString(),
    linkExpiresAt: linkExpiresAt.toISOString(),
  });

  try {
    const mail = buildBookingAdminPaymentLinkEmail({
      clientFirstName: booking.clientFirstName,
      serviceTitle: booking.service.title,
      optionsTitles: booking.options.map((o) => o.serviceOption.title),
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      totalDurationMinutes: booking.totalDurationMinutes,
      depositCents: booking.depositCents,
      checkoutUrl: session.url!,
      expiresInHours: STRIPE_LINK_TTL_HOURS,
      slotHeldUntil,
    });
    await sendEmail({
      to: booking.clientEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tag: "booking.admin-payment-link",
    });
  } catch (err) {
    console.error("[resendBookingPaymentLink] email échoué:", err);
  }

  revalidatePath("/admin", "layout");
  return {
    ok: true,
    message: "Nouveau lien de paiement envoyé à la cliente (valable 24 h).",
    checkoutUrl: session.url ?? undefined,
  };
}

// ─── Édition admin d'un RDV (coordonnées + prestation/options) ──────
// Modifie un booking AWAITING_DEPOSIT ou CONFIRMED : corrige les coordonnées
// et/ou change la prestation + options. Le créneau (date + startTime) est
// conservé ; endTime est recalculé selon la nouvelle durée. Le chevauchement
// renvoie le code "OVERLAP" tant que force !== true.

const updateBookingDetailsSchema = z.object({
  client: z.object({
    firstName: z.string().trim().min(1).max(50),
    lastName: z.string().trim().min(1).max(50),
    email: z.string().trim().toLowerCase().email().max(150),
    phone: z
      .string()
      .trim()
      .regex(/^(?:\+33|0)[1-9](?:[ .-]?\d{2}){4}$/, "Téléphone FR invalide"),
    message: z.string().trim().max(2000).optional().nullable(),
  }),
  serviceId: z.string().min(1),
  optionIds: z.array(z.string().min(1)).default([]),
  force: z.boolean().optional(),
  notifyClient: z.boolean().optional(),
});

export type UpdateBookingDetailsInput = z.input<typeof updateBookingDetailsSchema>;

export type UpdateBookingDetailsResult =
  | { ok: true; message: string }
  | {
      ok: false;
      error: string;
      code?: string;
      fieldErrors?: Record<string, string>;
    };

export async function updateBookingDetails(
  bookingId: string,
  input: UpdateBookingDetailsInput,
): Promise<UpdateBookingDetailsResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const parsed = updateBookingDetailsSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (path && !fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return {
      ok: false,
      error: "Vérifiez les champs marqués.",
      code: "VALIDATION_ERROR",
      fieldErrors,
    };
  }
  const data = parsed.data;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      status: true,
      date: true,
      startTime: true,
      clientActionToken: true,
      paymentMethod: true,
      paidAt: true,
      depositCents: true,
    },
  });
  if (!booking) return { ok: false, error: "Réservation introuvable." };
  if (booking.status !== "AWAITING_DEPOSIT" && booking.status !== "CONFIRMED") {
    return {
      ok: false,
      error: `Modification impossible : seules les réservations en attente d'acompte ou confirmées sont éditables (statut actuel : ${booking.status}).`,
      code: "STATUS_NOT_EDITABLE",
    };
  }

  const [service, options, settings] = await Promise.all([
    prisma.service.findFirst({
      where: { id: data.serviceId, status: "PUBLISHED" },
      select: { id: true, title: true, durationMinutes: true, priceCents: true },
    }),
    data.optionIds.length > 0
      ? prisma.serviceOption.findMany({
          where: { id: { in: data.optionIds }, status: "PUBLISHED" },
          select: {
            id: true,
            title: true,
            addedDurationMinutes: true,
            addedPriceCents: true,
          },
        })
      : Promise.resolve(
          [] as {
            id: string;
            title: string;
            addedDurationMinutes: number;
            addedPriceCents: number;
          }[],
        ),
    prisma.platformSettings.findFirst(),
  ]);

  if (!service) {
    return {
      ok: false,
      error: "Prestation introuvable ou non publiée.",
      code: "SERVICE_NOT_FOUND",
    };
  }
  if (options.length !== data.optionIds.length) {
    return {
      ok: false,
      error: "Une ou plusieurs options sont introuvables ou non publiées.",
      code: "OPTION_NOT_FOUND",
    };
  }

  const totalDurationMinutes =
    service.durationMinutes +
    options.reduce((sum, o) => sum + o.addedDurationMinutes, 0);
  const totalPriceCents =
    service.priceCents + options.reduce((sum, o) => sum + o.addedPriceCents, 0);
  // L'acompte n'est recalculé que si RIEN n'a encore été encaissé. Dès qu'un
  // acompte a été perçu (paidAt non nul), le montant figé au paiement est
  // immuable : le réécrire fausserait le montant affiché comme payé, le
  // remboursement proposé et le CA dans /admin/finances (qui lisent tous
  // depositCents comme "acompte réellement encaissé").
  const depositCents = booking.paidAt
    ? booking.depositCents
    : computeDepositCents(totalPriceCents, settings);
  const endTime = addMinutesToTime(booking.startTime, totalDurationMinutes);

  // Overlap : exclut le booking lui-même. Bornes strictes → les créneaux qui se
  // touchent (endTime === startTime voisin) ne comptent pas comme chevauchement.
  const conflict = await prisma.booking.findFirst({
    where: {
      date: booking.date,
      id: { not: bookingId },
      status: { in: ["AWAITING_DEPOSIT", "CONFIRMED"] },
      AND: [{ startTime: { lt: endTime } }, { endTime: { gt: booking.startTime } }],
    },
    select: {
      startTime: true,
      endTime: true,
      clientFirstName: true,
      clientLastName: true,
    },
  });
  if (conflict && !data.force) {
    return {
      ok: false,
      code: "OVERLAP",
      error: `La nouvelle durée chevauche le RDV de ${conflict.clientFirstName} ${conflict.clientLastName} (${conflict.startTime}–${conflict.endTime}). Appliquer quand même ?`,
    };
  }

  await prisma.$transaction([
    prisma.bookingOption.deleteMany({ where: { bookingId } }),
    prisma.booking.update({
      where: { id: bookingId },
      data: {
        clientFirstName: data.client.firstName,
        clientLastName: data.client.lastName,
        clientEmail: data.client.email,
        clientPhone: data.client.phone,
        clientMessage: data.client.message?.trim() || null,
        serviceId: service.id,
        totalDurationMinutes,
        totalPriceCents,
        depositCents,
        endTime,
        options: {
          create: data.optionIds.map((id) => ({ serviceOptionId: id })),
        },
      },
    }),
  ]);

  await audit(admin.id, bookingId, "booking.updated", {
    serviceId: service.id,
    optionIds: data.optionIds,
    totalPriceCents,
    depositCents,
    endTime,
    forced: Boolean(conflict && data.force),
  });

  if (data.notifyClient) {
    const mail = buildBookingConfirmationEmail({
      clientFirstName: data.client.firstName,
      clientEmail: data.client.email,
      serviceTitle: service.title,
      optionsTitles: options.map((o) => o.title),
      date: booking.date,
      startTime: booking.startTime,
      endTime,
      totalDurationMinutes,
      depositCents,
      giftCardAmountCents: 0,
      clientActionToken: booking.clientActionToken ?? undefined,
      paymentMethod: booking.paymentMethod ?? undefined,
    });
    const sent = await sendEmail({
      to: data.client.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tag: "booking.updated",
    });
    if (!sent.ok) {
      console.error("[updateBookingDetails] email cliente échoué:", sent.error);
    }
  }

  revalidatePath("/admin", "layout");
  return {
    ok: true,
    message:
      conflict && data.force
        ? "Réservation modifiée (chevauchement forcé)."
        : "Réservation modifiée.",
  };
}
