"use server";

/**
 * Server Actions — gift cards (public).
 *
 * V1 :
 *  - validateGiftCardCode(code) : appelée depuis l'UI réservation pour
 *    vérifier qu'un code est valide avant submit. Retourne le solde dispo.
 *
 * Phase 2 (admin) :
 *  - createGiftCard, refundGiftCard, listRedemptions
 *
 * Rate-limit : 10 validations / IP / heure pour limiter brute-force des codes.
 */

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/client-ip";
import {
  GIFT_CARD_VALIDATE,
  checkRateLimit,
  recordRateLimit,
} from "@/lib/rate-limit";

export type GiftCardValidationResult =
  | {
      ok: true;
      data: {
        prefix: string; // 4 derniers chars (pour confirm UI)
        remainingAmountCents: number;
        expiresAt: string; // ISO date
      };
    }
  | { ok: false; error: string };

export async function validateGiftCardCode(
  code: string,
): Promise<GiftCardValidationResult> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { ok: false, error: "Code requis." };
  if (trimmed.length < 6 || trimmed.length > 50) {
    return { ok: false, error: "Code invalide." };
  }

  // Rate limit par IP
  const h = await headers();
  const ip = getClientIp(h);
  const rl = checkRateLimit(
    GIFT_CARD_VALIDATE.bucket,
    ip,
    GIFT_CARD_VALIDATE.max,
    GIFT_CARD_VALIDATE.windowMs,
  );
  if (!rl.allowed) {
    return {
      ok: false,
      error: "Trop de tentatives. Réessayez dans un instant.",
    };
  }
  recordRateLimit(GIFT_CARD_VALIDATE.bucket, ip, GIFT_CARD_VALIDATE.windowMs);

  const card = await prisma.giftCard.findUnique({
    where: { code: trimmed },
    select: {
      id: true,
      prefix: true,
      status: true,
      remainingAmountCents: true,
      expiresAt: true,
    },
  });

  if (!card) {
    return { ok: false, error: "Code introuvable." };
  }
  if (card.status !== "ACTIVE" && card.status !== "PARTIALLY_USED") {
    return {
      ok: false,
      error: friendlyStatusError(card.status),
    };
  }
  if (card.expiresAt < new Date()) {
    return { ok: false, error: "Cette carte cadeau a expiré." };
  }
  if (card.remainingAmountCents <= 0) {
    return { ok: false, error: "Cette carte cadeau est épuisée." };
  }

  return {
    ok: true,
    data: {
      prefix: card.prefix,
      remainingAmountCents: card.remainingAmountCents,
      expiresAt: card.expiresAt.toISOString(),
    },
  };
}

function friendlyStatusError(status: string): string {
  switch (status) {
    case "PENDING_PAYMENT":
      return "Cette carte cadeau n'est pas encore activée.";
    case "FULLY_USED":
      return "Cette carte cadeau est épuisée.";
    case "EXPIRED":
      return "Cette carte cadeau a expiré.";
    case "REFUNDED":
    case "CANCELLED":
      return "Cette carte cadeau n'est plus utilisable.";
    default:
      return "Cette carte cadeau n'est pas disponible.";
  }
}
