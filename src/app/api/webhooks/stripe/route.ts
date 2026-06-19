/**
 * POST /api/webhooks/stripe
 *
 * Réception des events Stripe Checkout pour transitionner les bookings
 * de AWAITING_DEPOSIT à CONFIRMED après paiement.
 *
 * Events gérés Phase 1 :
 *  - checkout.session.completed : booking → CONFIRMED
 *  - payment_intent.payment_failed : log (booking reste AWAITING_DEPOSIT
 *    jusqu'au cron d'expiry)
 *  - charge.updated : récupère stripeFeeCents réels (balance_transaction.fee)
 *
 * Events Phase 2 (refund flow) :
 *  - charge.refunded
 *  - refund.updated
 *
 * Idempotence : la table StripeEvent stocke les event.id déjà traités.
 * Stripe peut réenvoyer un event en cas de timeout ; on ne le retraite pas.
 *
 * IMPORTANT : ce handler lit le RAW body (pas du JSON parsé) pour
 * vérifier la signature Stripe. En App Router, on utilise `request.text()`.
 */

import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { applyGiftCardRedemption } from "@/lib/gift-card-redeem";
import { sendEmail } from "@/lib/email/send";
import { ADMIN_EMAIL } from "@/lib/email/client";
import { buildBookingConfirmationEmail } from "@/lib/email/templates/booking-confirmation";
import { buildBookingNotifAdminEmail } from "@/lib/email/templates/booking-notif-admin";
import { buildGiftCardAdminIssuedEmail } from "@/lib/email/templates/gift-card-admin-issued";
import { buildGiftCardPurchaseReceiptEmail } from "@/lib/email/templates/gift-card-purchase-receipt";
import { buildGiftCardNotifAdminEmail } from "@/lib/email/templates/gift-card-notif-admin";
import { buildEbookPurchasedEmail } from "@/lib/email/templates/ebook-purchased";
import { buildEbookNotifAdminEmail } from "@/lib/email/templates/ebook-notif-admin";
import {
  createInvoiceForEbookPurchase,
  createInvoiceForGiftCard,
} from "@/lib/invoice/create-invoice";
import { readInvoicePdf } from "@/lib/invoice/invoice-files";
import { markInvoiceSent } from "@/lib/invoice/invoice-email";

export const runtime = "nodejs"; // Stripe SDK n'est pas edge-compatible
export const dynamic = "force-dynamic";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: Request) {
  if (!stripe) {
    return jsonError("Stripe non configuré", "STRIPE_NOT_CONFIGURED", 503);
  }
  if (!WEBHOOK_SECRET) {
    console.error(
      "[stripe webhook] STRIPE_WEBHOOK_SECRET manquant dans .env.local",
    );
    return jsonError(
      "Webhook secret manquant",
      "WEBHOOK_SECRET_MISSING",
      503,
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return jsonError(
      "Signature Stripe manquante",
      "MISSING_SIGNATURE",
      400,
    );
  }

  // Raw body pour vérification signature
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[stripe webhook] signature invalide:", msg);
    return jsonError("Signature invalide", "INVALID_SIGNATURE", 400);
  }

  // Idempotence : si déjà traité, on ack 200 sans re-process
  const existing = await prisma.stripeEvent.findUnique({
    where: { id: event.id },
    select: { id: true },
  });
  if (existing) {
    console.log(`[stripe webhook] event ${event.id} (${event.type}) déjà traité`);
    return NextResponse.json({ received: true, idempotent: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "charge.updated":
        await handleChargeUpdated(event.data.object);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentFailed(event.data.object);
        break;
      // Phase 2 : charge.refunded, refund.updated
      default:
        console.log(`[stripe webhook] event ignoré : ${event.type}`);
    }

    // Marque l'event comme traité (idempotence)
    await prisma.stripeEvent.create({
      data: { id: event.id, type: event.type },
    });

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(
      `[stripe webhook] erreur traitement ${event.type}:`,
      err,
    );
    // On retourne 500 pour que Stripe retry. NE PAS marquer l'event
    // comme traité si on n'a pas pu finir.
    return jsonError("Erreur interne", "INTERNAL_ERROR", 500);
  }
}

// ─────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const type = session.metadata?.type;

  if (type === "booking") {
    await confirmBookingFromSession(session);
    return;
  }

  if (type === "gift_card") {
    await activateGiftCardFromSession(session);
    return;
  }

  if (type === "ebook") {
    await confirmEbookPurchaseFromSession(session);
    return;
  }

  console.log(
    `[stripe webhook] checkout.session.completed type=${type} non implémenté`,
  );
}

