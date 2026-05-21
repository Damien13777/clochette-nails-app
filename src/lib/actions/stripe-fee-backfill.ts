"use server";

/**
 * Server action — rattrapage manuel des frais Stripe pour une transaction
 * dont le webhook `charge.updated` a été manqué (typiquement test local
 * sans `stripe listen` actif au moment du paiement).
 *
 * Va chercher `balance_transaction.fee` via l'API Stripe et écrit le
 * résultat dans `stripeFeeCents` du modèle correspondant.
 *
 * Supporte 3 types : booking, gift_card, ebook.
 */

import type Stripe from "stripe";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

type ActionResult =
  | { ok: true; feeCents: number }
  | { ok: false; error: string };

export type StripeFeeResource = "booking" | "gift_card" | "ebook";

export async function recalculateStripeFee(
  resource: StripeFeeResource,
  id: string,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return { ok: false, error: "Non autorisé" };
  }
  if (!stripe) {
    return { ok: false, error: "Stripe non configuré." };
  }

  // 1) Lecture du stripePaymentId selon le type
  let stripePaymentId: string | null = null;
  if (resource === "booking") {
    const r = await prisma.booking.findUnique({
      where: { id },
      select: { stripePaymentId: true },
    });
    if (!r) return { ok: false, error: "RDV introuvable." };
    stripePaymentId = r.stripePaymentId;
  } else if (resource === "gift_card") {
    const r = await prisma.giftCard.findUnique({
      where: { id },
      select: { stripePaymentId: true },
    });
    if (!r) return { ok: false, error: "Carte cadeau introuvable." };
    stripePaymentId = r.stripePaymentId;
  } else {
    const r = await prisma.ebookPurchase.findUnique({
      where: { id },
      select: { stripePaymentId: true },
    });
    if (!r) return { ok: false, error: "Achat ebook introuvable." };
    stripePaymentId = r.stripePaymentId;
  }

  if (!stripePaymentId) {
    return {
      ok: false,
      error: "Pas de PaymentIntent Stripe rattaché à cette transaction.",
    };
  }

  // 2) Récupération de la balance_transaction via Stripe
  let fee: number;
  try {
    const pi = (await stripe.paymentIntents.retrieve(stripePaymentId, {
      expand: ["latest_charge.balance_transaction"],
    })) as Stripe.PaymentIntent;
    const charge = pi.latest_charge;
    if (!charge || typeof charge === "string") {
      return {
        ok: false,
        error: "Aucune charge associée à ce paiement Stripe.",
      };
    }
    const bt = charge.balance_transaction;
    if (!bt || typeof bt === "string") {
      return {
        ok: false,
        error:
          "Balance transaction Stripe pas encore disponible. Réessaye dans quelques secondes.",
      };
    }
    fee = bt.fee;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur Stripe inconnue";
    return { ok: false, error: `Échec API Stripe : ${msg}` };
  }

  // 3) Update DB
  if (resource === "booking") {
    await prisma.booking.update({
      where: { id },
      data: { stripeFeeCents: fee },
    });
    revalidatePath(`/admin/bookings/${id}`);
  } else if (resource === "gift_card") {
    await prisma.giftCard.update({
      where: { id },
      data: { stripeFeeCents: fee },
    });
    revalidatePath(`/admin/cartes-cadeau/${id}`);
  } else {
    await prisma.ebookPurchase.update({
      where: { id },
      data: { stripeFeeCents: fee },
    });
    revalidatePath(`/admin/ebooks/ventes/${id}`);
  }

  revalidatePath("/admin/finances");
  return { ok: true, feeCents: fee };
}
