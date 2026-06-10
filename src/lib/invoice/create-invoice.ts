/**
 * Cœur du module facturation : allocation de numéro séquentiel sans trou
 * (InvoiceCounter, upsert atomique ON CONFLICT) + rendu PDF + écriture
 * fichier + row Invoice, le tout dans UNE transaction : tout échec rollback
 * le compteur (pas de trou). Builders par source de vente + avoirs.
 */

import path from "node:path";
import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emitOutboundEvent } from "@/lib/outbound-events";
import { renderInvoicePdf } from "./invoice-pdf";
import { writeInvoicePdf } from "./invoice-files";
import type { InvoiceLine, InvoicePayment, SellerSnapshot } from "./types";

export class InvoiceError extends Error {}

export type CreateInvoiceInput = {
  docType: "INVOICE" | "CREDIT_NOTE";
  sourceType: "BOOKING" | "GIFT_CARD" | "EBOOK";
  bookingId?: string | null;
  giftCardId?: string | null;
  ebookPurchaseId?: string | null;
  parentInvoiceId?: string | null;
  parentNumber?: string | null;
  customerName: string;
  customerEmail: string;
  lines: InvoiceLine[];
  payments: InvoicePayment[];
  totalCents: number;
  serviceDate?: Date | null;
  createdById?: string | null;
};

export type CreatedInvoice = { id: string; number: string; pdfPath: string };

const SERIES_PREFIX: Record<CreateInvoiceInput["docType"], string> = {
  INVOICE: "FAC",
  CREDIT_NOTE: "AV",
};

async function loadSellerSnapshot(): Promise<SellerSnapshot> {
  const s = await prisma.platformSettings.findFirstOrThrow({
    select: {
      businessName: true,
      businessSiret: true,
      businessAddress: true,
      contactEmail: true,
      contactPhone: true,
      vatEnabled: true,
      vatRate: true,
      invoiceHeaderName: true,
      invoiceLegalOwner: true,
      invoiceVatMention: true,
      invoiceLegalFooter: true,
      invoiceLogoUrl: true,
    },
  });
  return {
    headerName: s.invoiceHeaderName ?? s.businessName,
    legalOwner: s.invoiceLegalOwner,
    address: s.businessAddress,
    siret: s.businessSiret,
    contactEmail: s.contactEmail,
    contactPhone: s.contactPhone,
    vatMention: s.invoiceVatMention,
    legalFooter: s.invoiceLegalFooter,
    logoUrl: s.invoiceLogoUrl,
    vatEnabled: s.vatEnabled,
    vatRate: s.vatRate,
  };
}

async function loadLogoPng(logoUrl: string | null): Promise<Buffer | null> {
  if (!logoUrl || !logoUrl.endsWith(".png")) return null;
  try {
    return await readFile(path.join(process.cwd(), "public", logoUrl.replace(/^\//, "")));
  } catch {
    return null;
  }
}

function parisYear(): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
  }).format(new Date());
}