async function confirmEbookPurchaseFromSession(
  session: Stripe.Checkout.Session,
): Promise<void> {
  console.log(
    `[stripe webhook] confirmEbookPurchaseFromSession session=${session.id}`,
  );
  const purchaseId = session.metadata?.ebookPurchaseId;
  if (!purchaseId) {
    console.warn("[stripe webhook] ebook session sans ebookPurchaseId");
    return;
  }

  const purchase = await prisma.ebookPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      paymentStatus: true,
      clientEmail: true,
      clientName: true,
      downloadToken: true,
      tokenExpiresAt: true,
      amount: true,
      ebook: {
        select: { id: true, title: true, shortDesc: true, slug: true },
      },
    },
  });
  if (!purchase) {
    console.warn(`[stripe webhook] ebook purchase ${purchaseId} introuvable`);
    return;
  }

  // Idempotence
  if (purchase.paymentStatus === "PAID") {
    console.log(
      `[stripe webhook] ebook purchase ${purchase.id} déjà PAID, skip`,
    );
    return;
  }
  console.log(
    `[stripe webhook] ebook purchase ${purchase.id} status=${purchase.paymentStatus}, processing…`,
  );

  // Carte cadeau éventuelle (passée en metadata)
  const giftCardId = session.metadata?.giftCardId || null;
  const giftCardAmountRaw = session.metadata?.giftCardAmountCents ?? "0";
  const giftCardAmountCents = parseInt(giftCardAmountRaw, 10) || 0;

  const now = new Date();
  const amountPaidCents = session.amount_total ?? 0;

  await prisma.ebookPurchase.update({
    where: { id: purchase.id },
    data: {
      paymentStatus: "PAID",
      paidAt: now,
      stripePaymentId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null),
    },
  });

  // Application carte cadeau (idempotent)
  if (giftCardId && giftCardAmountCents > 0) {
    try {
      await applyGiftCardRedemption({
        giftCardId,
        amountCents: giftCardAmountCents,
        ebookPurchaseId: purchase.id,
        redeemedByEmail: purchase.clientEmail,
        type: "EBOOK",
      });
    } catch (err) {
      console.error(
        `[stripe webhook] redemption gift card ebook échouée pour ${purchase.id}:`,
        err,
      );
    }
  }

  // Notif admin
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
          title: `Ebook vendu : ${purchase.ebook.title}`,
          body: `Cliente : ${purchase.clientEmail}`,
          link: `/admin/ebooks/ventes/${purchase.id}`,
          metadata: { purchaseId: purchase.id } as object,
        },
      });
    }
  } catch (err) {
    console.error("[stripe webhook] notif admin ebook échec:", err);
  }

  // Facture (fail-soft : un échec ne bloque jamais la confirmation d'achat)
  let ebookInvoiceAttachment: { filename: string; content: Buffer } | null = null;
  let ebookInvoiceId: string | null = null;
  try {
    const invoice = await createInvoiceForEbookPurchase(purchase.id);
    ebookInvoiceId = invoice.id;
    ebookInvoiceAttachment = {
      filename: `${invoice.number}.pdf`,
      content: await readInvoicePdf(invoice.pdfPath),
    };
  } catch (err) {
    console.error("[stripe webhook] facture ebook échec:", err);
  }

  // Email cliente avec lien PDF
  try {
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clochette-nails.fr";
    const downloadUrl = `${origin}/ebooks/telechargement/${purchase.downloadToken}`;
    const firstName = (purchase.clientName ?? purchase.clientEmail).split(" ")[0];
    const mail = buildEbookPurchasedEmail({
      clientFirstName: firstName,
      ebookTitle: purchase.ebook.title,
      ebookShortDesc: purchase.ebook.shortDesc,
      amountPaidCents,
      giftCardAmountCents: giftCardAmountCents || undefined,
      downloadUrl,
      tokenExpiresAt: purchase.tokenExpiresAt,
    });
    const result = await sendEmail({
      to: purchase.clientEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tag: "ebook.purchased",
      ...(ebookInvoiceAttachment ? { attachments: [ebookInvoiceAttachment] } : {}),
    });
    if (!result.ok) {
      console.error(
        `[stripe webhook] email ebook échec pour ${purchase.id} (${purchase.clientEmail}): ${result.error}`,
      );
    } else {
      console.log(
        `[stripe webhook] email ebook envoyé à ${purchase.clientEmail} (id=${result.id})`,
      );
      if (ebookInvoiceId && ebookInvoiceAttachment) {
        await markInvoiceSent(ebookInvoiceId, purchase.clientEmail);
      }
    }
  } catch (err) {
    console.error(`[stripe webhook] email ebook exception pour ${purchase.id}:`, err);
  }

  // Email admin (Chloé) — notif de vente, comme pour les RDV et les cartes cadeau
  try {
    const adminMail = buildEbookNotifAdminEmail({
      purchaseId: purchase.id,
      ebookTitle: purchase.ebook.title,
      amountCents: purchase.amount,
      buyerName: purchase.clientName,
      buyerEmail: purchase.clientEmail,
      giftCardAmountCents: giftCardAmountCents || undefined,
      stripePaidCents: amountPaidCents,
      purchasedAt: now,
    });
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: adminMail.subject,
      html: adminMail.html,
      text: adminMail.text,
      replyTo: purchase.clientEmail,
      tag: "ebook.notif-admin",
    });
  } catch (err) {
    console.error("[stripe webhook] email admin ebook échec:", err);
  }
}

