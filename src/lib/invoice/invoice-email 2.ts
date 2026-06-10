/**
 * Email "Votre facture" — PDF en pièce jointe. Sert l'envoi opt-in
 * (booking, GC admin) et le renvoi depuis la liste admin (factures ET avoirs).
 * Marque sentAt/sentTo en cas de succès.
 */

import { prisma } from "@/lib/prisma";
import { sendEmail, type SendResult } from "@/lib/email/send";
import { COLORS, emailLayout, escapeHtml } from "@/lib/email/templates/layout";
import { readInvoicePdf } from "./invoice-files";

function euros(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

function buildInvoiceEmail(input: {
  firstName: string;
  number: string;
  docType: "INVOICE" | "CREDIT_NOTE";
  totalCents: number;
}) {
  const isCreditNote = input.docType === "CREDIT_NOTE";
  const docLabel = isCreditNote ? "avoir" : "facture";
  const subject = isCreditNote
    ? `Votre avoir ${input.number}`
    : `Votre facture ${input.number}`;

  const text = [
    `Bonjour ${input.firstName},`,
    ``,
    `Vous trouverez en pièce jointe votre ${docLabel} ${input.number}` +
      ` d'un montant de ${euros(input.totalCents)}.`,
    ``,
    `Conservez ce document pour vos archives.`,
    ``,
    `À très vite,`,
    `{{signature}}`,
  ].join("\n");

  const contentHtml = `
    <p style="margin: 0 0 16px; font-size: 15px; color: ${COLORS.ink900};">
      Bonjour ${escapeHtml(input.firstName)},
    </p>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${COLORS.ink900};">
      Vous trouverez en pièce jointe votre ${docLabel}
      <strong>${escapeHtml(input.number)}</strong> d'un montant de
      <strong>${euros(input.totalCents)}</strong>.
    </p>
    <p style="margin: 0; font-size: 13px; color: ${COLORS.ink500};">
      Conservez ce document pour vos archives.
    </p>
  `;

  return {
    subject,
    text,
    html: emailLayout({
      title: isCreditNote ? "Votre avoir" : "Votre facture",
      subtitle: input.number,
      contentHtml,
      preheader: `${isCreditNote ? "Avoir" : "Facture"} ${input.number} — ${euros(input.totalCents)}`,
    }),
  };
}

export async function sendInvoiceEmail(invoiceId: string): Promise<SendResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      number: true,
      docType: true,
      totalCents: true,
      customerName: true,
      customerEmail: true,
      pdfPath: true,
      status: true,
    },
  });
  if (!invoice) return { ok: false, error: "Facture introuvable." };
  if (invoice.status !== "ISSUED") return { ok: false, error: "Facture annulée." };

  let pdf: Buffer;
  try {
    pdf = await readInvoicePdf(invoice.pdfPath);
  } catch {
    return { ok: false, error: "Fichier PDF introuvable sur le serveur." };
  }

  const mail = buildInvoiceEmail({
    firstName: invoice.customerName.split(" ")[0] || invoice.customerName,
    number: invoice.number,
    docType: invoice.docType,
    totalCents: invoice.totalCents,
  });

  const result = await sendEmail({
    to: invoice.customerEmail,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    tag: "invoice",
    attachments: [{ filename: `${invoice.number}.pdf`, content: pdf }],
  });

  if (result.ok) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { sentAt: new Date(), sentTo: invoice.customerEmail },
    });
  }
  return result;
}

export async function markInvoiceSent(invoiceId: string, sentTo: string): Promise<void> {
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { sentAt: new Date(), sentTo },
  });
}
