/**
 * Helper serveur (non "use server") pour appliquer une redemption gift card.
 *
 * Appelé depuis :
 *  - createBookingAction (quand acompte = 0 ou en dev fallback)
 *  - Webhook Stripe checkout.session.completed (quand Stripe a confirmé)
 *
 * Sécurité :
 *  - Optimistic locking via version sur GiftCard
 *  - Decrement atomique dans une transaction
 *  - Crée le record GiftCardRedemption pour audit
 *
 * Si la carte a été utilisée entre-temps (race), throw → caller doit rollback.
 */

import type { GiftCardRedemptionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { buildGiftCardDepletedEmail } from "@/lib/email/templates/gift-card-depleted";
import { emitOutboundEvent } from "@/lib/outbound-events";

export type RedemptionInput = {
  giftCardId: string;
  amountCents: number;
  /** Soit bookingId pour BOOKING_*, soit ebookPurchaseId pour EBOOK. Exactement un des deux. */
  bookingId?: string;
  ebookPurchaseId?: string;
  redeemedByEmail: string;
  ipAddress?: string | null;
  /** Type de la redemption. Défaut "BOOKING_DEPOSIT" pour rétro-compat. */
  type?: GiftCardRedemptionType;
  /** id de l'admin si déclenchée depuis l'admin (BOOKING_SERVICE typiquement). */
  redeemedByAdminId?: string | null;
};

export class GiftCardRedemptionError extends Error {
  constructor(
    public reason: "NOT_FOUND" | "INSUFFICIENT" | "INACTIVE" | "EXPIRED",
    message: string,
  ) {
    super(message);
    this.name = "GiftCardRedemptionError";
  }
}

/**
 * Décrémente la carte cadeau + crée la redemption + update status.
 * Idempotent : si une redemption existe déjà pour (giftCardId, bookingId), no-op.
 */
export async function applyGiftCardRedemption(
  input: RedemptionInput,
): Promise<void> {
  const {
    giftCardId,
    amountCents,
    bookingId,
    ebookPurchaseId,
    redeemedByEmail,
    ipAddress,
    type = "BOOKING_DEPOSIT",
    redeemedByAdminId = null,
  } = input;

  if (amountCents <= 0) {
    throw new Error("amountCents must be positive");
  }

  // XOR sur la ressource liée : exactement un des deux ids doit être fourni
  // (sauf pour BOOKING_* qui nécessite bookingId, EBOOK qui nécessite
  // ebookPurchaseId).
  if (type === "EBOOK") {
    if (!ebookPurchaseId)
      throw new Error("ebookPurchaseId requis pour redemption EBOOK");
    if (bookingId)
      throw new Error("bookingId ne doit pas être fourni pour EBOOK");
  } else {
    if (!bookingId)
      throw new Error("bookingId requis pour redemption BOOKING_*");
    if (ebookPurchaseId)
      throw new Error("ebookPurchaseId ne doit pas être fourni pour BOOKING_*");
  }

  let didDeplete = false;
  let didRedeem = false;
  let depletedCardInfo: {
    prefix: string;
    initialAmountCents: number;
    recipientEmail: string | null;
    recipientName: string | null;
    buyerEmail: string;
    buyerName: string;
  } | null = null;

  await prisma.$transaction(async (tx) => {
    // Idempotence :
    //  - BOOKING_* : par (giftCardId, bookingId, type). DEPOSIT et SERVICE
    //    peuvent coexister sur le même booking.
    //  - EBOOK : par (giftCardId, ebookPurchaseId, type). Un seul achat ebook
    //    par redemption ebookPurchase (unique constraint sur ebookPurchaseId
    //    dans le schéma).
    const existing = await tx.giftCardRedemption.findFirst({
      where: type === "EBOOK"
        ? { giftCardId, ebookPurchaseId, type }
        : { giftCardId, bookingId, type },
      select: { id: true },
    });
    if (existing) return;

    const card = await tx.giftCard.findUnique({
      where: { id: giftCardId },
      select: {
        id: true,
        status: true,
        remainingAmountCents: true,
        initialAmountCents: true,
        expiresAt: true,
        version: true,
        prefix: true,
        recipientEmail: true,
        recipientName: true,
        buyerEmail: true,
        buyerName: true,
      },
    });
    if (!card) {
      throw new GiftCardRedemptionError("NOT_FOUND", "Carte cadeau introuvable.");
    }
    if (card.status !== "ACTIVE" && card.status !== "PARTIALLY_USED") {
      throw new GiftCardRedemptionError("INACTIVE", "Carte cadeau non utilisable.");
    }
    if (card.expiresAt < new Date()) {
      throw new GiftCardRedemptionError("EXPIRED", "Carte cadeau expirée.");
    }
    if (card.remainingAmountCents < amountCents) {
      throw new GiftCardRedemptionError(
        "INSUFFICIENT",
        `Solde insuffisant (${card.remainingAmountCents} < ${amountCents}).`,
      );
    }

    const newRemaining = card.remainingAmountCents - amountCents;
    const newStatus =
      newRemaining === 0 ? "FULLY_USED" : "PARTIALLY_USED";

    // Optimistic lock : on n'update que si la version n'a pas changé
    const updated = await tx.giftCard.updateMany({
      where: { id: card.id, version: card.version },
      data: {
        remainingAmountCents: newRemaining,
        status: newStatus,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new GiftCardRedemptionError(
        "INSUFFICIENT",
        "Concurrent update détecté sur la carte cadeau.",
      );
    }

    await tx.giftCardRedemption.create({
      data: {
        giftCardId: card.id,
        type,
        bookingId: type === "EBOOK" ? null : bookingId,
        ebookPurchaseId: type === "EBOOK" ? ebookPurchaseId : null,
        amountUsedCents: amountCents,
        redeemedByEmail,
        redeemedByAdminId,
        ipAddress: ipAddress ?? null,
      },
    });

    didRedeem = true;

    if (newStatus === "FULLY_USED") {
      didDeplete = true;
      depletedCardInfo = {
        prefix: card.prefix,
        initialAmountCents: card.initialAmountCents,
        recipientEmail: card.recipientEmail,
        recipientName: card.recipientName,
        buyerEmail: card.buyerEmail,
        buyerName: card.buyerName,
      };
    }
  });

  // Email "carte épuisée" (hors transaction, best-effort)
  if (didDeplete && depletedCardInfo) {
    void sendDepletedEmail(depletedCardInfo);
  }

  if (didRedeem) {
    await emitOutboundEvent("gift_card.redeemed", {
      giftCardId,
      amountUsedCents: amountCents,
      type,
      bookingId: type === "EBOOK" ? null : bookingId,
      ebookPurchaseId: type === "EBOOK" ? ebookPurchaseId : null,
    });
    if (didDeplete) {
      await emitOutboundEvent("gift_card.depleted", { giftCardId });
    }
  }
}

/**
 * Annule une redemption existante : re-crédite la carte cadeau du montant
 * correspondant (ou d'un partiel si fourni), marque la redemption comme
 * réversée. Statut GC recalculé en fonction du nouveau solde.
 *
 * Cas d'usage :
 *  - Annulation booking avec acompte payé via GC → re-crédite l'acompte
 *  - Annulation booking avec complément markCompleted via GC → re-crédite
 *
 * Idempotent : si déjà reversedAt, no-op silencieux.
 * Optimistic locking sur la GC.
 */
export async function reverseGiftCardRedemption(
  redemptionId: string,
  options?: { partialAmountCents?: number },
): Promise<{ reversedAmountCents: number; giftCardPrefix: string }> {
  let reversedGiftCardId: string | null = null;
  let reversedAmountForEvent = 0;
  const result = await prisma.$transaction(async (tx) => {
    const redemption = await tx.giftCardRedemption.findUnique({
      where: { id: redemptionId },
      select: {
        id: true,
        giftCardId: true,
        amountUsedCents: true,
        reversedAt: true,
        reversedAmountCents: true,
        giftCard: {
          select: {
            id: true,
            prefix: true,
            status: true,
            remainingAmountCents: true,
            initialAmountCents: true,
            version: true,
          },
        },
      },
    });
    if (!redemption) {
      throw new Error(`Redemption ${redemptionId} introuvable.`);
    }
    if (redemption.reversedAt) {
      // Idempotence
      return {
        reversedAmountCents: redemption.reversedAmountCents ?? 0,
        giftCardPrefix: redemption.giftCard.prefix,
      };
    }

    const amountToReverse =
      options?.partialAmountCents ?? redemption.amountUsedCents;
    if (amountToReverse <= 0 || amountToReverse > redemption.amountUsedCents) {
      throw new Error(
        `Montant à reverser invalide (${amountToReverse} / ${redemption.amountUsedCents}).`,
      );
    }

    const card = redemption.giftCard;
    const newRemaining = card.remainingAmountCents + amountToReverse;

    // Recalcule status. On NE TOUCHE PAS aux statuts CANCELLED / REFUNDED
    // (admin a explicitement passé la carte dans un état terminal).
    let newStatus = card.status;
    if (card.status === "FULLY_USED" || card.status === "PARTIALLY_USED") {
      newStatus =
        newRemaining >= card.initialAmountCents ? "ACTIVE" : "PARTIALLY_USED";
    } else if (card.status === "EXPIRED") {
      // Carte expirée : on re-crédite mais on garde EXPIRED (la cliente devra
      // demander une prolongation pour s'en resservir). Tracé en audit.
      newStatus = "EXPIRED";
    }

    const updated = await tx.giftCard.updateMany({
      where: { id: card.id, version: card.version },
      data: {
        remainingAmountCents: newRemaining,
        status: newStatus,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new Error("Concurrent update détecté sur la carte cadeau.");
    }

    await tx.giftCardRedemption.update({
      where: { id: redemption.id },
      data: {
        reversedAt: new Date(),
        reversedAmountCents: amountToReverse,
      },
    });

    reversedGiftCardId = redemption.giftCardId;
    reversedAmountForEvent = amountToReverse;

    return {
      reversedAmountCents: amountToReverse,
      giftCardPrefix: card.prefix,
    };
  });

  if (reversedGiftCardId) {
    await emitOutboundEvent("gift_card.reversed", {
      giftCardId: reversedGiftCardId,
      amountReversedCents: reversedAmountForEvent,
    });
  }

  return result;
}

async function sendDepletedEmail(info: {
  prefix: string;
  initialAmountCents: number;
  recipientEmail: string | null;
  recipientName: string | null;
  buyerEmail: string;
  buyerName: string;
}): Promise<void> {
  const to = info.recipientEmail ?? info.buyerEmail;
  const fullName = info.recipientName ?? info.buyerName;
  // Si admin (no recipient + buyer = admin email), pas d'envoi
  if (to.startsWith("admin@")) return;

  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://clochette-nails.fr";
    const email = buildGiftCardDepletedEmail({
      firstName: fullName.split(" ")[0] ?? fullName,
      prefix: info.prefix,
      initialAmountCents: info.initialAmountCents,
      reservationUrl: `${siteUrl}/reservation`,
    });
    await sendEmail({
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      tag: "gift-card.depleted",
    });
  } catch (err) {
    console.error("[gift-card] depleted email échec:", err);
  }
}
