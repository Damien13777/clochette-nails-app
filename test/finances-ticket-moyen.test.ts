/**
 * Ticket moyen de /admin/finances — un RDV honoré compte pour UNE vente, à son
 * montant entier (acompte + complément), rattachée au mois où il a été honoré.
 *
 * Ces tests verrouillent la frontière entre les deux notions : les agrégats
 * monétaires restent en compta d'encaissement (chaque euro daté du jour où il
 * rentre, ce qui est réconcilié au centime avec l'ERP) tandis que le nombre de
 * ventes et le ticket moyen raisonnent en prestations vendues.
 *
 * L'import de ../e2e/db doit précéder celui de @/lib/finances : il charge
 * .env.test, et le client Prisma lit DATABASE_URL à l'import.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, truncateAll } from "../e2e/db";
import { computeFinances } from "@/lib/finances";

// Bornes de mois en calendrier PARIS (CEST = UTC+2 en juin/juillet).
const JUIN = {
  from: new Date("2026-05-31T22:00:00.000Z"),
  to: new Date("2026-06-30T22:00:00.000Z"),
};
const JUILLET = {
  from: new Date("2026-06-30T22:00:00.000Z"),
  to: new Date("2026-07-31T22:00:00.000Z"),
};

async function makeService(priceCents: number) {
  const rand = randomUUID().slice(0, 8);
  return db.service.create({
    data: {
      slug: `svc-${rand}`,
      title: "Pose gel",
      shortDesc: "d",
      description: "d",
      category: "SOIN_MAINS",
      durationMinutes: 90,
      priceCents,
      displayOrder: 1,
      status: "PUBLISHED",
    },
  });
}

type BookingSpec = {
  totalPriceCents: number;
  depositCents: number;
  revenueCents?: number | null;
  status: "CONFIRMED" | "COMPLETED" | "CANCELLED_BY_CLIENT" | "NO_SHOW";
  confirmedAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  refundedAmount?: number | null;
};

async function makeBooking(spec: BookingSpec) {
  const service = await makeService(spec.totalPriceCents);
  return db.booking.create({
    data: {
      date: new Date("2026-07-13"),
      startTime: "10:00",
      endTime: "11:30",
      serviceId: service.id,
      clientFirstName: "Jean",
      clientLastName: "Dupont",
      clientEmail: `jean-${randomUUID().slice(0, 8)}@test.local`,
      clientPhone: "0600000000",
      totalDurationMinutes: 90,
      totalPriceCents: spec.totalPriceCents,
      depositCents: spec.depositCents,
      revenueCents: spec.revenueCents ?? null,
      completionPaymentMethod: spec.revenueCents ? "cash" : null,
      status: spec.status,
      confirmedAt: spec.confirmedAt ?? null,
      completedAt: spec.completedAt ?? null,
      cancelledAt: spec.cancelledAt ?? null,
      refundedAmount: spec.refundedAmount ?? null,
    },
  });
}

beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await db.$disconnect();
});

describe("ticket moyen — un RDV honoré = une vente à son montant entier", () => {
  it("recolle l'acompte de juin et le complément de juillet en un ticket de 60 € rattaché à juillet", async () => {
    // Cas réel cmpx0txs : acompte 10 € encaissé le 02/06, RDV honoré le 13/07
    // avec 50 € réglés en espèces au salon.
    await makeBooking({
      totalPriceCents: 5000,
      depositCents: 1000,
      revenueCents: 5000,
      status: "COMPLETED",
      confirmedAt: new Date("2026-06-02T09:00:00.000Z"),
      completedAt: new Date("2026-07-13T14:00:00.000Z"),
    });

    const juillet = await computeFinances(JUILLET.from, JUILLET.to);
    expect(juillet.totals.grossCents).toBe(5000); // seul le complément est encaissé en juillet
    expect(juillet.totals.count).toBe(1); // 1 RDV honoré
    expect(juillet.totals.averageGrossCents).toBe(6000); // 10 € + 50 €

    const juin = await computeFinances(JUIN.from, JUIN.to);
    expect(juin.totals.grossCents).toBe(1000); // l'acompte reste du CA de juin
    expect(juin.totals.count).toBe(0); // mais aucune prestation n'y a été honorée
    expect(juin.totals.averageGrossCents).toBe(0);
  });

  it("ignore les RDV annulés avec acompte conservé et les no-show", async () => {
    // RDV à 60 € : 10 € d'acompte + 50 € réglés au salon.
    await makeBooking({
      totalPriceCents: 6000,
      depositCents: 1000,
      revenueCents: 5000,
      status: "COMPLETED",
      confirmedAt: new Date("2026-07-02T09:00:00.000Z"),
      completedAt: new Date("2026-07-10T14:00:00.000Z"),
    });
    // Acompte de 10 € encaissé puis cliente absente : de l'argent, pas une vente.
    await makeBooking({
      totalPriceCents: 5000,
      depositCents: 1000,
      status: "NO_SHOW",
      confirmedAt: new Date("2026-07-03T09:00:00.000Z"),
    });
    // Annulation tardive, acompte conservé : idem.
    await makeBooking({
      totalPriceCents: 5000,
      depositCents: 1000,
      status: "CANCELLED_BY_CLIENT",
      confirmedAt: new Date("2026-07-04T09:00:00.000Z"),
      cancelledAt: new Date("2026-07-05T09:00:00.000Z"),
    });

    const { totals } = await computeFinances(JUILLET.from, JUILLET.to);
    expect(totals.grossCents).toBe(8000); // 60 € honoré + 10 € + 10 € d'acomptes gardés
    expect(totals.count).toBe(1); // une seule prestation réalisée
    expect(totals.averageGrossCents).toBe(6000); // et non 8000/3 = 2666
  });

  it("compte la part réglée en carte cadeau dans le ticket", async () => {
    const booking = await makeBooking({
      totalPriceCents: 6000,
      depositCents: 1000,
      revenueCents: 2000,
      status: "COMPLETED",
      confirmedAt: new Date("2026-07-02T09:00:00.000Z"),
      completedAt: new Date("2026-07-10T14:00:00.000Z"),
    });
    const card = await db.giftCard.create({
      data: {
        code: `GC-${randomUUID().slice(0, 8)}`,
        codeHash: `hash-${randomUUID()}`,
        prefix: "AB12",
        initialAmountCents: 3000,
        remainingAmountCents: 0,
        amount: 3000,
        deliveryMode: "EMAIL_TO_BUYER",
        buyerName: "Marraine",
        buyerEmail: "marraine@test.local",
        creationMode: "ADMIN_GIFT",
        paymentStatus: "PAID",
        status: "FULLY_USED",
        expiresAt: new Date("2027-07-01T00:00:00.000Z"),
      },
    });
    await db.giftCardRedemption.create({
      data: {
        giftCardId: card.id,
        bookingId: booking.id,
        type: "BOOKING_SERVICE",
        amountUsedCents: 3000,
        redeemedByEmail: "marraine@test.local",
      },
    });

    const { totals } = await computeFinances(JUILLET.from, JUILLET.to);
    expect(totals.count).toBe(1);
    // 10 € d'acompte + 20 € en espèces + 30 € de carte cadeau = 60 €
    expect(totals.averageGrossCents).toBe(6000);
  });

  it("ventile les ventes par source dans le breakdown", async () => {
    await makeBooking({
      totalPriceCents: 6000,
      depositCents: 1000,
      revenueCents: 5000,
      status: "COMPLETED",
      confirmedAt: new Date("2026-07-02T09:00:00.000Z"),
      completedAt: new Date("2026-07-10T14:00:00.000Z"),
    });
    await db.giftCard.create({
      data: {
        code: `GC-${randomUUID().slice(0, 8)}`,
        codeHash: `hash-${randomUUID()}`,
        prefix: "CD34",
        initialAmountCents: 15000,
        remainingAmountCents: 15000,
        amount: 15000,
        deliveryMode: "EMAIL_TO_BUYER",
        buyerName: "Acheteuse",
        buyerEmail: "acheteuse@test.local",
        creationMode: "PUBLIC",
        paymentStatus: "PAID",
        status: "ACTIVE",
        paidAt: new Date("2026-07-06T10:00:00.000Z"),
        expiresAt: new Date("2027-07-01T00:00:00.000Z"),
      },
    });

    const { totals, breakdown } = await computeFinances(JUILLET.from, JUILLET.to);
    expect(breakdown.bookings.count).toBe(1);
    expect(breakdown.bookings.averageGrossCents).toBe(6000);
    expect(breakdown.giftCards.count).toBe(1);
    expect(breakdown.giftCards.averageGrossCents).toBe(15000);
    expect(breakdown.ebooks.count).toBe(0);
    // Card globale : 2 ventes confondues, (60 + 150) / 2 = 105 €
    expect(totals.count).toBe(2);
    expect(totals.averageGrossCents).toBe(10500);
  });
});
