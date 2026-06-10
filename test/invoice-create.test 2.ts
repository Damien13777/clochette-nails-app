import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db, truncateAll } from "../e2e/db";
import {
  createInvoiceForBooking,
  createInvoiceForGiftCard,
  createInvoiceForEbookPurchase,
  InvoiceError,
} from "@/lib/invoice/create-invoice";
import type { InvoiceLine, InvoicePayment } from "@/lib/invoice/types";

async function makeSettings() {
  await db.platformSettings.create({
    data: { invoiceHeaderName: "CN manucure", invoiceLegalOwner: "EI Gomes Chloé" },
  });
}

async function makeCompletedBooking() {
  const rand = randomUUID().slice(0, 8);
  const service = await db.service.create({
    data: {
      slug: `svc-${rand}`,
      title: "Pose gel",
      shortDesc: "d",
      description: "d",
      category: "SOIN_MAINS",
      durationMinutes: 60,
      priceCents: 6000,
      status: "PUBLISHED",
    },
  });
  const option = await db.serviceOption.create({
    data: {
      slug: `opt-${rand}`,
      title: "Nail art",
      addedDurationMinutes: 15,
      addedPriceCents: 1500,
      applicableCategories: ["SOIN_MAINS"],
      status: "PUBLISHED",
    },
  });
  const giftCard = await db.giftCard.create({
    data: {
      code: `TEST-${rand}`,
      codeHash: `h-${rand}`,
      prefix: rand.slice(-4),
      status: "PARTIALLY_USED",
      initialAmountCents: 3000,
      remainingAmountCents: 1000,
      buyerEmail: "b@test.local",
      buyerName: "B",
      deliveryMode: "EMAIL_TO_BUYER",
      expiresAt: new Date(Date.now() + 365 * 86400000),
      amount: 3000,
      paymentStatus: "PAID",
      creationMode: "PUBLIC",
    },
  });
  const booking = await db.booking.create({
    data: {
      date: new Date("2026-06-01"),
      startTime: "10:00",
      endTime: "11:15",
      serviceId: service.id,
      clientFirstName: "Marie",
      clientLastName: "Durand",
      clientEmail: "marie@test.local",
      clientPhone: "0600000000",
      totalDurationMinutes: 75,
      totalPriceCents: 7500,
      depositCents: 2250,
      status: "COMPLETED",
      paymentMethod: "stripe",
      paidAt: new Date(),
      completedAt: new Date(),
      revenueCents: 3250,
      completionPaymentMethod: "cash",
      options: { create: [{ serviceOptionId: option.id }] },
    },
  });
  await db.giftCardRedemption.create({
    data: {
      giftCardId: giftCard.id,
      type: "BOOKING_SERVICE",
      bookingId: booking.id,
      amountUsedCents: 2000,
      redeemedByEmail: "marie@test.local",
    },
  });
  return { booking, giftCard };
}

beforeAll(async () => {
  process.env.INVOICES_DIR = await mkdtemp(path.join(tmpdir(), "invoices-test-"));
});