async function activateGiftCardFromSession(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const giftCardId = session.metadata?.giftCardId;
  if (!giftCardId) {
    console.warn("[stripe webhook] gift_card session sans giftCardId");
    return;
  }

  const card = await prisma.giftCard.findUnique({
    where: { id: giftCardId },
    select: {
      id: true,
      status: true,
      code: true,
      prefix: true,
      initialAmountCents: true,
      buyerEmail: true,
      buyerName: true,
      recipientEmail: true,
      recipientName: true,
      giftMessage: true,
      expiresAt: true,
    },
  });
  if (!card) {
    console.warn(
      `[stripe webhook] gift_card ${giftCardId} introuvable`,
    );
    return;
  }

  // Idempotent : si déjà ACTIVE on ne refait rien
  if (card.status === "ACTIVE" || card.status === "PARTIALLY_USED") {
    console.log(
      `[stripe webhook] gift_card ${giftCardId} déjà activée, no-op`,
    );
    return;
  }

  // Activation
  await prisma.giftCard.update({
    where: { id: card.id },
    data: {
      status: "ACTIVE",
      paymentStatus: "PAID",
      paidAt: new Date(),
      deliveredAt: new Date(),
      stripePaymentId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null),
    },
  });

  // Notification in-app pour Chloé
  try {
    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    if (admin) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: "GIFT_CARD_PURCHASED",
          title: `Carte cadeau vendue : ${(card.initialAmountCents / 100).toFixed(2)} €`,
          body: `Achetée par ${card.buyerName} pour ${card.recipientName ?? "elle-même"}.`,
          link: `/admin/cartes-cadeau/${card.id}`,
          metadata: { giftCardId: card.id } as object,
        },
      });
    }
  } catch (err) {
    console.error("[stripe webhook] notif admin gift card échec:", err);
  }

  // Email bénéficiaire : carte cadeau + code (toujours)
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clochette-nails.fr";
  try {
    const email = buildGiftCardAdminIssuedEmail({
      recipientFirstName: (card.recipientName ?? card.buyerName).split(" ")[0],
      code: card.code,
      initialAmountCents: card.initialAmountCents,
      expiresAt: card.expiresAt,
      message: card.giftMessage,
      reservationUrl: `${siteUrl}/reservation`,
    });
    await sendEmail({
      to: card.recipientEmail ?? card.buyerEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
      tag: "gift-card.public-issued",
    });
  } catch (err) {
    console.error("[stripe webhook] email bénéficiaire gift card échec:", err);
  }

  // Facture (fail-soft : un échec ne bloque jamais l'activation ni les emails)
  let gcInvoiceAttachment: { filename: string; content: Buffer } | null = null;
  let gcInvoiceId: string | null = null;
  try {
    const invoice = await createInvoiceForGiftCard(card.id);
    gcInvoiceId = invoice.id;
    gcInvoiceAttachment = {
      filename: `${invoice.number}.pdf`,
      content: await readInvoicePdf(invoice.pdfPath),
    };
  } catch (err) {
    console.error("[stripe webhook] facture gift card échec:", err);
  }

  // Reçu acheteuse (si différent du bénéficiaire OU même email = même envoi mais 2 mails)
  try {
    const receipt = buildGiftCardPurchaseReceiptEmail({
      buyerFirstName: card.buyerName.split(" ")[0],
      prefix: card.prefix,
      amountCents: card.initialAmountCents,
      paymentMethod: "stripe",
      recipientName:
        card.buyerEmail !== card.recipientEmail ? card.recipientName : null,
      purchasedAt: new Date(),
      expiresAt: card.expiresAt,
      stripePaymentId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : null,
    });
    const receiptResult = await sendEmail({
      to: card.buyerEmail,
      subject: receipt.subject,
      html: receipt.html,
      text: receipt.text,
      tag: "gift-card.public-receipt",
      ...(gcInvoiceAttachment ? { attachments: [gcInvoiceAttachment] } : {}),
    });
    if (receiptResult.ok && gcInvoiceId && gcInvoiceAttachment) {
      await markInvoiceSent(gcInvoiceId, card.buyerEmail);
    }
  } catch (err) {
    console.error("[stripe webhook] reçu acheteuse gift card échec:", err);
  }

  // Email admin (Chloé) — notif de vente, comme pour les RDV (la notif in-app
  // ne suffit pas si Chloé ne se connecte pas).
  try {
    const adminMail = buildGiftCardNotifAdminEmail({
      giftCardId: card.id,
      prefix: card.prefix,
      amountCents: card.initialAmountCents,
      buyerName: card.buyerName,
      buyerEmail: card.buyerEmail,
      recipientName: card.recipientName,
      recipientEmail: card.recipientEmail,
      giftMessage: card.giftMessage,
      purchasedAt: new Date(),
      expiresAt: card.expiresAt,
    });
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: adminMail.subject,
      html: adminMail.html,
      text: adminMail.text,
      replyTo: card.buyerEmail,
      tag: "gift-card.notif-admin",
    });
  } catch (err) {
    console.error("[stripe webhook] email admin gift card échec:", err);
  }
}

