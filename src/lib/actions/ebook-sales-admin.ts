"use server";

/**
 * Server Actions admin — gestion des ventes d'ebooks (EbookPurchase).
 *
 * Actions :
 *  - resendEbookDeliveryEmail(purchaseId) : renvoie le mail avec le même
 *    lien (token inchangé). Bloque si épuisé / refundé / expiré.
 *  - reissueEbookDownload(purchaseId) : régénère le token (l'ancien lien
 *    devient invalide), décrémente downloadCount de 1 (1 DL en plus),
 *    réinitialise lastDownloadAt à null, envoie un mail "nouveau lien".
 *  - refundEbookPurchase(purchaseId, reason) : refund Stripe (portion CB)
 *    + reverse carte cadeau (portion GC) + REVOQUE accès (paymentStatus
 *    REFUNDED, tokenExpiresAt passé) + email cliente.
 *
 * Audit logs sur chaque action.
 */

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { reverseGiftCardRedemption } from "@/lib/gift-card-redeem";
import { sendEmail } from "@/lib/email/send";
import {
  MAX_DOWNLOADS_PER_TOKEN,
  computeTokenExpiry,
  generateDownloadToken,
} from "@/lib/ebook-download-token";
import { buildEbookResentEmail } from "@/lib/email/templates/ebook-resent";
import { buildEbookReissuedEmail } from "@/lib/email/templates/ebook-reissued";
import { buildEbookRefundedEmail } from "@/lib/email/templates/ebook-refunded";
import { createCreditNote, InvoiceError } from "@/lib/invoice/create-invoice";
import { readInvoicePdf } from "@/lib/invoice/invoice-files";
import { markInvoiceSent } from "@/lib/invoice/invoice-email";

type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

async function audit(
  adminId: string,
  ebookPurchaseId: string,
  action: string,
  metadata?: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: {
      adminId,
      action,
      metadata: { ebookPurchaseId, ...(metadata ?? {}) } as object,
    },
  });
}

function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clochette-nails.fr"
  );
}

function firstNameOf(input: string | null, fallback: string): string {
  const src = input ?? fallback;
  return src.split(" ")[0] ?? src;
}

// ─── Resend mail (même token) ───────────────────────────────

export async function resendEbookDeliveryEmail(
  purchaseId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const purchase = await prisma.ebookPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      clientEmail: true,
      clientName: true,
      paymentStatus: true,
      downloadToken: true,
      downloadCount: true,
      tokenExpiresAt: true,
      ebook: { select: { title: true } },
    },
  });
  if (!purchase) return { ok: false, error: "Achat introuvable." };
  if (purchase.paymentStatus !== "PAID") {
    return { ok: false, error: "L'achat n'est pas en statut PAID." };
  }
  if (purchase.tokenExpiresAt < new Date()) {
    return {
      ok: false,
      error: "Le lien a expiré. Utilise plutôt « Réémettre un lien ».",
    };
  }
  if (purchase.downloadCount >= MAX_DOWNLOADS_PER_TOKEN) {
    return {
      ok: false,
      error:
        "Cap de téléchargements atteint. Utilise plutôt « Réémettre un lien ».",
    };
  }

  const downloadUrl = `${siteOrigin()}/ebooks/telechargement/${purchase.downloadToken}`;
  const mail = buildEbookResentEmail({
    clientFirstName: firstNameOf(purchase.clientName, purchase.clientEmail),
    ebookTitle: purchase.ebook.title,
    downloadUrl,
    remainingDownloads: MAX_DOWNLOADS_PER_TOKEN - purchase.downloadCount,
    tokenExpiresAt: purchase.tokenExpiresAt,
  });
  const result = await sendEmail({
    to: purchase.clientEmail,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    tag: "ebook.resent",
  });
  if (!result.ok) return { ok: false, error: `Envoi échoué : ${result.error}` };

  await audit(admin.id, purchase.id, "ebook_purchase.resend_email");
  revalidatePath(`/admin/ebooks/ventes/${purchase.id}`);
  revalidatePath("/admin/ebooks/ventes");
  return { ok: true, message: "Mail renvoyé." };
}

// ─── Reissue (nouveau token + 1 DL en plus) ────────────────

