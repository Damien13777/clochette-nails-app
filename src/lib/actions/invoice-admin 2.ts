"use server";

/**
 * Server Actions admin — factures : renvoi email, avoir manuel, génération
 * fallback (RDV honoré / carte cadeau / achat ebook sans facture).
 * Jamais de suppression ni d'édition : les factures émises sont immuables.
 */

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import {
  createCreditNote,
  createInvoiceForBooking,
  createInvoiceForEbookPurchase,
  createInvoiceForGiftCard,
  InvoiceError,
} from "@/lib/invoice/create-invoice";
import { sendInvoiceEmail } from "@/lib/invoice/invoice-email";

type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

async function audit(adminId: string, action: string, metadata: Record<string, unknown>) {
  await prisma.auditLog.create({ data: { adminId, action, metadata: metadata as object } });
}

function errorMessage(err: unknown): string {
  return err instanceof InvoiceError ? err.message : "Erreur interne.";
}

export async function resendInvoiceEmail(invoiceId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { number: true, customerEmail: true },
  });
  if (!invoice) return { ok: false, error: "Facture introuvable." };

  const result = await sendInvoiceEmail(invoiceId);
  if (!result.ok) return { ok: false, error: `Envoi échoué : ${result.error}` };

  await audit(admin.id, "invoice.resent", {
    invoiceId,
    number: invoice.number,
    to: invoice.customerEmail,
  });
  revalidatePath("/admin/finances/factures");
  return { ok: true, message: `Facture ${invoice.number} envoyée à ${invoice.customerEmail}.` };
}

export async function createCreditNoteAction(
  parentInvoiceId: string,
  amountEuros: number,
  reason: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  if (!Number.isFinite(amountEuros) || amountEuros <= 0) {
    return { ok: false, error: "Montant invalide." };
  }

  try {
    const creditNote = await createCreditNote({
      parentInvoiceId,
      amountCents: Math.round(amountEuros * 100),
      reason: reason.trim() || null,
      createdById: admin.id,
    });
    await audit(admin.id, "invoice.credit_note_created", {
      parentInvoiceId,
      number: creditNote.number,
      amountCents: Math.round(amountEuros * 100),
    });
    revalidatePath("/admin/finances/factures");
    return { ok: true, message: `Avoir ${creditNote.number} créé.` };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function generateInvoiceForSource(input: {
  sourceType: "BOOKING" | "GIFT_CARD" | "EBOOK";
  sourceId: string;
}): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Non autorisé" };

  try {
    const invoice =
      input.sourceType === "BOOKING"
        ? await createInvoiceForBooking(input.sourceId, { createdById: admin.id })
        : input.sourceType === "GIFT_CARD"
          ? await createInvoiceForGiftCard(input.sourceId, { createdById: admin.id })
          : await createInvoiceForEbookPurchase(input.sourceId, { createdById: admin.id });

    await audit(admin.id, "invoice.issued", {
      number: invoice.number,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    });
    revalidatePath("/admin", "layout");
    return { ok: true, message: `Facture ${invoice.number} générée.` };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
