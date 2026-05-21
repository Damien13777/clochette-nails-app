"use server";

/**
 * Server Actions appelées depuis les pages publiques de gestion de RDV
 * (lien dans le mail de confirmation).
 *
 * cancelBookingByClient :
 *  - Vérifie token + statut CONFIRMED
 *  - Si > 72h → refund Stripe total (CGV §11)
 *  - Si < 72h → annulation sans refund (acompte conservé selon CGV §11)
 *  - Booking → CANCELLED_BY_CLIENT, token marqué utilisé
 *  - Emails : cliente + admin + Notification in-app
 *
 * Le déplacement (#15) lui n'est PAS autorisé < 72h.
 */

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { sendEmail } from "@/lib/email/send";
import { ADMIN_EMAIL } from "@/lib/email/client";
import { buildBookingRefundedClientEmail } from "@/lib/email/templates/booking-refunded-client";
import { buildBookingCancelledClientEmail } from "@/lib/email/templates/booking-cancelled-client";
import { buildBookingCancelledByClientNotifAdminEmail } from "@/lib/email/templates/booking-cancelled-by-client-notif-admin";
import { buildBookingRescheduledEmail } from "@/lib/email/templates/booking-rescheduled";
import { buildBookingRescheduledByClientNotifAdminEmail } from "@/lib/email/templates/booking-rescheduled-by-client-notif-admin";
import { computeAvailableSlots } from "@/lib/availability";
import {
  AUTH_FAIL,
  checkRateLimit,
  recordRateLimit,
} from "@/lib/rate-limit";
import { resolveClientToken } from "@/lib/booking-client-token";
import { reverseGiftCardRedemption } from "@/lib/gift-card-redeem";

type CancelResult =
  | {
      ok: true;
      refundedCents: number;
      depositKept: boolean;
      /** Détail du remboursement (présent uniquement si refunded > 0) */
      refundBreakdown?: {
        stripeCents: number;
        giftCardCents: number;
        giftCardPrefix: string | null;
      };
    }
  | { ok: false; error: string; code?: string };

const REASON_WITH_REFUND =
  "Annulation par la cliente via lien sécurisé (CGV §11 : > 72h, remboursement intégral)";
const REASON_WITHOUT_REFUND =
  "Annulation par la cliente via lien sécurisé (CGV §11 : < 72h, acompte conservé)";

function clientIp(h: Headers): string {
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown"
  );
}