export async function reissueEbookDownload(
  purchaseId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const purchase = await prisma.ebookPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      clientEmail: true,
      clientName: true,
      paymentStatus: true,
      downloadCount: true,
      ebook: { select: { title: true } },
    },
  });
  if (!purchase) return { ok: false, error: "Achat introuvable." };
  if (purchase.paymentStatus !== "PAID") {
    return {
      ok: false,
      error: "L'achat n'est pas en statut PAID, impossible de réémettre.",
    };
  }

  const newToken = generateDownloadToken();
  const newExpiry = computeTokenExpiry();
  // On décrémente d'1 (mais jamais sous 0). Si elle était à 5/5, elle passe
  // à 4/5 → 1 DL possible avec le nouveau token. Si elle était à 2/5, elle
  // passe à 1/5 → 4 DL possibles, ce qui est OK (admin réémet = soutien SAV).
  const newCount = Math.max(0, purchase.downloadCount - 1);

  await prisma.ebookPurchase.update({
    where: { id: purchase.id },
    data: {
      downloadToken: newToken,
      tokenExpiresAt: newExpiry,
      downloadCount: newCount,
      lastDownloadAt: null,
    },
  });

  const downloadUrl = `${siteOrigin()}/ebooks/telechargement/${newToken}`;
  const mail = buildEbookReissuedEmail({
    clientFirstName: firstNameOf(purchase.clientName, purchase.clientEmail),
    ebookTitle: purchase.ebook.title,
    downloadUrl,
    tokenExpiresAt: newExpiry,
  });
  const result = await sendEmail({
    to: purchase.clientEmail,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    tag: "ebook.reissued",
  });
  if (!result.ok) {
    // L'envoi a échoué — on est dans un état où le token a déjà été
    // régénéré, l'ancien lien ne marche plus. On log l'erreur, l'admin
    // peut renvoyer manuellement depuis le détail.
    console.error(
      `[ebook reissue] email échec pour ${purchase.id}: ${result.error}`,
    );
    await audit(admin.id, purchase.id, "ebook_purchase.reissue_email_failed", {
      error: result.error,
    });
    return {
      ok: false,
      error: `Token régénéré mais envoi mail échoué : ${result.error}. L'ancien lien ne marche plus — renvoie le mail depuis le détail.`,
    };
  }

  await audit(admin.id, purchase.id, "ebook_purchase.reissue_download", {
    previousCount: purchase.downloadCount,
    newCount,
  });
  revalidatePath(`/admin/ebooks/ventes/${purchase.id}`);
  revalidatePath("/admin/ebooks/ventes");
  return { ok: true, message: "Nouveau lien envoyé. L'ancien est révoqué." };
}

// ─── Refund + révocation accès ─────────────────────────────

