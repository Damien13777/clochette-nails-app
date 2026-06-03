"use server";

/**
 * Server Action — achat public d'une carte cadeau via Stripe Checkout.
 *
 * Flow :
 *  1. Validation input (montant, acheteur, bénéficiaire, message)
 *  2. Génération du code + bcrypt hash
 *  3. Création GiftCard PENDING_PAYMENT en DB
 *  4. Création session Stripe Checkout (expire dans 30 min)
 *  5. Retour URL pour redirect côté Client
 *
 * Activation effective via webhook checkout.session.completed
 * (cf. /api/webhooks/stripe).
 *
 * Anti-abuse :
 *  - Rate limit 5 achats / IP / heure
 *  - Honeypot field (champ caché, doit rester vide)
 *  - reCAPTCHA V3 à brancher pré-déploiement
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import {
  generateGiftCardCode,
  giftCardPrefix,
  hashGiftCardCode,
} from "@/lib/gift-card-code";
import {
  CONTACT,
  checkRateLimit,
  recordRateLimit,
} from "@/lib/rate-limit";
import { verifyRecaptcha } from "@/lib/recaptcha";

const purchaseSchema = z.object({
  amountCents: z
    .number()
    .int()
    .min(1000, "Montant minimum 10 €")
    .max(100_000, "Montant maximum 1000 €"),
  buyerName: z.string().trim().min(2, "Nom requis").max(100),
  buyerEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("Email invalide")
    .max(150),
  forSelf: z.boolean(),
  recipientName: z.string().trim().max(100).optional().default(""),
  recipientEmail: z.string().trim().toLowerCase().max(150).optional().default(""),
  giftMessage: z.string().trim().max(500).optional().default(""),
  honeypot: z.string().max(0).optional(),
  recaptchaToken: z.string().optional(), // reCAPTCHA v3 (vérifié côté serveur)
});

export type PurchaseInput = z.input<typeof purchaseSchema>;
export type PurchaseResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string> };

export async function createGiftCardPublic(
  input: PurchaseInput,
): Promise<PurchaseResult> {
  // ── Feature flag ────────────────────────────────────────
  const settings = await prisma.platformSettings.findFirst({
    select: { giftCardsEnabled: true, giftCardExpiryDays: true },
  });
  if (!settings?.giftCardsEnabled) {
    return {
      ok: false,
      error: "Les cartes cadeau ne sont pas disponibles pour le moment.",
      code: "DISABLED",
    };
  }
  if (!stripe) {
    return {
      ok: false,
      error: "Service de paiement temporairement indisponible.",
      code: "STRIPE_UNAVAILABLE",
    };
  }

  // ── Rate limit IP ───────────────────────────────────────
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown";
  const rl = checkRateLimit(CONTACT.bucket, ip, 5, 60 * 60 * 1000);
  if (!rl.allowed) {
    return {
      ok: false,
      error: "Trop de tentatives. Réessayez dans une heure.",
      code: "RATE_LIMITED",
    };
  }

  // ── Validation Zod ──────────────────────────────────────
  const parsed = purchaseSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key])
        fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      error: "Vérifiez les champs marqués.",
      code: "VALIDATION_ERROR",
      fieldErrors,
    };
  }
  const data = parsed.data;

  // Honeypot : rejet silencieux (fake success après délai aléatoire)
  if (data.honeypot && data.honeypot.length > 0) {
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
    return {
      ok: false,
      error: "Erreur technique, contactez le salon.",
      code: "HONEYPOT",
    };
  }

  // reCAPTCHA v3 (skip si pas de clé serveur → dev ; fail-open si Google down)
  const captcha = await verifyRecaptcha(data.recaptchaToken, "gift_card", ip);
  if (!captcha.ok) {
    return {
      ok: false,
      error: "La vérification de sécurité a échoué. Merci de réessayer.",
      code: "RECAPTCHA_FAILED",
    };
  }

  // ── Si "pour moi", on copie buyer → recipient ──────────
  let recipientName = data.recipientName.trim();
  let recipientEmail = data.recipientEmail.trim();
  if (data.forSelf) {
    recipientName = data.buyerName;
    recipientEmail = data.buyerEmail;
  } else {
    // Validation bénéficiaire si "pour offrir"
    const errs: Record<string, string> = {};
    if (recipientName.length < 2)
      errs.recipientName = "Nom du bénéficiaire requis";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail))
      errs.recipientEmail = "Email bénéficiaire invalide";
    if (Object.keys(errs).length > 0) {
      return {
        ok: false,
        error: "Vérifiez les champs marqués.",
        code: "VALIDATION_ERROR",
        fieldErrors: errs,
      };
    }
  }

  recordRateLimit(CONTACT.bucket, ip, 60 * 60 * 1000);

  // ── Génération code unique (retry 5×) ──────────────────
  let code: string | null = null;
  for (let i = 0; i < 5; i++) {
    const candidate = generateGiftCardCode();
    const exists = await prisma.giftCard.findUnique({
      where: { code: candidate },
      select: { id: true },
    });
    if (!exists) {
      code = candidate;
      break;
    }
  }
  if (!code) {
    return {
      ok: false,
      error: "Impossible de générer un code unique. Réessayez.",
      code: "CODE_GEN_FAILED",
    };
  }

  const codeHash = await hashGiftCardCode(code);
  const expiresAt = new Date();
  expiresAt.setDate(
    expiresAt.getDate() + (settings.giftCardExpiryDays ?? 180),
  );

  // ── Création carte PENDING_PAYMENT ──────────────────────
  const created = await prisma.giftCard.create({
    data: {
      code,
      codeHash,
      prefix: giftCardPrefix(code),
      status: "PENDING_PAYMENT",
      initialAmountCents: data.amountCents,
      remainingAmountCents: data.amountCents,
      buyerEmail: data.buyerEmail,
      buyerName: data.buyerName,
      recipientEmail,
      recipientName,
      giftMessage: data.giftMessage.trim() || null,
      deliveryMode: "EMAIL_TO_RECIPIENT",
      expiresAt,
      amount: data.amountCents,
      paymentStatus: "PENDING",
      creationMode: "PUBLIC",
    },
    select: { id: true },
  });

  // ── Stripe Checkout ─────────────────────────────────────
  const origin =
    h.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: data.amountCents,
          product_data: {
            name: `Carte cadeau Clochette Nails — ${(data.amountCents / 100).toFixed(2)} €`,
            description: data.forSelf
              ? "Carte cadeau (pour vous-même)"
              : `Carte cadeau offerte à ${recipientName}`,
          },
        },
      },
    ],
    expires_at: Math.floor((Date.now() + 30 * 60 * 1000) / 1000),
    success_url: `${origin}/cartes-cadeau/succes?token={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/cartes-cadeau/echec?token={CHECKOUT_SESSION_ID}`,
    customer_email: data.buyerEmail,
    metadata: {
      type: "gift_card",
      giftCardId: created.id,
    },
  });

  // Persiste session id pour idempotence webhook
  await prisma.giftCard.update({
    where: { id: created.id },
    data: { stripeSessionId: session.id },
  });

  return { ok: true, checkoutUrl: session.url! };
}
