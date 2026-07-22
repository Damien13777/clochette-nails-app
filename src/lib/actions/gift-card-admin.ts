"use server";

/**
 * Server Actions — gestion admin des cartes cadeau.
 *
 * Actions :
 *  - createGiftCardAdmin : émet une carte ACTIVE sans Stripe (geste commercial),
 *    envoie l'email de réception au bénéficiaire, et renvoie le code en clair
 *    (affiché UNE SEULE FOIS dans l'admin après création).
 *  - cancelGiftCard : passe en CANCELLED si non utilisée.
 *  - extendGiftCardExpiration : modifie expiresAt.
 *  - refundGiftCardStripe : remboursement complet via Stripe + status REFUNDED.
 *    Refuse si redemptions existantes (la cliente a déjà utilisé).
 */

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { sendEmail } from "@/lib/email/send";
import { buildGiftCardAdminIssuedEmail } from "@/lib/email/templates/gift-card-admin-issued";
import { buildGiftCardResentEmail } from "@/lib/email/templates/gift-card-resent";
import { buildGiftCardPurchaseReceiptEmail } from "@/lib/email/templates/gift-card-purchase-receipt";
import { emitOutboundEvent } from "@/lib/outbound-events";
import {
  generateGiftCardCode,
  giftCardPrefix,
  hashGiftCardCode,
} from "@/lib/gift-card-code";
import {
  createCreditNote,
  createInvoiceForGiftCard,
  InvoiceError,
} from "@/lib/invoice/create-invoice";
import { sendInvoiceEmail } from "@/lib/invoice/invoice-email";

type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

type CreateResult =
  | { ok: true; message?: string; id: string; code: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

async function audit(
  adminId: string,
  giftCardId: string,
  action: string,
  metadata?: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: {
      adminId,
      action,
      metadata: { giftCardId, ...(metadata ?? {}) } as object,
    },
  });
}

// ─── Création manuelle ──────────────────────────────────────

/** Modes d'émission admin (PUBLIC est réservé aux ventes via le site). */
type AdminCreationMode = "ADMIN_GIFT" | "ADMIN_SALE";

/** Modes de paiement physique acceptés pour une vente en salon. */
const ADMIN_SALE_PAYMENT_METHODS = [
  "cash",
  "transfer",
  "check",
  "card_terminal",
] as const;
type AdminSalePaymentMethod = (typeof ADMIN_SALE_PAYMENT_METHODS)[number];

export type CreateGiftCardAdminInput = {
  recipientName: string;
  recipientEmail: string;
  amountEuros: number;
  validityMonths: number;
  giftMessage?: string;
  /** "ADMIN_GIFT" (cadeau offert, pas de CA) ou "ADMIN_SALE" (vente en salon, compte au CA). */
  mode: AdminCreationMode;
  /** Requis si mode === "ADMIN_SALE". Ignoré sinon. */
  paymentMethod?: AdminSalePaymentMethod;
  /** Acheteuse (uniquement ADMIN_SALE). Si fourni, un reçu est envoyé. */
  buyerName?: string;
  buyerEmail?: string;
  /** ADMIN_SALE uniquement : envoyer la facture PDF à l'acheteuse (opt-in). */
  sendInvoiceByEmail?: boolean;
};