export async function cancelBookingByClient(
  token: string,
): Promise<CancelResult> {
  const h = await headers();
  const ip = clientIp(h);

  // Rate limit IP — défense en profondeur contre brute force sur les tokens
  const rl = checkRateLimit(AUTH_FAIL.bucket, ip, AUTH_FAIL.max, AUTH_FAIL.windowMs);
  if (!rl.allowed) {
    return {
      ok: false,
      error: "Trop de tentatives. Réessayez dans quelques minutes.",
      code: "RATE_LIMITED",
    };
  }
  recordRateLimit(AUTH_FAIL.bucket, ip, AUTH_FAIL.windowMs);

  const resolved = await resolveClientToken(token);

  if (resolved.state === "missing" || resolved.state === "invalid") {
    return { ok: false, error: "Lien invalide.", code: "INVALID_TOKEN" };
  }
  if (resolved.state === "used") {
    return {
      ok: false,
      error: "Ce lien a déjà été utilisé. Contactez le salon pour toute modification.",
      code: "TOKEN_USED",
    };
  }
  if (resolved.state === "wrong-status") {
    return {
      ok: false,
      error: `Cette réservation n'est plus active (${resolved.status}).`,
      code: "WRONG_STATUS",
    };
  }

  // L'annulation est autorisée dans les 2 cas (actionable + too-late).
  // Seul le déplacement (#15) est interdit < 72h.
  //
  // Politique de remboursement (CGV §11) :
  //  - > 72h : on rembourse ce qui peut l'être (Stripe + GC).
  //  - < 72h : acompte conservé, peu importe la méthode.
  //
  // Sources possibles à rembourser :
  //  - Portion Stripe (paymentMethod === "stripe" + stripePaymentId)
  //  - Portion(s) Gift Card (redemptions type=BOOKING_DEPOSIT non-réversées)
  const { booking, hoursLeft } = resolved;

  // Récupère les redemptions DEPOSIT actives sur ce booking
  const depositRedemptions = await prisma.giftCardRedemption.findMany({
    where: {
      bookingId: booking.id,
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

  // Stripe portion = ce qu'il reste après déduction des GC
  const stripePortion =
    booking.paymentMethod === "stripe"
      ? Math.max(0, booking.depositCents - gcDepositCents)
      : 0;
  const canRefundStripe = stripePortion > 0 && !!booking.stripePaymentId;
  const canRefundGC = depositRedemptions.length > 0;
  const willRefund =
    resolved.state === "actionable" && (canRefundStripe || canRefundGC);

  let stripeRefundedCents = 0;
  let gcRefundedCents = 0;
  let gcPrefix: string | null = null;

  if (willRefund) {
    // ── Refund Stripe (s'il y a une portion Stripe) ──────────
    if (canRefundStripe) {
      if (!stripe) {
        return {
          ok: false,
          error: "Service de remboursement indisponible. Contactez le salon.",
          code: "STRIPE_UNAVAILABLE",
        };
      }
      if (
        booking.refundedAmount &&
        booking.refundedAmount >= stripePortion
      ) {
        // Stripe déjà remboursé — on continue sur la GC s'il y en a
      } else {
        try {
          const refund = await stripe.refunds.create({
            payment_intent: booking.stripePaymentId!,
            reason: "requested_by_customer",
            metadata: {
              bookingId: booking.id,
              triggeredBy: "client_link",
              ipAddress: ip,
            },
          });
          stripeRefundedCents = refund.amount;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Erreur Stripe";
          console.error("[cancelBookingByClient] refund Stripe échoué:", err);
          return {
            ok: false,
            error: `Le remboursement a échoué : ${msg}. Contactez le salon, votre annulation n'a pas été enregistrée.`,
            code: "REFUND_FAILED",
          };
        }
      }
    }

    // ── Reverse les redemptions GC (re-crédite la carte) ─────
    if (canRefundGC) {
      for (const r of depositRedemptions) {
        try {
          const result = await reverseGiftCardRedemption(r.id);
          gcRefundedCents += result.reversedAmountCents;
          gcPrefix ??= result.giftCardPrefix;
        } catch (err) {
          console.error(
            "[cancelBookingByClient] reverse redemption échoué:",
            err,
          );
          // Si Stripe a déjà refund mais la GC échoue, on laisse l'annulation
          // se faire (le booking annulé) mais on log pour intervention admin.
        }
      }
    }
  }

  const totalRefundedCents = stripeRefundedCents + gcRefundedCents;

  // Update booking + marque token utilisé.
  // refundedAmount = portion Stripe uniquement (la GC est tracée via redemption.reversedAt)
  const now = new Date();
  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: "CANCELLED_BY_CLIENT",
      cancelledAt: now,
      cancellationReason: willRefund
        ? REASON_WITH_REFUND
        : REASON_WITHOUT_REFUND,
      ...(stripeRefundedCents > 0
        ? { refundedAmount: stripeRefundedCents }
        : {}),
      clientActionUsedAt: now,
    },
  });

  // Pas d'AuditLog (adminId obligatoire) : les infos forensic sont tracées sur
  // le booking (cancelledAt, cancellationReason, refundedAmount, clientActionUsedAt)
  // + la Notification in-app + l'email admin.

  // Notification in-app admin (cloche)
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  if (admin) {
    let notifBody: string;
    if (!willRefund) {
      notifBody = `RDV du ${booking.date.toLocaleDateString("fr-FR")} à ${booking.startTime} — Annulation < 72h, acompte conservé.`;
    } else if (stripeRefundedCents > 0 && gcRefundedCents > 0) {
      notifBody = `RDV du ${booking.date.toLocaleDateString("fr-FR")} à ${booking.startTime} — Remboursement ${(stripeRefundedCents / 100).toFixed(2)} € Stripe + ${(gcRefundedCents / 100).toFixed(2)} € re-crédité sur carte cadeau ••${gcPrefix}.`;
    } else if (gcRefundedCents > 0) {
      notifBody = `RDV du ${booking.date.toLocaleDateString("fr-FR")} à ${booking.startTime} — ${(gcRefundedCents / 100).toFixed(2)} € re-crédité sur carte cadeau ••${gcPrefix}.`;
    } else {
      notifBody = `RDV du ${booking.date.toLocaleDateString("fr-FR")} à ${booking.startTime} — Remboursement ${(stripeRefundedCents / 100).toFixed(2)} € en cours.`;
    }
    await prisma.notification.create({
      data: {
        userId: admin.id,
        type: "BOOKING_CANCELLED",
        title: `Annulation cliente : ${booking.clientFirstName} ${booking.clientLastName}`,
        body: notifBody,
        link: `/admin/bookings/${booking.id}`,
        metadata: {
          bookingId: booking.id,
          cancelledByClient: true,
          stripeRefundedCents,
          gcRefundedCents,
          gcPrefix,
          depositKept: !willRefund,
        } as object,
      },
    });
  }

  // Email cliente — variante selon refund ou pas
  try {
    if (willRefund) {
      const clientMail = buildBookingRefundedClientEmail({
        clientFirstName: booking.clientFirstName,
        serviceTitle: booking.serviceTitle,
        date: booking.date,
        startTime: booking.startTime,
        reason:
          "Annulation effectuée en ligne depuis le lien sécurisé de votre email de confirmation.",
        refundedCents: totalRefundedCents,
        stripeRefundedCents,
        giftCardRefundedCents: gcRefundedCents,
        giftCardPrefix: gcPrefix,
      });
      await sendEmail({
        to: booking.clientEmail,
        subject: clientMail.subject,
        html: clientMail.html,
        text: clientMail.text,
        tag: "booking.cancelled-by-client",
      });
    } else {
      // Détermine le contexte exact pour adapter le wording du mail.
      // - paymentMethod === "none" → no-deposit (annulation libre)
      // - paymentMethod ∈ {cash, transfer, check, card_terminal, gift_card_full}
      //   → paid-in-person (acompte conservé, pas remboursable en ligne)
      // - paymentMethod === "stripe" + state === "too-late" → too-late (acompte conservé délai CGV)
      const depositReason: "too-late" | "paid-in-person" | "no-deposit" =
        booking.paymentMethod === "none"
          ? "no-deposit"
          : booking.paymentMethod !== "stripe" &&
              booking.paymentMethod !== null
            ? "paid-in-person"
            : "too-late";

      const reasonText =
        depositReason === "paid-in-person"
          ? "Annulation effectuée en ligne. L'acompte ayant été réglé en main propre au salon, il est conservé selon CGV §11."
          : depositReason === "no-deposit"
            ? "Annulation effectuée en ligne. Aucun acompte n'avait été versé pour ce rendez-vous."
            : "Annulation effectuée en ligne, moins de 72 heures avant le rendez-vous (acompte conservé selon CGV §11).";

      const clientMail = buildBookingCancelledClientEmail({
        clientFirstName: booking.clientFirstName,
        serviceTitle: booking.serviceTitle,
        date: booking.date,
        startTime: booking.startTime,
        reason: reasonText,
        depositKept: true,
        depositReason,
      });
      await sendEmail({
        to: booking.clientEmail,
        subject: clientMail.subject,
        html: clientMail.html,
        text: clientMail.text,
        tag: "booking.cancelled-by-client-no-refund",
      });
    }
  } catch (err) {
    console.error("[cancelBookingByClient] email cliente échoué:", err);
  }

  // Email admin — notif annulation cliente
  try {
    const adminMail = buildBookingCancelledByClientNotifAdminEmail({
      bookingId: booking.id,
      clientFirstName: booking.clientFirstName,
      clientLastName: booking.clientLastName,
      clientEmail: booking.clientEmail,
      clientPhone: booking.clientPhone,
      serviceTitle: booking.serviceTitle,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      refundedCents: totalRefundedCents,
      stripeRefundedCents,
      giftCardRefundedCents: gcRefundedCents,
      giftCardPrefix: gcPrefix,
      hoursBeforeAppointment: hoursLeft,
      paymentMethod: booking.paymentMethod,
    });
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: adminMail.subject,
      html: adminMail.html,
      text: adminMail.text,
      replyTo: booking.clientEmail,
      tag: "booking.cancelled-by-client-notif-admin",
    });
  } catch (err) {
    console.error("[cancelBookingByClient] email admin échoué:", err);
  }

  return {
    ok: true,
    refundedCents: totalRefundedCents,
    depositKept: !willRefund,
    refundBreakdown:
      totalRefundedCents > 0
        ? {
            stripeCents: stripeRefundedCents,
            giftCardCents: gcRefundedCents,
            giftCardPrefix: gcPrefix,
          }
        : undefined,
  };
}

