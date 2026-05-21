"use server";

/**
 * Server Action — achat public d'un ebook.
 *
 * Flow :
 *  1. Validation feature flag + ebook (PUBLISHED + pdfUrl + price > 0)
 *  2. Validation input (email, name, optional gift card code)
 *  3. Calcul couverture carte cadeau :
 *     - card covers all → mark PAID immédiatement, applique redemption,
 *       envoie email PDF, retourne successUrl
 *     - card covers partial OU no card → crée Stripe Checkout pour le reste,
 *       retourne checkoutUrl. Le webhook applique la redemption.
 *  4. EbookPurchase créé en PENDING (puis PAID si Stripe success).
 *
 * Anti-abuse :
 *  - Rate limit 5 achats / IP / heure
 *  - Honeypot
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import {
  CONTACT,
  checkRateLimit,
  recordRateLimit,
} from "@/lib/rate-limit";
import {
  applyGiftCardRedemption,
  GiftCardRedemptionError,
} from "@/lib/gift-card-redeem";
import {
  computeTokenExpiry,
  generateDownloadToken,
} from "@/lib/ebook-download-token";
import { sendEmail } from "@/lib/email/send";
import { buildEbookPurchasedEmail } from "@/lib/email/templates/ebook-purchased";

const purchaseSchema = z.object({
  ebookSlug: z.string().trim().min(1).max(120),
  clientEmail: z.string().trim().toLowerCase().email("Email invalide").max(150),
  clientName: z.string().trim().min(2, "Nom requis").max(100),
  giftCardCode: z
    .string()
    .trim()
    .toUpperCase()
    .max(50)
    .optional()
    .default(""),
  honeypot: z.string().max(0).optional(),
});

export type EbookPurchaseInput = z.input<typeof purchaseSchema>;

export type EbookPurchaseResult =
  | { ok: true; checkoutUrl: string }
  | { ok: true; successUrl: string }
  | {
      ok: false;
      error: string;
      code?: string;
      fieldErrors?: Record<string, string>;
    };

export async function purchaseEbookAction(
  input: EbookPurchaseInput,
): Promise<EbookPurchaseResult> {
  // ── Feature flag ────────────────────────────────────────
  const settings = await prisma.platformSettings.findFirst({
    select: { ebooksEnabled: true },
  });
  if (!settings?.ebooksEnabled) {
    return {
      ok: false,
      error: "Les ebooks ne sont pas disponibles pour le moment.",
      code: "DISABLED",
    };
  }

  // ── Rate limit IP ───────────────────────────────────────
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown";
  if (!checkRateLimit(CONTACT.bucket, ip, 5, 60 * 60 * 1000).allowed) {
    return {
      ok: false,
      error: "Trop de tentatives. Réessayez dans une heure.",
      code: "RATE_LIMITED",
    };
  }
  recordRateLimit(CONTACT.bucket, ip, 60 * 60 * 1000);

  // ── Validation Zod ──────────────────────────────────────
  const parsed = purchaseSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString() ?? "_";
      fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Champs invalides.", fieldErrors };
  }
  const data = parsed.data;

  // ── Ebook ────────────────────────────────────────────────
  const ebook = await prisma.ebook.findUnique({
    where: { slug: data.ebookSlug },
    select: {
      id: true,
      slug: true,
      title: true,
      shortDesc: true,
      priceCents: true,
      pdfUrl: true,
      status: true,
      coverImage: true,
    },
  });
  if (
    !ebook ||
    ebook.status !== "PUBLISHED" ||
    !ebook.pdfUrl ||
    ebook.priceCents <= 0
  ) {
    return { ok: false, error: "Cet ebook n'est pas disponible." };
  }

  // ── Carte cadeau (optionnelle) ──────────────────────────
  let giftCardInfo: {
    id: string;
    appliedCents: number;
  } | null = null;

  if (data.giftCardCode.length > 0) {
    const card = await prisma.giftCard.findUnique({
      where: { code: data.giftCardCode },
      select: {
        id: true,
        status: true,
        remainingAmountCents: true,
        expiresAt: true,
      },
    });
    if (!card) {
      return {
        ok: false,
        error: "Code carte cadeau introuvable.",
        fieldErrors: { giftCardCode: "Code introuvable." },
      };
    }
    if (card.status !== "ACTIVE" && card.status !== "PARTIALLY_USED") {
      return {
        ok: false,
        error: "Cette carte cadeau n'est pas utilisable.",
        fieldErrors: { giftCardCode: "Carte cadeau non utilisable." },
      };
    }
    if (card.expiresAt < new Date()) {
      return {
        ok: false,
        error: "Cette carte cadeau a expiré.",
        fieldErrors: { giftCardCode: "Carte cadeau expirée." },
      };
    }
    if (card.remainingAmountCents <= 0) {
      return {
        ok: false,
        error: "Cette carte cadeau est épuisée.",
        fieldErrors: { giftCardCode: "Solde nul." },
      };
    }

    giftCardInfo = {
      id: card.id,
      appliedCents: Math.min(card.remainingAmountCents, ebook.priceCents),
    };
  }

  const remainingCents =
    ebook.priceCents - (giftCardInfo?.appliedCents ?? 0);

  // ── Création EbookPurchase (PENDING) ────────────────────
  const downloadToken = generateDownloadToken();
  const tokenExpiresAt = computeTokenExpiry();

  const purchase = await prisma.ebookPurchase.create({
    data: {
      ebookId: ebook.id,
      clientEmail: data.clientEmail,
      clientName: data.clientName,
      paymentStatus: "PENDING",
      amount: ebook.priceCents,
      downloadToken,
      tokenExpiresAt,
    },
    select: { id: true },
  });

  const origin =
    h.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";

  // ── Cas 1 : carte cadeau couvre tout ────────────────────
  if (remainingCents === 0 && giftCardInfo) {
    try {
      await applyGiftCardRedemption({
        giftCardId: giftCardInfo.id,
        amountCents: giftCardInfo.appliedCents,
        ebookPurchaseId: purchase.id,
        redeemedByEmail: data.clientEmail,
        type: "EBOOK",
        ipAddress: ip,
      });
    } catch (err) {
      // Rollback : on supprime l'EbookPurchase orpheline
      await prisma.ebookPurchase
        .delete({ where: { id: purchase.id } })
        .catch(() => {});
      const friendly =
        err instanceof GiftCardRedemptionError
          ? "Impossible d'appliquer cette carte cadeau (concurrent update)."
          : "Erreur lors de l'utilisation de la carte cadeau.";
      return {
        ok: false,
        error: friendly,
        fieldErrors: { giftCardCode: friendly },
      };
    }

    // Marque l'achat PAID
    const now = new Date();
    await prisma.ebookPurchase.update({
      where: { id: purchase.id },
      data: { paymentStatus: "PAID", paidAt: now },
    });

    // Envoi email + notification admin (best-effort)
    await deliverEbook({
      purchaseId: purchase.id,
      ebookTitle: ebook.title,
      ebookShortDesc: ebook.shortDesc,
      clientFirstName: firstNameOf(data.clientName),
      clientEmail: data.clientEmail,
      amountPaidCents: 0,
      giftCardAmountCents: giftCardInfo.appliedCents,
      downloadToken,
      tokenExpiresAt,
      origin,
    });

    return {
      ok: true,
      successUrl: `/ebooks/succes?p=${purchase.id}`,
    };
  }

  // ── Cas 2 : Stripe Checkout (avec ou sans carte cadeau partielle) ──
  if (!stripe) {
    await prisma.ebookPurchase
      .delete({ where: { id: purchase.id } })
      .catch(() => {});
    return {
      ok: false,
      error: "Service de paiement temporairement indisponible.",
      code: "STRIPE_UNAVAILABLE",
    };
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: remainingCents,
          product_data: {
            name: `Ebook : ${ebook.title}`,
            description: giftCardInfo
              ? `Reste à payer après carte cadeau (-${(giftCardInfo.appliedCents / 100).toFixed(2)} €)`
              : ebook.shortDesc.slice(0, 200),
          },
        },
      },
    ],
    expires_at: Math.floor((Date.now() + 30 * 60 * 1000) / 1000),
    success_url: `${origin}/ebooks/succes?p=${purchase.id}&s={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/ebooks/${ebook.slug}?annule=1`,
    customer_email: data.clientEmail,
    metadata: {
      type: "ebook",
      ebookPurchaseId: purchase.id,
      giftCardId: giftCardInfo?.id ?? "",
      giftCardAmountCents: giftCardInfo?.appliedCents.toString() ?? "0",
    },
  });

  await prisma.ebookPurchase.update({
    where: { id: purchase.id },
    data: { stripeSessionId: session.id },
  });

  return { ok: true, checkoutUrl: session.url! };
}

// ─── Délivrance ebook (email + notif admin) ─────────────

export async function deliverEbook(input: {
  purchaseId: string;
  ebookTitle: string;
  ebookShortDesc: string;
  clientFirstName: string;
  clientEmail: string;
  amountPaidCents: number;
  giftCardAmountCents: number;
  downloadToken: string;
  tokenExpiresAt: Date;
  origin: string;
}): Promise<void> {
  const downloadUrl = `${input.origin}/ebooks/telechargement/${input.downloadToken}`;

  try {
    const mail = buildEbookPurchasedEmail({
      clientFirstName: input.clientFirstName,
      ebookTitle: input.ebookTitle,
      ebookShortDesc: input.ebookShortDesc,
      amountPaidCents: input.amountPaidCents,
      giftCardAmountCents: input.giftCardAmountCents || undefined,
      downloadUrl,
      tokenExpiresAt: input.tokenExpiresAt,
    });
    const result = await sendEmail({
      to: input.clientEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tag: "ebook.purchased",
    });
    if (!result.ok) {
      console.error(
        `[ebook] email échec pour purchase ${input.purchaseId} (${input.clientEmail}): ${result.error}`,
      );
    } else {
      console.log(
        `[ebook] email envoyé à ${input.clientEmail} (id=${result.id})`,
      );
    }
  } catch (err) {
    console.error(
      `[ebook] email exception pour purchase ${input.purchaseId}:`,
      err,
    );
  }

  // Notif admin in-app
  try {
    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    if (admin) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: "EBOOK_SOLD",
          title: `Ebook vendu : ${input.ebookTitle}`,
          body: `Cliente : ${input.clientEmail}`,
          link: `/admin/ebooks/ventes/${input.purchaseId}`,
          metadata: { purchaseId: input.purchaseId } as object,
        },
      });
    }
  } catch (err) {
    console.error("[ebook] notif admin échec:", err);
  }
}

function firstNameOf(fullName: string): string {
  return fullName.split(" ")[0] ?? fullName;
}