export async function createGiftCardAdmin(
  input: CreateGiftCardAdminInput,
): Promise<CreateResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const fieldErrors: Record<string, string> = {};

  const recipientName = input.recipientName.trim();
  if (!recipientName || recipientName.length < 2)
    fieldErrors.recipientName = "Nom requis (2 chars min).";
  if (recipientName.length > 100)
    fieldErrors.recipientName = "Nom trop long (100 chars max).";

  const recipientEmail = input.recipientEmail.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail))
    fieldErrors.recipientEmail = "Email invalide.";

  if (
    !Number.isFinite(input.amountEuros) ||
    input.amountEuros < 10 ||
    input.amountEuros > 1000
  )
    fieldErrors.amountEuros = "Montant invalide (10 € - 1000 €).";

  if (
    !Number.isInteger(input.validityMonths) ||
    input.validityMonths < 1 ||
    input.validityMonths > 36
  )
    fieldErrors.validityMonths = "Durée de validité invalide (1-36 mois).";

  const giftMessage = (input.giftMessage ?? "").trim();
  if (giftMessage.length > 500)
    fieldErrors.giftMessage = "Message trop long (500 chars max).";

  if (input.mode !== "ADMIN_GIFT" && input.mode !== "ADMIN_SALE") {
    fieldErrors.mode = "Mode invalide.";
  }

  let salePaymentMethod: AdminSalePaymentMethod | null = null;
  if (input.mode === "ADMIN_SALE") {
    if (
      !input.paymentMethod ||
      !ADMIN_SALE_PAYMENT_METHODS.includes(input.paymentMethod)
    ) {
      fieldErrors.paymentMethod =
        "Mode de paiement requis pour une vente en salon.";
    } else {
      salePaymentMethod = input.paymentMethod;
    }
  }

  // Acheteuse (ADMIN_SALE uniquement, facultative mais validée si fournie)
  let buyerName: string | null = null;
  let buyerEmail: string | null = null;
  if (input.mode === "ADMIN_SALE") {
    const rawBuyerName = (input.buyerName ?? "").trim();
    const rawBuyerEmail = (input.buyerEmail ?? "").trim().toLowerCase();
    if (rawBuyerEmail.length > 0) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawBuyerEmail)) {
        fieldErrors.buyerEmail = "Email acheteuse invalide.";
      } else {
        buyerEmail = rawBuyerEmail;
        // Si email fourni mais nom vide → on retombe sur le nom du bénéficiaire
        buyerName = rawBuyerName.length > 0 ? rawBuyerName : recipientName;
      }
    } else if (rawBuyerName.length > 0) {
      // Nom sans email = inutile pour le reçu, on ignore
      // (pas une erreur bloquante — admin peut vouloir saisir juste le nom pour info)
      buyerName = rawBuyerName;
    }
    if (buyerName && buyerName.length > 100)
      fieldErrors.buyerName = "Nom acheteuse trop long (100 chars max).";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "Champs invalides.", fieldErrors };
  }

  const initialAmountCents = Math.round(input.amountEuros * 100);

  // Génération code unique (retry max 5× en cas de collision improbable)
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
    return { ok: false, error: "Impossible de générer un code unique." };
  }

  const codeHash = await hashGiftCardCode(code);
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + input.validityMonths);

  // Acheteur :
  //  - ADMIN_GIFT : sentinel "admin@…" pour identifier les cartes offertes
  //  - ADMIN_SALE : vraie acheteuse si saisie, sinon fallback sur bénéficiaire
  const finalBuyerEmail =
    input.mode === "ADMIN_SALE" && buyerEmail
      ? buyerEmail
      : input.mode === "ADMIN_SALE"
      ? recipientEmail
      : "admin@clochette-nails.fr";
  const finalBuyerName =
    input.mode === "ADMIN_SALE" && buyerName
      ? buyerName
      : input.mode === "ADMIN_SALE"
      ? recipientName
      : "Clochette Nails (admin)";

  const created = await prisma.giftCard.create({
    data: {
      code,
      codeHash,
      prefix: giftCardPrefix(code),
      status: "ACTIVE",
      initialAmountCents,
      remainingAmountCents: initialAmountCents,
      buyerEmail: finalBuyerEmail,
      buyerName: finalBuyerName,
      recipientEmail,
      recipientName,
      giftMessage: giftMessage || null,
      deliveryMode: "EMAIL_TO_RECIPIENT",
      deliveredAt: new Date(),
      expiresAt,
      // Paiement : statut PAID artificiel pour cohérence avec le flux Stripe.
      amount: initialAmountCents,
      paymentStatus: "PAID",
      paidAt: new Date(),
      // Distinction CA : ADMIN_GIFT n'entrera pas dans le CA, ADMIN_SALE oui.
      creationMode: input.mode,
      paymentMethod: salePaymentMethod,
    },
    select: { id: true },
  });

  await audit(admin.id, created.id, "gift_card.created_admin", {
    recipientEmail,
    amountCents: initialAmountCents,
    validityMonths: input.validityMonths,
    mode: input.mode,
    paymentMethod: salePaymentMethod,
  });
  await emitOutboundEvent(
    input.mode === "ADMIN_GIFT"
      ? "gift_card.admin_gift_issued"
      : "gift_card.purchased",
    {
      giftCardId: created.id,
      amountCents: initialAmountCents,
      channel: input.mode === "ADMIN_GIFT" ? "admin_gift" : "admin_sale",
      paymentMethod: salePaymentMethod,
    },
  );

  // Facture pour les ventes en salon (fail-soft ; jamais pour ADMIN_GIFT)
  if (input.mode === "ADMIN_SALE") {
    try {
      const invoice = await createInvoiceForGiftCard(created.id, { createdById: admin.id });
      if (input.sendInvoiceByEmail && finalBuyerEmail) {
        await sendInvoiceEmail(invoice.id);
      }
    } catch (err) {
      console.error("[gift-card-admin] facture vente salon échec:", err);
    }
  }

  // Envoi email immédiat (non bloquant : si fail, la carte reste créée)
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://clochette-nails.fr";
    const email = buildGiftCardAdminIssuedEmail({
      recipientFirstName: recipientName.split(" ")[0] ?? recipientName,
      code,
      initialAmountCents,
      expiresAt,
      message: giftMessage || null,
      reservationUrl: `${siteUrl}/reservation`,
    });
    await sendEmail({
      to: recipientEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
      tag: "gift-card.admin-issued",
    });
  } catch (err) {
    console.error("[gift-card-admin] email bénéficiaire échec:", err);
    // On revalidate quand même
  }

  // Reçu acheteuse (ADMIN_SALE uniquement, si email saisi).
  // Si acheteuse = bénéficiaire, on n'ajoute pas la mention "bénéficiaire séparé".
  if (input.mode === "ADMIN_SALE" && buyerEmail && salePaymentMethod) {
    try {
      const receipt = buildGiftCardPurchaseReceiptEmail({
        buyerFirstName: (buyerName ?? buyerEmail).split(" ")[0],
        prefix: giftCardPrefix(code),
        amountCents: initialAmountCents,
        paymentMethod: salePaymentMethod,
        recipientName:
          buyerEmail !== recipientEmail ? recipientName : null,
        purchasedAt: new Date(),
        expiresAt,
      });
      await sendEmail({
        to: buyerEmail,
        subject: receipt.subject,
        html: receipt.html,
        text: receipt.text,
        tag: "gift-card.receipt",
      });
    } catch (err) {
      console.error("[gift-card-admin] reçu acheteuse échec:", err);
    }
  }

  revalidatePath("/admin", "layout");
  return {
    ok: true,
    id: created.id,
    code,
    message: "Carte cadeau créée et email envoyé.",
  };
}

