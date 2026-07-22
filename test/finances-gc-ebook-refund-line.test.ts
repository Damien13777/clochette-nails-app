/**
 * Remboursement carte cadeau / ebook = ligne NÉGATIVE datée du remboursement,
 * pas une déduction dans le mois de la vente (append-only, miroir des RDV).
 *
 * Le mois de vente reste figé ; le mois du remboursement porte la ligne « − ».
 * Le nombre de VENTES du mois de remboursement n'augmente pas (une ligne de
 * refund n'est pas une vente — piège toUnitSales).
 *
 * e2e/db charge .env.test avant que @/lib/prisma ne lise DATABASE_URL.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, truncateAll } from "../e2e/db";
import { computeFinanceAnalytics, computeFinances } from "@/lib/finances";

// Bornes de mois en calendrier PARIS (février = CET UTC+1 ; avril = CEST UTC+2 ;
// bascule DST le 29 mars 2026).
const FEV = { from: new Date("2026-01-31T23:00:00.000Z"), to: new Date("2026-02-28T23:00:00.000Z") };
const MARS = { from: new Date("2026-02-28T23:00:00.000Z"), to: new Date("2026-03-31T22:00:00.000Z") };
const AVRIL = { from: new Date("2026-03-31T22:00:00.000Z"), to: new Date("2026-04-30T22:00:00.000Z") };

async function makeRefundedPublicCard(amountCents: number, feeCents: number) {
  return db.giftCard.create({
    data: {
      code: `GC-${randomUUID().slice(0, 8)}`,
      codeHash: `hash-${randomUUID()}`,
      prefix: "AB12",
      initialAmountCents: amountCents,
      remainingAmountCents: 0,
      amount: amountCents,
      deliveryMode: "EMAIL_TO_BUYER",
      buyerName: "Acheteuse",
      buyerEmail: "acheteuse@test.local",
      creationMode: "PUBLIC",
      paymentStatus: "PAID", // invariant D5
      status: "REFUNDED",
      stripeFeeCents: feeCents,
      paidAt: new Date("2026-02-15T10:00:00.000Z"),
      refundedAmount: amountCents,
      refundedAt: new Date("2026-04-15T10:00:00.000Z"),
      expiresAt: new Date("2027-02-15T10:00:00.000Z"),
    },
  });
}

beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await db.$disconnect();
});

describe("remboursement carte cadeau → ligne négative datée", () => {
  it("fige février (vente) et porte le − en avril (remboursement)", async () => {
    await makeRefundedPublicCard(15000, 100);

    const fev = await computeFinances(FEV.from, FEV.to);
    expect(fev.totals.grossCents).toBe(15000); // vente intacte
    expect(fev.totals.refundedCents).toBe(0); // le refund n'est PAS dans février
    expect(fev.totals.netCents).toBe(14900); // 150 − frais 1
    expect(fev.breakdown.giftCards.count).toBe(1); // 1 vente en février

    const avril = await computeFinances(AVRIL.from, AVRIL.to);
    expect(avril.totals.grossCents).toBe(-15000); // ligne négative
    expect(avril.totals.netCents).toBe(-15000);
    expect(avril.breakdown.giftCards.count).toBe(0); // AUCUNE vente en avril

    // Net cumulé des deux mois = perte des frais Stripe (non rendus).
    expect(fev.totals.netCents + avril.totals.netCents).toBe(-100);
  });

  it("vente ET remboursement le même mois : deux lignes, une seule vente, net = perte des frais", async () => {
    const card = await makeRefundedPublicCard(15000, 100);
    // Ramène le remboursement dans le mois de la vente (février).
    await db.giftCard.update({
      where: { id: card.id },
      data: { refundedAt: new Date("2026-02-20T10:00:00.000Z") },
    });

    const fev = await computeFinances(FEV.from, FEV.to);
    expect(fev.totals.grossCents).toBe(0); // +150 vente − 150 refund
    expect(fev.totals.netCents).toBe(-100); // perte des frais
    expect(fev.breakdown.giftCards.count).toBe(1); // UNE vente, pas deux
    expect(fev.breakdown.giftCards.averageGrossCents).toBe(15000); // ticket = la vente entière
  });
});

describe("remboursement ebook (portion CB) → ligne négative datée", () => {
  it("mois de vente figé, portion CB remboursée en ligne négative le mois du refund", async () => {
    // Ebook 15 € payé 10 € carte cadeau + 5 € CB, portion CB remboursée.
    const ebook = await db.ebook.create({
      data: {
        slug: `ebook-${randomUUID().slice(0, 8)}`,
        title: "Guide",
        shortDesc: "d",
        description: "d",
        priceCents: 1500,
        status: "PUBLISHED",
      },
    });
    const purchase = await db.ebookPurchase.create({
      data: {
        ebookId: ebook.id,
        clientEmail: `cliente-${randomUUID().slice(0, 8)}@test.local`,
        amount: 1500,
        paymentStatus: "REFUNDED",
        stripeFeeCents: 30,
        paidAt: new Date("2026-03-15T10:00:00.000Z"),
        refundedAmount: 500, // portion CB
        refundedAt: new Date("2026-04-15T10:00:00.000Z"),
        downloadToken: randomUUID().replace(/-/g, ""),
        tokenExpiresAt: new Date("2026-04-15T10:00:00.000Z"),
      },
    });
    const card = await db.giftCard.create({
      data: {
        code: `GC-${randomUUID().slice(0, 8)}`,
        codeHash: `hash-${randomUUID()}`,
        prefix: "CD34",
        initialAmountCents: 1000,
        remainingAmountCents: 0,
        amount: 1000,
        deliveryMode: "EMAIL_TO_BUYER",
        buyerName: "Marraine",
        buyerEmail: "marraine@test.local",
        creationMode: "ADMIN_GIFT",
        paymentStatus: "PAID",
        status: "FULLY_USED",
        expiresAt: new Date("2027-03-15T10:00:00.000Z"),
      },
    });
    await db.giftCardRedemption.create({
      data: {
        giftCardId: card.id,
        ebookPurchaseId: purchase.id,
        type: "EBOOK",
        amountUsedCents: 1000,
        redeemedByEmail: "cliente@test.local",
        redeemedAt: new Date("2026-03-15T10:00:00.000Z"),
      },
    });

    const mars = await computeFinances(MARS.from, MARS.to);
    expect(mars.totals.grossCents).toBe(1500);
    expect(mars.breakdown.ebooks.count).toBe(1);
    expect(mars.breakdown.ebooks.netCents).toBe(470); // 1500 − 1000 GC − 30 frais, refund PAS déduit ici

    const avril = await computeFinances(AVRIL.from, AVRIL.to);
    expect(avril.totals.grossCents).toBe(-500); // portion CB rendue
    expect(avril.totals.netCents).toBe(-500);
    expect(avril.breakdown.ebooks.count).toBe(0); // pas une vente

    // La modale « Top ebooks » (analytics) doit montrer le net de VENTE du mois,
    // sans déduire un remboursement qui a lieu à une autre date (append-only).
    const analyticsMars = await computeFinanceAnalytics(MARS.from, MARS.to);
    expect(analyticsMars.topEbooks[0]?.netCents).toBe(470); // et non 0 (refund déduit)
  });
});