export async function createInvoice(input: CreateInvoiceInput): Promise<CreatedInvoice> {
  if (!Number.isInteger(input.totalCents) || input.totalCents <= 0) {
    throw new InvoiceError("Montant total invalide.");
  }
  const seller = await loadSellerSnapshot();
  const logoPng = await loadLogoPng(seller.logoUrl);
  const year = parisYear();
  const series = `${SERIES_PREFIX[input.docType]}-${year}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const created = await prisma.$transaction(
        async (tx) => {
          const counter = await tx.invoiceCounter.upsert({
            where: { series },
            create: { series, lastNumber: 1 },
            update: { lastNumber: { increment: 1 } },
          });
          const number = `${series}-${String(counter.lastNumber).padStart(4, "0")}`;
          const issuedAt = new Date();
          const pdfPath = `${year}/${number}.pdf`;

          const pdf = await renderInvoicePdf({
            number,
            docType: input.docType,
            issuedAt,
            serviceDate: input.serviceDate ?? null,
            seller,
            logoPng,
            customerName: input.customerName,
            customerEmail: input.customerEmail,
            lines: input.lines,
            payments: input.payments,
            totalCents: input.totalCents,
            parentNumber: input.parentNumber ?? null,
          });
          await writeInvoicePdf(pdfPath, pdf);

          const row = await tx.invoice.create({
            data: {
              number,
              docType: input.docType,
              sourceType: input.sourceType,
              bookingId: input.bookingId ?? null,
              giftCardId: input.giftCardId ?? null,
              ebookPurchaseId: input.ebookPurchaseId ?? null,
              parentInvoiceId: input.parentInvoiceId ?? null,
              sellerSnapshot: seller as object,
              customerName: input.customerName,
              customerEmail: input.customerEmail,
              lines: input.lines as unknown as object,
              payments: input.payments as unknown as object,
              totalCents: input.totalCents,
              serviceDate: input.serviceDate ?? null,
              issuedAt,
              pdfPath,
              createdById: input.createdById ?? null,
            },
            select: { id: true },
          });
          return { id: row.id, number, pdfPath };
        },
        { timeout: 15000 },
      );

      await emitOutboundEvent("invoice.issued", {
        invoiceId: created.id,
        number: created.number,
        docType: input.docType,
        sourceType: input.sourceType,
        totalCents: input.totalCents,
        customerEmail: input.customerEmail,
        issuedAt: new Date().toISOString(),
      });
      return created;
    } catch (err) {
      const isUniqueClash =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!isUniqueClash || attempt === 1) throw err;
    }
  }
  throw new InvoiceError("Allocation du numéro de facture impossible.");
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Espèces",
  card_terminal: "TPE / Carte bancaire",
  transfer: "Virement",
  check: "Chèque",
};

function methodLabel(method: string | null): string {
  return (method && PAYMENT_METHOD_LABELS[method]) || "Paiement";
}

type BuilderOpts = { createdById?: string | null };

export async function createInvoiceForBooking(
  bookingId: string,
  opts: BuilderOpts = {},
): Promise<CreatedInvoice> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      date: true,
      clientFirstName: true,
      clientLastName: true,
      clientEmail: true,
      depositCents: true,
      revenueCents: true,
      completionPaymentMethod: true,
      paymentMethod: true,
      paidAt: true,
      service: { select: { title: true, priceCents: true } },
      options: { select: { serviceOption: { select: { title: true, addedPriceCents: true } } } },
      giftCardRedemptions: {
        where: { reversedAt: null },
        select: { type: true, amountUsedCents: true, giftCard: { select: { prefix: true } } },
      },
      invoices: { where: { docType: "INVOICE", status: "ISSUED" }, select: { number: true } },
    },
  });
  if (!booking) throw new InvoiceError("Réservation introuvable.");
  if (booking.status !== "COMPLETED") {
    throw new InvoiceError("Le RDV doit être marqué honoré avant facturation.");
  }
  if (booking.invoices.length > 0) {
    throw new InvoiceError(`Facture déjà émise (${booking.invoices[0].number}).`);
  }

  const depositGc = booking.giftCardRedemptions.filter((r) => r.type === "BOOKING_DEPOSIT");
  const serviceGc = booking.giftCardRedemptions.filter((r) => r.type === "BOOKING_SERVICE");
  const depositGcCents = depositGc.reduce((s, r) => s + r.amountUsedCents, 0);
  const stripeDepositCents =
    booking.paymentMethod === "stripe" && booking.paidAt
      ? Math.max(0, booking.depositCents - depositGcCents)
      : 0;

  const payments: InvoicePayment[] = [];
  if (stripeDepositCents > 0) {
    payments.push({
      label: "Acompte payé en ligne (carte bancaire)",
      amountCents: stripeDepositCents,
    });
  }
  for (const r of depositGc) {
    payments.push({
      label: `Carte cadeau ••${r.giftCard.prefix} (acompte)`,
      amountCents: r.amountUsedCents,
    });
  }
  if ((booking.revenueCents ?? 0) > 0) {
    payments.push({
      label: methodLabel(booking.completionPaymentMethod),
      amountCents: booking.revenueCents!,
    });
  }
  for (const r of serviceGc) {
    payments.push({ label: `Carte cadeau ••${r.giftCard.prefix}`, amountCents: r.amountUsedCents });
  }
  const totalCents = payments.reduce((s, p) => s + p.amountCents, 0);

  const lines: InvoiceLine[] = [
    {
      label: booking.service.title,
      quantity: 1,
      unitCents: booking.service.priceCents,
      totalCents: booking.service.priceCents,
    },
    ...booking.options.map((o) => ({
      label: o.serviceOption.title,
      quantity: 1,
      unitCents: o.serviceOption.addedPriceCents,
      totalCents: o.serviceOption.addedPriceCents,
    })),
  ];
  const catalogTotal = lines.reduce((s, l) => s + l.totalCents, 0);
  const diff = totalCents - catalogTotal;
  if (diff !== 0) {
    lines.push({
      label: diff < 0 ? "Remise / ajustement" : "Supplément / ajustement",
      quantity: 1,
      unitCents: diff,
      totalCents: diff,
    });
  }

  return createInvoice({
    docType: "INVOICE",
    sourceType: "BOOKING",
    bookingId: booking.id,
    customerName: `${booking.clientFirstName} ${booking.clientLastName}`,
    customerEmail: booking.clientEmail,
    lines,
    payments,
    totalCents,
    serviceDate: booking.date,
    createdById: opts.createdById ?? null,
  });
}

export async function createInvoiceForGiftCard(
  giftCardId: string,
  opts: BuilderOpts = {},
): Promise<CreatedInvoice> {
  const card = await prisma.giftCard.findUnique({
    where: { id: giftCardId },
    select: {
      id: true,
      prefix: true,
      creationMode: true,
      paymentMethod: true,
      paymentStatus: true,
      initialAmountCents: true,
      buyerName: true,
      buyerEmail: true,
      invoices: { where: { docType: "INVOICE", status: "ISSUED" }, select: { number: true } },
    },
  });
  if (!card) throw new InvoiceError("Carte cadeau introuvable.");
  if (card.creationMode === "ADMIN_GIFT") {
    throw new InvoiceError("Carte offerte (geste commercial) : aucune vente à facturer.");
  }
  if (card.paymentStatus !== "PAID") throw new InvoiceError("Carte non payée.");
  if (card.invoices.length > 0) {
    throw new InvoiceError(`Facture déjà émise (${card.invoices[0].number}).`);
  }

  const payLabel =
    card.creationMode === "PUBLIC"
      ? "Paiement en ligne (carte bancaire)"
      : methodLabel(card.paymentMethod);

  return createInvoice({
    docType: "INVOICE",
    sourceType: "GIFT_CARD",
    giftCardId: card.id,
    customerName: card.buyerName,
    customerEmail: card.buyerEmail,
    lines: [
      {
        label: `Carte cadeau ••${card.prefix}`,
        quantity: 1,
        unitCents: card.initialAmountCents,
        totalCents: card.initialAmountCents,
      },
    ],
    payments: [{ label: payLabel, amountCents: card.initialAmountCents }],
    totalCents: card.initialAmountCents,
    serviceDate: null,
    createdById: opts.createdById ?? null,
  });
}

export async function createInvoiceForEbookPurchase(
  purchaseId: string,
  opts: BuilderOpts = {},
): Promise<CreatedInvoice> {
  const purchase = await prisma.ebookPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      paymentStatus: true,
      amount: true,
      clientName: true,
      clientEmail: true,
      ebook: { select: { title: true } },
      giftCardRedemption: {
        select: { amountUsedCents: true, reversedAt: true, giftCard: { select: { prefix: true } } },
      },
      invoices: { where: { docType: "INVOICE", status: "ISSUED" }, select: { number: true } },
    },
  });
  if (!purchase) throw new InvoiceError("Achat introuvable.");
  if (purchase.paymentStatus !== "PAID") throw new InvoiceError("Achat non payé.");
  if (purchase.invoices.length > 0) {
    throw new InvoiceError(`Facture déjà émise (${purchase.invoices[0].number}).`);
  }

  const gc = purchase.giftCardRedemption;
  const gcCents = gc && !gc.reversedAt ? gc.amountUsedCents : 0;
  const stripeCents = Math.max(0, purchase.amount - gcCents);

  const payments: InvoicePayment[] = [];
  if (gcCents > 0 && gc) {
    payments.push({ label: `Carte cadeau ••${gc.giftCard.prefix}`, amountCents: gcCents });
  }
  if (stripeCents > 0) {
    payments.push({ label: "Paiement en ligne (carte bancaire)", amountCents: stripeCents });
  }

  return createInvoice({
    docType: "INVOICE",
    sourceType: "EBOOK",
    ebookPurchaseId: purchase.id,
    customerName: purchase.clientName ?? purchase.clientEmail,
    customerEmail: purchase.clientEmail,
    lines: [
      {
        label: `Ebook — ${purchase.ebook.title}`,
        quantity: 1,
        unitCents: purchase.amount,
        totalCents: purchase.amount,
      },
    ],
    payments,
    totalCents: purchase.amount,
    serviceDate: null,
    createdById: opts.createdById ?? null,
  });
}

export async function createCreditNote(input: {
  parentInvoiceId: string;
  amountCents: number;
  reason?: string | null;
  createdById?: string | null;
}): Promise<CreatedInvoice> {
  const parent = await prisma.invoice.findUnique({
    where: { id: input.parentInvoiceId },
    select: {
      id: true,
      number: true,
      docType: true,
      status: true,
      sourceType: true,
      bookingId: true,
      giftCardId: true,
      ebookPurchaseId: true,
      customerName: true,
      customerEmail: true,
      totalCents: true,
      creditNotes: { where: { status: "ISSUED" }, select: { totalCents: true } },
    },
  });
  if (!parent) throw new InvoiceError("Facture introuvable.");
  if (parent.docType !== "INVOICE") {
    throw new InvoiceError("Un avoir ne peut référencer qu'une facture.");
  }
  if (parent.status !== "ISSUED") throw new InvoiceError("Facture annulée.");

  const alreadyCredited = parent.creditNotes.reduce((s, c) => s + c.totalCents, 0);
  const cap = parent.totalCents - alreadyCredited;
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > cap) {
    throw new InvoiceError(`Montant d'avoir invalide (maximum ${(cap / 100).toFixed(2)} €).`);
  }

  const label = input.reason?.trim() || `Avoir sur facture ${parent.number}`;
  return createInvoice({
    docType: "CREDIT_NOTE",
    sourceType: parent.sourceType,
    bookingId: parent.bookingId,
    giftCardId: parent.giftCardId,
    ebookPurchaseId: parent.ebookPurchaseId,
    parentInvoiceId: parent.id,
    parentNumber: parent.number,
    customerName: parent.customerName,
    customerEmail: parent.customerEmail,
    lines: [{ label, quantity: 1, unitCents: input.amountCents, totalCents: input.amountCents }],
    payments: [{ label: "Remboursement", amountCents: input.amountCents }],
    totalCents: input.amountCents,
    serviceDate: null,
    createdById: input.createdById ?? null,
  });
}