// ─── Annulation ─────────────────────────────────────────────

export async function cancelGiftCard(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const card = await prisma.giftCard.findUnique({
    where: { id },
    select: {
      status: true,
      initialAmountCents: true,
      remainingAmountCents: true,
    },
  });
  if (!card) return { ok: false, error: "Carte introuvable" };

  if (card.status === "CANCELLED" || card.status === "REFUNDED") {
    return { ok: false, error: "Cette carte est déjà annulée ou remboursée." };
  }
  if (card.remainingAmountCents < card.initialAmountCents) {
    return {
      ok: false,
      error:
        "Cette carte a déjà été utilisée (partiellement). Annulation impossible.",
    };
  }

  await prisma.giftCard.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
  await audit(admin.id, id, "gift_card.cancelled");
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Carte annulée." };
}

// ─── Prolongation expiration ────────────────────────────────

export async function extendGiftCardExpiration(
  id: string,
  newExpiresAtIso: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const newDate = new Date(newExpiresAtIso);
  if (Number.isNaN(newDate.getTime())) {
    return { ok: false, error: "Date invalide." };
  }
  if (newDate.getTime() < Date.now()) {
    return { ok: false, error: "La nouvelle date doit être dans le futur." };
  }

  const card = await prisma.giftCard.findUnique({
    where: { id },
    select: { status: true, expiresAt: true },
  });
  if (!card) return { ok: false, error: "Carte introuvable" };
  if (card.status === "CANCELLED" || card.status === "REFUNDED") {
    return {
      ok: false,
      error: "Impossible de prolonger une carte annulée ou remboursée.",
    };
  }

  await prisma.giftCard.update({
    where: { id },
    data: {
      expiresAt: newDate,
      // Si elle était EXPIRED, on la réactive automatiquement
      status: card.status === "EXPIRED" ? "ACTIVE" : card.status,
    },
  });
  await audit(admin.id, id, "gift_card.expiration_extended", {
    previousExpiresAt: card.expiresAt.toISOString(),
    newExpiresAt: newDate.toISOString(),
  });
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Date d'expiration mise à jour." };
}

