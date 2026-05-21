/**
 * Résolution du token cliente (clientActionToken) pour les pages publiques
 * /reservation/annuler et /reservation/deplacer.
 *
 * Détermine l'état d'un token et les actions possibles, en respectant la CGV §11 :
 *  - Modification possible uniquement > 72h avant le RDV
 *  - Token single-use : invalidé après usage
 *  - Booking doit être CONFIRMED (pas annulé, pas passé, pas no-show)
 *
 * Ce module est partagé entre les pages Server Components et les Server Actions.
 */

import { prisma } from "@/lib/prisma";

/** Délai minimum CGV avant lequel la cliente peut annuler/déplacer en ligne */
export const CLIENT_ACTION_DEADLINE_HOURS = 72;

export type ResolvedToken =
  | { state: "missing" }
  | { state: "invalid" } // token inconnu
  | { state: "used"; usedAt: Date } // token déjà utilisé
  | { state: "wrong-status"; status: string } // booking annulé / passé / no-show
  | {
      state: "too-late"; // < 72h avant le RDV
      hoursLeft: number;
      booking: ResolvedBooking;
    }
  | {
      state: "actionable"; // OK pour annuler/déplacer
      hoursLeft: number;
      booking: ResolvedBooking;
    };

export type ResolvedBooking = {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  clientFirstName: string;
  clientLastName: string;
  clientEmail: string;
  clientPhone: string;
  serviceTitle: string;
  serviceId: string;
  totalDurationMinutes: number;
  depositCents: number;
  stripePaymentId: string | null;
  refundedAmount: number | null;
  /**
   * Mode de paiement effectif. Détermine si un remboursement est possible
   * via le lien d'annulation cliente :
   *  - "stripe" → refund possible (> 72h)
   *  - "cash" | "transfer" | "check" | "card_terminal" | "gift_card_full"
   *    → acompte conservé (paiement en main propre, pas de refund automatique)
   *  - "none" → pas d'acompte versé (RDV admin sans acompte)
   *  - null → cas legacy, traité comme stripe pour rétro-compat
   */
  paymentMethod: string | null;
};

/**
 * Combine la date (YYYY-MM-DD) et l'heure (HH:MM) en un Date Europe/Paris.
 * Utilise un offset fixe — on assume tout le serveur en Europe/Paris pour cette V1.
 */
function combineDateAndTime(date: Date, time: string): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const [hh, mm] = time.split(":").map((x) => parseInt(x, 10));
  // Construction en UTC ; on suppose date stockée en date pure (sans TZ).
  return new Date(Date.UTC(y, m, d, hh, mm, 0));
}

/**
 * Lit le booking via son token cliente + détermine l'état.
 * Pas de side effect — utilisable depuis Server Component ou Server Action.
 */
export async function resolveClientToken(
  token: string | null | undefined,
): Promise<ResolvedToken> {
  if (!token || token.length < 32) {
    return { state: "missing" };
  }

  const booking = await prisma.booking.findUnique({
    where: { clientActionToken: token },
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      status: true,
      clientFirstName: true,
      clientLastName: true,
      clientEmail: true,
      clientPhone: true,
      serviceId: true,
      totalDurationMinutes: true,
      depositCents: true,
      stripePaymentId: true,
      refundedAmount: true,
      paymentMethod: true,
      clientActionUsedAt: true,
      service: { select: { title: true } },
    },
  });

  if (!booking) return { state: "invalid" };

  if (booking.clientActionUsedAt) {
    return { state: "used", usedAt: booking.clientActionUsedAt };
  }

  if (booking.status !== "CONFIRMED") {
    return { state: "wrong-status", status: booking.status };
  }

  const appointmentAt = combineDateAndTime(booking.date, booking.startTime);
  const now = new Date();
  const hoursLeft = (appointmentAt.getTime() - now.getTime()) / (1000 * 60 * 60);

  const resolved: ResolvedBooking = {
    id: booking.id,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    clientFirstName: booking.clientFirstName,
    clientLastName: booking.clientLastName,
    clientEmail: booking.clientEmail,
    clientPhone: booking.clientPhone,
    serviceTitle: booking.service.title,
    serviceId: booking.serviceId,
    totalDurationMinutes: booking.totalDurationMinutes,
    depositCents: booking.depositCents,
    stripePaymentId: booking.stripePaymentId,
    refundedAmount: booking.refundedAmount,
    paymentMethod: booking.paymentMethod,
  };

  if (hoursLeft < CLIENT_ACTION_DEADLINE_HOURS) {
    return { state: "too-late", hoursLeft, booking: resolved };
  }

  return { state: "actionable", hoursLeft, booking: resolved };
}