export async function refundEbookPurchase(
  purchaseId: string,
  reason: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const purchase = await prisma.ebookPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      clientEmail: true,
      clientName: true,
      amount: true,
      paymentStatus: true,
      stripePaymentId: true,
      refundedAmount: true,
      ebook: { select: { title: true } },
      giftCardRedemption: {
        select: {
          id: true,
          amountUsedCents: true,
          reversedAt: true,
          giftCard: { select: { prefix: true } },
        },
      },
    },
  });
  if (!purchase) return { ok: false, error: "Achat introuvable." };
  if (purchase.paymentStatus === "REFUNDED") {
    return { ok: false, error: "Cet achat est déjà remboursé." };
  }
  if (purchase.paymentStatus !== "PAID") {
    return {
      ok: false,
      error: "Seuls les achats PAID peuvent être remboursés.",
    };
  }

  // Calcul des portions à rembourser
  const gcUsedCents =
    purchase.giftCardRedemption && !purchase.giftCardRedemption.reversedAt
      ? purchase.giftCardRedemption.amountUsedCents
      : 0;
  const stripePortion = Math.max(0, purchase.amount - gcUsedCents);
  const alreadyRefundedStripe = purchase.refundedAmount ?? 0;
  const remainingStripe = Math.max(
    0,
    stripePortion - alreadyRefundedStripe,
  );

  let stripeRefundedCents = 0;
  let stripeRefundId: string | null = null;
  let gcRefundedCents = 0;
  let gcPrefix: string | null = null;

  // 1) Refund Stripe si on a une portion CB
  if (remainingStripe > 0 && purchase.stripePaymentId) {
    if (!stripe) {
      return {
        ok: false,
        error: "Stripe non configuré, impossible de rembourser la portion CB.",
      };
    }
    try {
      const refund = await stripe.refunds.create({
        payment_intent: purchase.stripePaymentId,
        reason: "requested_by_customer",
        metadata: {
          ebookPurchaseId: purchaseId,
          adminId: admin.id,
          customReason: reason || "(non précisé)",
        },
      });
      stripeRefundedCents = refund.amount;
      stripeRefundId = refund.id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur Stripe";
      return { ok: false, error: `Refund Stripe échoué : ${msg}` };
    }
  }

  // 2) Reverse carte cadeau si redemption active
  if (purchase.giftCardRedemption && !purchase.giftCardRedemption.reversedAt) {
    try {
      const r = await reverseGiftCardRedemption(
        purchase.giftCardRedemption.id,
      );
      gcRefundedCents = r.reversedAmountCents;
      gcPrefix = r.giftCardPrefix;
    } catch (err) {
      console.error("[ebook refund] reverse GC échoué:", err);
    }
  }

  // 3) Update purchase : REFUNDED + révoque le token (expiry = now)
  const now = new Date();
  await prisma.ebookPurchase.update({
    where: { id: purchase.id },
    data: {
      paymentStatus: "REFUNDED",
      refundedAmount:
        (purchase.refundedAmount ?? 0) + stripeRefundedCents,
      tokenExpiresAt: now, // révoque l'accès download
    },
  });

  const totalRefunded = stripeRefundedCents + gcRefundedCents;

  await audit(admin.id, purchase.id, "ebook_purchase.refunded", {
    stripeRefundId,
    stripeRefundedCents,
    gcRefundedCents,
    gcPrefix,
    reason: reason || null,
  });

  // Avoir automatique si une facture avait été émise (joint au mail de remboursement)
  let creditNoteAttachment: { filename: string; content: Buffer } | null = null;
  let creditNoteId: string | null = null;
  try {
    const parentInvoice = await prisma.invoice.findFirst({
      where: { ebookPurchaseId: purchase.id, docType: "INVOICE", status: "ISSUED" },
      select: { id: true },
    });
    if (parentInvoice && totalRefunded > 0) {
      const creditNote = await createCreditNote({
        parentInvoiceId: parentInvoice.id,
        amountCents: totalRefunded,
        reason: "Remboursement ebook",
        createdById: admin.id,
      });
      creditNoteId = creditNote.id;
      creditNoteAttachment = {
        filename: `${creditNote.number}.pdf`,
        content: await readInvoicePdf(creditNote.pdfPath),
      };
      await audit(admin.id, purchase.id, "invoice.credit_note_created", {
        number: creditNote.number,
        amountCents: totalRefunded,
      });
    }
  } catch (err) {
    if (!(err instanceof InvoiceError)) console.error("[ebook refund] avoir échec:", err);
    else console.warn("[ebook refund] avoir refusé:", err.message);
  }

  // 4) Email cliente
  try {
    const mail = buildEbookRefundedEmail({
      clientFirstName: firstNameOf(purchase.clientName, purchase.clientEmail),
      ebookTitle: purchase.ebook.title,
      refundedCents: totalRefunded,
      stripeRefundedCents,
      giftCardRefundedCents: gcRefundedCents,
      giftCardPrefix: gcPrefix,
      reason: reason || null,
    });
    const r = await sendEmail({
      to: purchase.clientEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tag: "ebook.refunded",
      ...(creditNoteAttachment ? { attachments: [creditNoteAttachment] } : {}),
    });
    if (!r.ok) {
      console.error(
        `[ebook refund] email échec pour ${purchase.id}: ${r.error}`,
      );
    } else if (creditNoteId && creditNoteAttachment) {
      await markInvoiceSent(creditNoteId, purchase.clientEmail);
    }
  } catch (err) {
    console.error(
      `[ebook refund] email exception pour ${purchase.id}:`,
      err,
    );
  }

  revalidatePath(`/admin/ebooks/ventes/${purchase.id}`);
  revalidatePath("/admin/ebooks/ventes");
  return {
    ok: true,
    message: `Remboursé ${(totalRefunded / 100).toFixed(2).replace(".", ",")} €. Accès révoqué.`,
  };
}