// ─── Remboursement Stripe ───────────────────────────────────

export async function refundGiftCardStripe(
  id: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const card = await prisma.giftCard.findUnique({
    where: { id },
    select: {
      status: true,
      stripePaymentId: true,
      initialAmountCents: true,
      remainingAmountCents: true,
      refundedAmount: true,
    },
  });
  if (!card) return { ok: false, error: "Carte introuvable" };
  if (!card.stripePaymentId) {
    return {
      ok: false,
      error: "Aucun paiement Stripe rattaché à cette carte.",
    };
  }
  if (card.status === "REFUNDED" || card.status === "CANCELLED") {
    return { ok: false, error: "Cette carte est déjà remboursée ou annulée." };
  }
  if (card.remainingAmountCents < card.initialAmountCents) {
    return {
      ok: false,
      error: "Cette carte a déjà été utilisée. Remboursement impossible.",
    };
  }
  if (card.refundedAmount && card.refundedAmount >= card.initialAmountCents) {
    return { ok: false, error: "Carte déjà remboursée intégralement." };
  }

  if (!stripe) {
    return {
      ok: false,
      error: "Stripe non configuré sur ce serveur.",
    };
  }

  let refund;
  try {
    refund = await stripe.refunds.create({
      payment_intent: card.stripePaymentId,
      reason: "requested_by_customer",
      metadata: { giftCardId: id, adminId: admin.id },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur Stripe";
    return { ok: false, error: `Échec du remboursement Stripe : ${msg}` };
  }
  // Garde refund.status : ne rien écrire tant que l'argent n'est pas parti. Un
  // refund `pending`/`failed`/`canceled` ne doit pas produire de ligne négative
  // en compta pour un décaissement qui n'a pas (encore) eu lieu.
  if (refund.status !== "succeeded") {
    return {
      ok: false,
      error: `Remboursement Stripe non finalisé (statut : ${refund.status ?? "inconnu"}). Réessayez plus tard.`,
    };
  }

  const refundedAt = new Date();
  await prisma.giftCard.update({
    where: { id },
    data: {
      status: "REFUNDED",
      refundedAmount: refund.amount,
      refundedAt,
      remainingAmountCents: 0,
    },
  });
  await emitOutboundEvent("gift_card.refunded", {
    giftCardId: id,
    refundedAmountCents: refund.amount,
    refundedAt: refundedAt.toISOString(),
  });
  await audit(admin.id, id, "gift_card.refunded_stripe", {
    refundId: refund.id,
    refundAmountCents: refund.amount,
  });

  // Avoir automatique si une facture avait été émise pour cette vente
  try {
    const parentInvoice = await prisma.invoice.findFirst({
      where: { giftCardId: id, docType: "INVOICE", status: "ISSUED" },
      select: { id: true },
    });
    if (parentInvoice) {
      const creditNote = await createCreditNote({
        parentInvoiceId: parentInvoice.id,
        amountCents: refund.amount,
        reason: "Remboursement carte cadeau",
        createdById: admin.id,
      });
      await audit(admin.id, id, "invoice.credit_note_created", {
        number: creditNote.number,
        amountCents: refund.amount,
      });
    }
  } catch (err) {
    if (!(err instanceof InvoiceError)) console.error("[gift-card-admin] avoir refund échec:", err);
    else console.warn("[gift-card-admin] avoir refund refusé:", err.message);
  }

  revalidatePath("/admin", "layout");
  return { ok: true, message: "Carte remboursée via Stripe." };
}

/**
 * Remboursement HORS Stripe d'une carte vendue au comptoir (ADMIN_SALE) :
 * l'argent est rendu en espèces / virement / chèque, aucun refund Stripe à
 * déclencher. Sans ce chemin, une carte comptoir est structurellement
 * irremboursable en compta. Sans reliquat (D2) : carte entamée refusée.
 */
export async function refundGiftCardOffline(
  id: string,
  method: "cash" | "transfer" | "check",
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  if (!["cash", "transfer", "check"].includes(method)) {
    return { ok: false, error: "Moyen de remboursement invalide." };
  }

  const card = await prisma.giftCard.findUnique({
    where: { id },
    select: {
      status: true,
      stripePaymentId: true,
      initialAmountCents: true,
      remainingAmountCents: true,
      creationMode: true,
    },
  });
  if (!card) return { ok: false, error: "Carte introuvable" };
  if (card.stripePaymentId) {
    return {
      ok: false,
      error: "Cette carte a été payée en ligne : utilisez le remboursement Stripe.",
    };
  }
  if (card.status === "REFUNDED" || card.status === "CANCELLED") {
    return { ok: false, error: "Cette carte est déjà remboursée ou annulée." };
  }
  if (card.remainingAmountCents < card.initialAmountCents) {
    return {
      ok: false,
      error: "Cette carte a déjà été utilisée. Remboursement impossible.",
    };
  }

  const refundedAt = new Date();
  await prisma.giftCard.update({
    where: { id },
    data: {
      status: "REFUNDED",
      refundedAmount: card.initialAmountCents,
      refundedAt,
      refundMethod: method,
      remainingAmountCents: 0,
    },
  });
  await emitOutboundEvent("gift_card.refunded", {
    giftCardId: id,
    refundedAmountCents: card.initialAmountCents,
    refundedAt: refundedAt.toISOString(),
  });
  await audit(admin.id, id, "gift_card.refunded_offline", {
    refundAmountCents: card.initialAmountCents,
    method,
  });

  // Avoir automatique si une facture avait été émise pour cette vente
  try {
    const parentInvoice = await prisma.invoice.findFirst({
      where: { giftCardId: id, docType: "INVOICE", status: "ISSUED" },
      select: { id: true },
    });
    if (parentInvoice) {
      const creditNote = await createCreditNote({
        parentInvoiceId: parentInvoice.id,
        amountCents: card.initialAmountCents,
        reason: "Remboursement carte cadeau (hors Stripe)",
        createdById: admin.id,
      });
      await audit(admin.id, id, "invoice.credit_note_created", {
        number: creditNote.number,
        amountCents: card.initialAmountCents,
      });
    }
  } catch (err) {
    if (!(err instanceof InvoiceError)) console.error("[gift-card-admin] avoir refund offline échec:", err);
    else console.warn("[gift-card-admin] avoir refund offline refusé:", err.message);
  }

  revalidatePath("/admin", "layout");
  return { ok: true, message: "Carte remboursée (hors Stripe)." };
}

// ─── Validation d'un code par l'admin (sans rate limit) ────

export type AdminGiftCardLookupResult =
  | {
      ok: true;
      data: {
        id: string;
        prefix: string;
        remainingAmountCents: number;
        initialAmountCents: number;
        expiresAt: string;
        recipientName: string | null;
      };
    }
  | { ok: false; error: string };

/**
 * Recherche admin d'une carte cadeau par code (pas de rate limit car auth
 * ADMIN). Utilisée par la modale "Marquer honoré" pour vérifier solde + valider
 * usage. Retourne aussi le nom du bénéficiaire pour rassurer Chloé sur l'identité.
 */
export async function lookupGiftCardForAdmin(
  code: string,
): Promise<AdminGiftCardLookupResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { ok: false, error: "Code requis." };

  const card = await prisma.giftCard.findUnique({
    where: { code: trimmed },
    select: {
      id: true,
      prefix: true,
      status: true,
      remainingAmountCents: true,
      initialAmountCents: true,
      expiresAt: true,
      recipientName: true,
    },
  });
  if (!card) return { ok: false, error: "Code introuvable." };

  if (card.status === "CANCELLED" || card.status === "REFUNDED") {
    return { ok: false, error: "Cette carte est annulée ou remboursée." };
  }
  if (card.status === "FULLY_USED" || card.remainingAmountCents <= 0) {
    return { ok: false, error: "Cette carte est entièrement utilisée." };
  }
  if (card.status === "PENDING_PAYMENT") {
    return { ok: false, error: "Cette carte n'est pas encore activée." };
  }
  if (card.expiresAt < new Date()) {
    return { ok: false, error: "Cette carte a expiré." };
  }

  return {
    ok: true,
    data: {
      id: card.id,
      prefix: card.prefix,
      remainingAmountCents: card.remainingAmountCents,
      initialAmountCents: card.initialAmountCents,
      expiresAt: card.expiresAt.toISOString(),
      recipientName: card.recipientName,
    },
  };
}

// ─── Renvoi de l'email ──────────────────────────────────────

export async function resendGiftCardEmail(
  id: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const card = await prisma.giftCard.findUnique({
    where: { id },
    select: {
      code: true,
      prefix: true,
      status: true,
      initialAmountCents: true,
      remainingAmountCents: true,
      expiresAt: true,
      recipientEmail: true,
      recipientName: true,
      buyerEmail: true,
      buyerName: true,
    },
  });
  if (!card) return { ok: false, error: "Carte introuvable" };

  if (card.status === "CANCELLED" || card.status === "REFUNDED") {
    return {
      ok: false,
      error: "Cette carte est annulée ou remboursée : pas de renvoi possible.",
    };
  }
  if (card.status === "PENDING_PAYMENT") {
    return {
      ok: false,
      error: "Cette carte n'est pas encore activée.",
    };
  }

  const to = card.recipientEmail ?? card.buyerEmail;
  const fullName = card.recipientName ?? card.buyerName;
  if (to.startsWith("admin@")) {
    return {
      ok: false,
      error:
        "Aucune adresse cliente associée à cette carte (création admin sans bénéficiaire).",
    };
  }

  try {
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://clochette-nails.fr";
    const email = buildGiftCardResentEmail({
      firstName: fullName.split(" ")[0] ?? fullName,
      code: card.code,
      remainingAmountCents: card.remainingAmountCents,
      initialAmountCents: card.initialAmountCents,
      expiresAt: card.expiresAt,
      reservationUrl: `${siteUrl}/reservation`,
    });
    await sendEmail({
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      tag: "gift-card.resent",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur envoi mail";
    return { ok: false, error: `Échec d'envoi : ${msg}` };
  }

  await audit(admin.id, id, "gift_card.email_resent", { to });
  revalidatePath("/admin", "layout");
  return { ok: true, message: `Email renvoyé à ${to}.` };
}