// ─────────────────────────────────────────────────────────
// Déplacement côté cliente (#15)
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
        durationMinutes: number;
      };
    }
  | { ok: false; error: string; code?: string };

/**
 * Récupère les créneaux dispo pour le déplacement cliente.
 * Refuse <72h (le déplacement n'est pas autorisé hors délai).
 */
export async function getAvailableSlotsForClientReschedule(
  token: string,
  newDate: string, // YYYY-MM-DD
): Promise<GetSlotsResult> {
  const h = await headers();
  const ip = clientIp(h);

  const rl = checkRateLimit(AUTH_FAIL.bucket, ip, AUTH_FAIL.max, AUTH_FAIL.windowMs);
  if (!rl.allowed) {
    return {
      ok: false,
      error: "Trop de tentatives. Réessayez dans quelques minutes.",
      code: "RATE_LIMITED",
    };
  }
  // Pas de record : on ne consomme une tentative que sur l'action finale.

  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    return { ok: false, error: "Date invalide.", code: "INVALID_DATE" };
  }

  const resolved = await resolveClientToken(token);
  if (resolved.state === "missing" || resolved.state === "invalid") {
    return { ok: false, error: "Lien invalide.", code: "INVALID_TOKEN" };
  }
  if (resolved.state === "used") {
    return {
      ok: false,
      error: "Ce lien a déjà été utilisé.",
      code: "TOKEN_USED",
    };
  }
  if (resolved.state === "wrong-status") {
    return {
      ok: false,
      error: `Réservation non modifiable (${resolved.status}).`,
      code: "WRONG_STATUS",
    };
  }
  if (resolved.state === "too-late") {
    return {
      ok: false,
      error: "Le déplacement n'est plus possible (moins de 72h avant le RDV).",
      code: "TOO_LATE",
    };
  }

  const { booking } = resolved;
  const result = await computeAvailableSlots({
    date: newDate,
    totalDurationMinutes: booking.totalDurationMinutes,
    excludeBookingId: booking.id,
  });

  return {
    ok: true,
    slots: result.slots,
    reason: result.reason,
    booking: {
      date: booking.date.toISOString().slice(0, 10),
      startTime: booking.startTime,
      durationMinutes: booking.totalDurationMinutes,
    },
  };
}