beforeEach(async () => {
  await truncateAll();
  await makeSettings();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("createInvoiceForBooking", () => {
  it("lignes prestation+option, paiements acompte/cash/GC, total = encaissé", async () => {
    const { booking, giftCard } = await makeCompletedBooking();
    const inv = await createInvoiceForBooking(booking.id);
    const row = await db.invoice.findUniqueOrThrow({
      where: { id: inv.id },
      select: {
        lines: true,
        payments: true,
        totalCents: true,
        customerName: true,
        serviceDate: true,
        sourceType: true,
      },
    });

    expect(row.totalCents).toBe(2250 + 3250 + 2000);
    expect(row.customerName).toBe("Marie Durand");
    expect(row.sourceType).toBe("BOOKING");

    const lines = row.lines as InvoiceLine[];
    expect(lines.map((l) => l.label)).toEqual(["Pose gel", "Nail art"]);
    expect(lines.reduce((s, l) => s + l.totalCents, 0)).toBe(7500);

    const payments = row.payments as InvoicePayment[];
    expect(payments).toEqual([
      { label: "Acompte payé en ligne (carte bancaire)", amountCents: 2250 },
      { label: "Espèces", amountCents: 3250 },
      { label: `Carte cadeau ••${giftCard.prefix}`, amountCents: 2000 },
    ]);
  });

  it("geste commercial → ligne d'ajustement négative", async () => {
    const { booking } = await makeCompletedBooking();
    await db.booking.update({ where: { id: booking.id }, data: { revenueCents: 2250 } });
    const inv = await createInvoiceForBooking(booking.id);
    const row = await db.invoice.findUniqueOrThrow({
      where: { id: inv.id },
      select: { lines: true, totalCents: true },
    });
    const lines = row.lines as InvoiceLine[];
    expect(row.totalCents).toBe(2250 + 2250 + 2000);
    expect(lines.at(-1)).toEqual({
      label: "Remise / ajustement",
      quantity: 1,
      unitCents: -1000,
      totalCents: -1000,
    });
  });

  it("refuse un booking non COMPLETED et une double facture", async () => {
    const { booking } = await makeCompletedBooking();
    await db.booking.update({ where: { id: booking.id }, data: { status: "CONFIRMED" } });
    await expect(createInvoiceForBooking(booking.id)).rejects.toThrow(InvoiceError);
    await db.booking.update({ where: { id: booking.id }, data: { status: "COMPLETED" } });
    await createInvoiceForBooking(booking.id);
    await expect(createInvoiceForBooking(booking.id)).rejects.toThrow(/déjà émise/);
  });
});

describe("createInvoiceForGiftCard", () => {
  it("ADMIN_SALE → facture acheteuse, paiement physique ; ADMIN_GIFT refusée", async () => {
    const rand = randomUUID().slice(0, 8);
    const base = {
      prefix: "ABCD",
      status: "ACTIVE" as const,
      initialAmountCents: 5000,
      remainingAmountCents: 5000,
      buyerEmail: "acheteuse@test.local",
      buyerName: "Acheteuse Test",
      deliveryMode: "EMAIL_TO_RECIPIENT" as const,
      expiresAt: new Date(Date.now() + 365 * 86400000),
      amount: 5000,
      paymentStatus: "PAID" as const,
    };
    const sale = await db.giftCard.create({
      data: {
        ...base,
        code: `S-${rand}`,
        codeHash: `h-${rand}`,
        creationMode: "ADMIN_SALE",
        paymentMethod: "card_terminal",
      },
    });
    const gift = await db.giftCard.create({
      data: { ...base, code: `G-${rand}`, codeHash: `h2-${rand}`, creationMode: "ADMIN_GIFT" },
    });

    const inv = await createInvoiceForGiftCard(sale.id);
    const row = await db.invoice.findUniqueOrThrow({
      where: { id: inv.id },
      select: { totalCents: true, customerName: true, payments: true, sourceType: true },
    });
    expect(row.totalCents).toBe(5000);
    expect(row.customerName).toBe("Acheteuse Test");
    expect(row.sourceType).toBe("GIFT_CARD");
    expect((row.payments as InvoicePayment[])[0].label).toBe("TPE / Carte bancaire");

    await expect(createInvoiceForGiftCard(gift.id)).rejects.toThrow(/offerte/i);
  });
});

describe("createInvoiceForEbookPurchase", () => {
  it("ligne titre ebook, split GC + CB, total = prix payé", async () => {
    const rand = randomUUID().slice(0, 8);
    const ebook = await db.ebook.create({
      data: {
        slug: `eb-${rand}`,
        title: "Guide nail art",
        shortDesc: "d",
        description: "d",
        priceCents: 1900,
        status: "PUBLISHED",
      },
    });
    const card = await db.giftCard.create({
      data: {
        code: `E-${rand}`,
        codeHash: `h3-${rand}`,
        prefix: "WXYZ",
        status: "PARTIALLY_USED",
        initialAmountCents: 1000,
        remainingAmountCents: 500,
        buyerEmail: "b@test.local",
        buyerName: "B",
        deliveryMode: "EMAIL_TO_BUYER",
        expiresAt: new Date(Date.now() + 365 * 86400000),
        amount: 1000,
        paymentStatus: "PAID",
        creationMode: "PUBLIC",
      },
    });
    const purchase = await db.ebookPurchase.create({
      data: {
        ebookId: ebook.id,
        clientEmail: "lectrice@test.local",
        clientName: "Lectrice Test",
        paymentStatus: "PAID",
        amount: 1900,
        paidAt: new Date(),
        downloadToken: `tok-${rand}`,
        tokenExpiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    await db.giftCardRedemption.create({
      data: {
        giftCardId: card.id,
        type: "EBOOK",
        ebookPurchaseId: purchase.id,
        amountUsedCents: 500,
        redeemedByEmail: "lectrice@test.local",
      },
    });

    const inv = await createInvoiceForEbookPurchase(purchase.id);
    const row = await db.invoice.findUniqueOrThrow({
      where: { id: inv.id },
      select: { lines: true, payments: true, totalCents: true },
    });
    expect(row.totalCents).toBe(1900);
    expect((row.lines as InvoiceLine[])[0].label).toBe("Ebook — Guide nail art");
    expect(row.payments as InvoicePayment[]).toEqual([
      { label: "Carte cadeau ••WXYZ", amountCents: 500 },
      { label: "Paiement en ligne (carte bancaire)", amountCents: 1400 },
    ]);
  });
});