async function confirmBookingFromSession(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const bookingId = session.metadata?.bookingId;
  if (!bookingId) {
    console.warn("[stripe webhook] session sans bookingId metadata");
    return;
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      clientEmail: true,
      clientFirstName: true,
      clientLastName: true,
      clientPhone: true,
      clientMessage: true,
      date: true,
      startTime: true,
      endTime: true,
      totalDurationMinutes: true,
      depositCents: true,
      pendingGiftCardId: true,
      pendingGiftCardAmountCents: true,
      service: { select: { title: true } },
      options: {
        select: { serviceOption: { select: { title: true } } },
      },
      files: { select: { url: true } },
    },
  });
  if (!booking) {
    console.warn(`[stripe webhook] booking ${bookingId} introuvable`);
    return;
  }
  if (booking.status === "CONFIRMED") {
    // Déjà confirmé (webhook rejoué) — idempotent.
    return;
  }
  if (booking.status !== "AWAITING_DEPOSIT") {
    // Paiement reçu sur un RDV qui n'est plus en attente (ex : EXPIRED par le
    // cron après 72h, ou annulé) → le créneau a pu être libéré/repris. On NE
    // confirme PAS, et on alerte l'admin pour vérification / remboursement.
    console.error(
      `[stripe webhook] paiement reçu sur booking ${booking.id} en statut ${booking.status} (≠ AWAITING_DEPOSIT) — non confirmé, à vérifier/rembourser.`,
    );
    try {
      const adminUser = await prisma.user.findFirst({
        where: { role: "ADMIN", isActive: true },
        select: { id: true },
      });
      if (adminUser) {
        await prisma.notification.create({
          data: {
            userId: adminUser.id,
            type: "BOOKING_CANCELLED",
            title: "⚠️ Paiement reçu sur un RDV expiré/annulé",
            body: `${booking.clientFirstName} — RDV ${booking.date.toISOString().slice(0, 10)} ${booking.startTime} (statut ${booking.status}). À vérifier / rembourser.`,
            link: `/admin/bookings/${booking.id}`,
            metadata: {
              bookingId: booking.id,
              status: booking.status,
              anomaly: "paid_after_expiry",
            } as object,
          },
        });
      }
    } catch (err) {
      console.error("[stripe webhook] notif anomalie paiement tardif échouée:", err);
    }
    return;
  }

  const now = new Date();
  // Token cliente pour annulation/déplacement via lien mail (single-use).
  const clientActionToken = randomBytes(32).toString("hex");

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: "CONFIRMED",
      paidAt: now,
      confirmedAt: now,
      stripePaymentId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null),
      clientActionToken,
      paymentMethod: "stripe",
      // On efface paymentExpiresAt : ce booking est confirmé, le cron ne doit
      // plus le matcher même si on est passé après la deadline.
      paymentExpiresAt: null,
    },
  });

  // Si une carte cadeau était associée, on l'applique MAINTENANT
  // (idempotent côté helper : pas de double-redeem si webhook retry)
  if (
    booking.pendingGiftCardId &&
    booking.pendingGiftCardAmountCents &&
    booking.pendingGiftCardAmountCents > 0
  ) {
    try {
      await applyGiftCardRedemption({
        giftCardId: booking.pendingGiftCardId,
        amountCents: booking.pendingGiftCardAmountCents,
        bookingId: booking.id,
        redeemedByEmail: booking.clientEmail,
      });
    } catch (err) {
      console.error(
        `[stripe webhook] redemption gift card échouée pour booking ${booking.id}:`,
        err,
      );
      // On ne re-throw pas : le booking est déjà confirmé (paiement reçu),
      // l'incohérence sera détectée par l'admin via les logs.
    }
  }

  // Outbound event
  const paidVia = booking.pendingGiftCardId ? "stripe_with_gift_card" : "stripe";
  await emitOutboundEvent("booking.confirmed", {
    bookingId: booking.id,
    paidVia,
    stripeSessionId: session.id,
    amountTotalCents: session.amount_total,
    giftCardAmountUsed: booking.pendingGiftCardAmountCents ?? 0,
  });

  // Notification admin in-app (cloche)
  await notifyAdmin(
    booking.id,
    booking.service.title,
    session.customer_details?.email ?? null,
  );

  // Email cliente — confirmation RDV
  try {
    const clientMail = buildBookingConfirmationEmail({
      clientFirstName: booking.clientFirstName,
      clientEmail: booking.clientEmail,
      serviceTitle: booking.service.title,
      optionsTitles: booking.options.map((o) => o.serviceOption.title),
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      totalDurationMinutes: booking.totalDurationMinutes,
      depositCents: booking.depositCents,
      giftCardAmountCents: booking.pendingGiftCardAmountCents ?? 0,
      clientActionToken,
    });
    await sendEmail({
      to: booking.clientEmail,
      subject: clientMail.subject,
      html: clientMail.html,
      text: clientMail.text,
      tag: "booking.confirmation",
    });
  } catch (err) {
    console.error(`[stripe webhook] email cliente échoué pour ${booking.id}:`, err);
  }

  // Email admin — notification nouveau RDV
  try {
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clochette-nails.fr";
    const adminMail = buildBookingNotifAdminEmail({
      bookingId: booking.id,
      serviceTitle: booking.service.title,
      clientFirstName: booking.clientFirstName,
      clientLastName: booking.clientLastName,
      clientEmail: booking.clientEmail,
      clientPhone: booking.clientPhone,
      clientMessage: booking.clientMessage,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      depositCents: booking.depositCents,
      giftCardAmountCents: booking.pendingGiftCardAmountCents ?? 0,
      paidVia,
      photoUrls: booking.files.map((f) => `${siteUrl}${f.url}`),
    });
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: adminMail.subject,
      html: adminMail.html,
      text: adminMail.text,
      replyTo: booking.clientEmail,
      tag: "booking.notif-admin",
    });
  } catch (err) {
    console.error(`[stripe webhook] email admin échoué pour ${booking.id}:`, err);
  }
}