type RescheduleResult =
  | {
      ok: true;
      newDate: string;
      newStartTime: string;
      newEndTime: string;
    }
  | { ok: false; error: string; code?: string };

/**
 * Déplace un booking via le lien tokenisé.
 * Refuse <72h (CGV §11). Single-use : marque clientActionUsedAt après succès.
 */
export async function rescheduleBookingByClient(
  token: string,
  newDate: string,
  newStartTime: string,
  clientReason?: string,
): Promise<RescheduleResult> {
  const h = await headers();
  const ip = clientIp(h);

  const rl = checkRateLimit(AUTH_FAIL.bucket, ip, AUTH_FAIL.max, AUTH_FAIL.windowMs);
  if (!rl.allowed) {
    return {
      ok: false,
      error: "Trop de tentatives. Réessayez dans quelques minutes.",
      code: "RATE_LIMITED",
    };
  }
  recordRateLimit(AUTH_FAIL.bucket, ip, AUTH_FAIL.windowMs);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    return { ok: false, error: "Date invalide.", code: "INVALID_DATE" };
  }
  if (!/^\d{2}:\d{2}$/.test(newStartTime)) {
    return { ok: false, error: "Heure invalide.", code: "INVALID_TIME" };
  }

  // Validation longueur motif (optionnel mais borné)
  const trimmedReason = clientReason?.trim() ?? "";
  if (trimmedReason.length > 500) {
    return {
      ok: false,
      error: "Motif trop long (500 caractères max).",
      code: "REASON_TOO_LONG",
    };
  }

  const resolved = await resolveClientToken(token);
  if (resolved.state === "missing" || resolved.state === "invalid") {
    return { ok: false, error: "Lien invalide.", code: "INVALID_TOKEN" };
  }
  if (resolved.state === "used") {
    return {
      ok: false,
      error: "Ce lien a déjà été utilisé.",
      code: "TOKEN_USED",
    };
  }
  if (resolved.state === "wrong-status") {
    return {
      ok: false,
      error: `Réservation non modifiable (${resolved.status}).`,
      code: "WRONG_STATUS",
    };
  }
  if (resolved.state === "too-late") {
    return {
      ok: false,
      error:
        "Le déplacement n'est plus possible (moins de 72h avant le RDV). Vous pouvez annuler le RDV (acompte conservé) et reprendre rendez-vous.",
      code: "TOO_LATE",
    };
  }

  const { booking, hoursLeft } = resolved;
  const oldDateIso = booking.date.toISOString().slice(0, 10);

  if (oldDateIso === newDate && booking.startTime === newStartTime) {
    return {
      ok: false,
      error: "Le créneau choisi est identique au créneau actuel.",
      code: "SAME_SLOT",
    };
  }

  // Vérification serveur : créneau réellement libre (defense in depth)
  const avail = await computeAvailableSlots({
    date: newDate,
    totalDurationMinutes: booking.totalDurationMinutes,
    excludeBookingId: booking.id,
  });
  if (!avail.slots.includes(newStartTime)) {
    return {
      ok: false,
      error: avail.reason
        ? `Ce créneau n'est plus disponible.`
        : "Ce créneau vient d'être pris. Choisissez-en un autre.",
      code: "SLOT_TAKEN",
    };
  }

  const newEndTime = addMinutesToTime(newStartTime, booking.totalDurationMinutes);
  const newDateObj = new Date(newDate + "T00:00:00.000Z");
  const now = new Date();

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      date: newDateObj,
      startTime: newStartTime,
      endTime: newEndTime,
      clientActionUsedAt: now,
    },
  });

  // Notification in-app admin
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  if (admin) {
    const reasonExcerpt = trimmedReason
      ? ` — Motif : ${trimmedReason.length > 80 ? trimmedReason.slice(0, 77) + "…" : trimmedReason}`
      : "";
    await prisma.notification.create({
      data: {
        userId: admin.id,
        type: "BOOKING_RESCHEDULED",
        title: `RDV déplacé par la cliente : ${booking.clientFirstName} ${booking.clientLastName}`,
        body: `${oldDateIso} ${booking.startTime} → ${newDate} ${newStartTime}${reasonExcerpt}`,
        link: `/admin/bookings/${booking.id}`,
        metadata: {
          bookingId: booking.id,
          movedByClient: true,
          oldDate: oldDateIso,
          oldStartTime: booking.startTime,
          newDate,
          newStartTime,
          clientRescheduleReason: trimmedReason || null,
          ipAddress: ip,
        } as object,
      },
    });
  }

  // Email cliente — confirmation déplacement (template partagé)
  try {
    const clientMail = buildBookingRescheduledEmail({
      clientFirstName: booking.clientFirstName,
      serviceTitle: booking.serviceTitle,
      oldDate: booking.date,
      oldStartTime: booking.startTime,
      oldEndTime: booking.endTime,
      newDate: newDateObj,
      newStartTime,
      newEndTime,
      reason: null, // pas de "motif" affiché à la cliente : c'est elle qui l'a écrit
    });
    await sendEmail({
      to: booking.clientEmail,
      subject: clientMail.subject,
      html: clientMail.html,
      text: clientMail.text,
      tag: "booking.rescheduled-by-client",
    });
  } catch (err) {
    console.error("[rescheduleBookingByClient] email cliente échoué:", err);
  }

  // Email admin — notif avec motif s'il y en a un
  try {
    const adminMail = buildBookingRescheduledByClientNotifAdminEmail({
      bookingId: booking.id,
      clientFirstName: booking.clientFirstName,
      clientLastName: booking.clientLastName,
      clientEmail: booking.clientEmail,
      clientPhone: booking.clientPhone,
      serviceTitle: booking.serviceTitle,
      oldDate: booking.date,
      oldStartTime: booking.startTime,
      oldEndTime: booking.endTime,
      newDate: newDateObj,
      newStartTime,
      newEndTime,
      clientReason: trimmedReason || null,
      hoursBeforeOldAppointment: hoursLeft,
    });
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: adminMail.subject,
      html: adminMail.html,
      text: adminMail.text,
      replyTo: booking.clientEmail,
      tag: "booking.rescheduled-by-client-notif-admin",
    });
  } catch (err) {
    console.error("[rescheduleBookingByClient] email admin échoué:", err);
  }

  return {
    ok: true,
    newDate,
    newStartTime,
    newEndTime,
  };
}