async function handleChargeUpdated(
  charge: Stripe.Charge,
): Promise<void> {
  // Récupère stripeFeeCents depuis balance_transaction
  if (!charge.payment_intent) return;
  if (!charge.balance_transaction) return;

  const balanceTxId =
    typeof charge.balance_transaction === "string"
      ? charge.balance_transaction
      : charge.balance_transaction.id;

  // On a besoin du SDK pour expand la balance_transaction
  if (!stripe) return;
  const balanceTx = await stripe.balanceTransactions.retrieve(balanceTxId);

  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent.id;

  // Met à jour la ressource correspondante au PaymentIntent. Un seul
  // des 3 sera matché (les 3 tables ont stripePaymentId distinct).
  await Promise.all([
    prisma.booking.updateMany({
      where: { stripePaymentId: paymentIntentId },
      data: { stripeFeeCents: balanceTx.fee },
    }),
    prisma.giftCard.updateMany({
      where: { stripePaymentId: paymentIntentId },
      data: { stripeFeeCents: balanceTx.fee },
    }),
    prisma.ebookPurchase.updateMany({
      where: { stripePaymentId: paymentIntentId },
      data: { stripeFeeCents: balanceTx.fee },
    }),
  ]);
}

async function handlePaymentFailed(
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> {
  // On log seulement — la booking reste AWAITING_DEPOSIT et sera
  // expirée par le cron après 30 min.
  console.log(
    `[stripe webhook] payment_intent.payment_failed : ${paymentIntent.id}`,
  );
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

async function emitOutboundEvent(
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const targetUrl = process.env.MANAGEMENT_API_URL;
  if (!targetUrl) {
    console.log(`[outbound] ${type}`, payload);
    return;
  }
  await prisma.outboundEvent.create({
    data: {
      type,
      payload: payload as object,
      targetUrl,
      targetService: "management",
    },
  });
}

async function notifyAdmin(
  bookingId: string,
  serviceTitle: string,
  clientEmail: string | null,
): Promise<void> {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  if (!admin) return;

  await prisma.notification.create({
    data: {
      userId: admin.id,
      type: "DEPOSIT_PAID",
      title: `Acompte reçu : ${serviceTitle}`,
      body: clientEmail ? `Client : ${clientEmail}` : null,
      link: `/admin/bookings/${bookingId}`,
    },
  });
}

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}
