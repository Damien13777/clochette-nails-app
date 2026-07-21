import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db, truncateAll } from "../e2e/db";
import { backfillOutbound } from "@/lib/outbound/backfill";

type BookingOverrides = {
  confirmedAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  status?: string;
  revenueCents?: number | null;
  depositCents?: number;
  stripeFeeCents?: number | null;
  refundedAmount?: number | null;
  completionPaymentMethod?: string | null;
};

async function makeBooking(o: BookingOverrides = {}) {
  const rand = randomUUID().slice(0, 8);
  const service = await db.service.create({
    data: {
      slug: `svc-${rand}`,
      title: "Prestation",
      shortDesc: "d",
      description: "d",
      category: "SOIN_MAINS",
      durationMinutes: 30,
      priceCents: 2500,
      displayOrder: 1,
      status: "PUBLISHED",
    },
  });
  return db.booking.create({
    data: {
      date: new Date("2026-06-01"),
      startTime: "10:00",
      endTime: "10:30",
      serviceId: service.id,
      clientFirstName: "Jean",
      clientLastName: "Dupont",
      clientEmail: `jean-${rand}@test.local`,
      clientPhone: "0600000000",
      totalDurationMinutes: 30,
      totalPriceCents: 2500,
      depositCents: o.depositCents ?? 750,
      status: (o.status ?? "COMPLETED") as never,
      confirmedAt: o.confirmedAt === undefined ? new Date("2026-06-01T09:00:00Z") : o.confirmedAt,
      completedAt: o.completedAt === undefined ? new Date("2026-06-05T14:00:00Z") : o.completedAt,
      cancelledAt: o.cancelledAt ?? null,
      revenueCents: o.revenueCents === undefined ? 1750 : o.revenueCents,
      stripeFeeCents: o.stripeFeeCents === undefined ? 20 : o.stripeFeeCents,
      refundedAmount: o.refundedAmount ?? null,
      completionPaymentMethod: o.completionPaymentMethod === undefined ? "cash" : o.completionPaymentMethod,
    },
  });
}

const BEFORE = new Date("2026-07-01T00:00:00Z");

beforeEach(async () => {
  await truncateAll();
  vi.stubEnv("MANAGEMENT_API_URL", "http://erp.test");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.$disconnect();
});

describe("backfillOutbound", () => {
  it("RDV honoré → acompte + solde, chacun daté à sa date métier, idempotent", async () => {
    const b = await makeBooking();

    const r1 = await backfillOutbound({ db, before: BEFORE });
    expect(r1).toMatchObject({ seeded: 2, skipped: 0 });

    const rows = await db.outboundEvent.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => r.type)).toEqual(["booking.confirmed", "booking.completed"]);

    const [confirmed, completed] = rows;
    // acompte : eventId déterministe, daté confirmedAt, brut + frais réels
    expect(confirmed.eventId).toBe(`backfill:booking.confirmed:${b.id}`);
    expect(confirmed.createdAt.toISOString()).toBe("2026-06-01T09:00:00.000Z");
    expect(confirmed.payload).toMatchObject({
      bookingId: b.id,
      depositCents: 750,
      giftCardAmountUsed: 0,
      stripeFeeCents: 20,
      confirmedAt: "2026-06-01T09:00:00.000Z",
      serviceTitle: "Prestation",
    });
    // solde : daté completedAt, revenueCents
    expect(completed.eventId).toBe(`backfill:booking.completed:${b.id}`);
    expect(completed.createdAt.toISOString()).toBe("2026-06-05T14:00:00.000Z");
    expect(completed.payload).toMatchObject({ bookingId: b.id, revenueCents: 1750, completedAt: "2026-06-05T14:00:00.000Z" });

    // re-run → dedup total
    const r2 = await backfillOutbound({ db, before: BEFORE });
    expect(r2).toMatchObject({ seeded: 0, skipped: 2 });
    expect(await db.outboundEvent.count()).toBe(2);
  });

  it("une redemption de carte cadeau REVERSÉE reste comptée dans le payload d'acompte", async () => {
    // Garde anti-régression : `giftCardAmountUsed: 0` du test précédent est vrai
    // par vacuité (ce booking-là n'a aucune carte cadeau). Ici la carte existe et
    // a été annulée — le backfill doit rester le miroir exact de finances.ts, qui
    // ne filtre plus sur `reversedAt`. Sinon le site et l'ERP divergent.
    const b = await makeBooking({ depositCents: 1350, revenueCents: 0, completedAt: null, status: "CONFIRMED" });
    const card = await db.giftCard.create({
      data: {
        code: `GC-${randomUUID().slice(0, 8)}`,
        codeHash: `hash-${randomUUID()}`,
        prefix: "AB12",
        initialAmountCents: 1350,
        remainingAmountCents: 1350,
        amount: 1350,
        deliveryMode: "EMAIL_TO_BUYER",
        buyerName: "Marraine",
        buyerEmail: "marraine@test.local",
        creationMode: "ADMIN_GIFT",
        paymentStatus: "PAID",
        status: "ACTIVE",
        expiresAt: new Date("2027-07-01T00:00:00Z"),
      },
    });
    await db.giftCardRedemption.create({
      data: {
        giftCardId: card.id,
        bookingId: b.id,
        type: "BOOKING_DEPOSIT",
        amountUsedCents: 1350,
        redeemedByEmail: "cliente@test.local",
        redeemedAt: new Date("2026-06-01T09:00:00Z"),
        reversedAt: new Date("2026-06-20T10:00:00Z"),
        reversedAmountCents: 1350,
      },
    });

    await backfillOutbound({ db, before: BEFORE });

    const confirmed = await db.outboundEvent.findFirstOrThrow({
      where: { type: "booking.confirmed" },
    });
    // Sans le correctif : 0 → l'ERP compterait 13,50 € de net là où le site en
    // compte 0, et la réconciliation au centime sauterait.
    expect(confirmed.payload).toMatchObject({ giftCardAmountUsed: 1350 });
  });

  it("ebook réglé en carte cadeau puis reversé : la part carte cadeau reste déduite", async () => {
    const ebook = await db.ebook.create({
      data: {
        slug: `ebook-${randomUUID().slice(0, 8)}`,
        title: "Guide",
        shortDesc: "d",
        description: "d",
        priceCents: 1900,
        status: "PUBLISHED",
      },
    });
    const purchase = await db.ebookPurchase.create({
      data: {
        ebookId: ebook.id,
        clientEmail: `cliente-${randomUUID().slice(0, 8)}@test.local`,
        amount: 1900,
        paymentStatus: "PAID",
        paidAt: new Date("2026-06-10T10:00:00Z"),
        downloadToken: randomUUID().replace(/-/g, ""),
        tokenExpiresAt: new Date("2026-07-10T10:00:00Z"),
      },
    });
    const card = await db.giftCard.create({
      data: {
        code: `GC-${randomUUID().slice(0, 8)}`,
        codeHash: `hash-${randomUUID()}`,
        prefix: "CD34",
        initialAmountCents: 1900,
        remainingAmountCents: 1900,
        amount: 1900,
        deliveryMode: "EMAIL_TO_BUYER",
        buyerName: "Marraine",
        buyerEmail: "marraine@test.local",
        creationMode: "ADMIN_GIFT",
        paymentStatus: "PAID",
        status: "ACTIVE",
        expiresAt: new Date("2027-07-01T00:00:00Z"),
      },
    });
    await db.giftCardRedemption.create({
      data: {
        giftCardId: card.id,
        ebookPurchaseId: purchase.id,
        type: "EBOOK",
        amountUsedCents: 1900,
        redeemedByEmail: "cliente@test.local",
        redeemedAt: new Date("2026-06-10T10:00:00Z"),
        reversedAt: new Date("2026-06-25T10:00:00Z"),
        reversedAmountCents: 1900,
      },
    });

    await backfillOutbound({ db, before: BEFORE });

    const purchased = await db.outboundEvent.findFirstOrThrow({
      where: { type: "ebook.purchased" },
    });
    // Sans le correctif : 1900 → l'ERP compterait 19,00 € encaissés alors que la
    // vente a été intégralement réglée en carte cadeau (déjà comptée à sa vente).
    expect(purchased.payload).toMatchObject({ amountPaidCents: 0 });
  });

  it("refuse de tourner sans date de cutover explicite", async () => {
    // Sans `before`, la garde de cutover (`occurredAt >= before`) retombait sur
    // « maintenant » et ne protégeait plus rien : un re-run reconstruisait les
    // faits POSTÉRIEURS à la bascule avec des eventId `backfill:*` que rien ne
    // rapproche des events live → double comptage côté ERP. La route admin
    // appelait justement backfillOutbound() sans argument.
    await expect(backfillOutbound({ db })).rejects.toThrow(/cutover/i);
  });

  it("cutover PAR EVENT : acompte pré-bascule reconstruit, solde post-bascule ignoré", async () => {
    await makeBooking({ confirmedAt: new Date("2026-06-10T09:00:00Z"), completedAt: new Date("2026-07-15T14:00:00Z") });
    const r = await backfillOutbound({ db, before: BEFORE });
    expect(r.seeded).toBe(1); // seulement l'acompte
    const rows = await db.outboundEvent.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("booking.confirmed");
  });

  it("RDV jamais confirmé (EXPIRED, confirmedAt null) → aucun event", async () => {
    await makeBooking({ status: "EXPIRED", confirmedAt: null, completedAt: null, revenueCents: null });
    const r = await backfillOutbound({ db, before: BEFORE });
    expect(r.seeded).toBe(0);
  });

  it("annulé + remboursé → acompte + terminal + remboursement (ligne − datée cancelledAt)", async () => {
    await makeBooking({
      status: "CANCELLED_BY_ADMIN",
      completedAt: null,
      revenueCents: null,
      completionPaymentMethod: null,
      cancelledAt: new Date("2026-06-20T12:00:00Z"),
      refundedAmount: 500,
    });
    const r = await backfillOutbound({ db, before: BEFORE });
    expect(r.seeded).toBe(3);
    const rows = await db.outboundEvent.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => r.type)).toEqual(["booking.confirmed", "booking.cancelled_by_admin", "booking.refunded"]);
    const refund = rows.find((r) => r.type === "booking.refunded")!;
    expect(refund.createdAt.toISOString()).toBe("2026-06-20T12:00:00.000Z");
    expect(refund.payload).toMatchObject({ stripeRefundedCents: 500, refundedAt: "2026-06-20T12:00:00.000Z" });
  });

  it("no-op sans MANAGEMENT_API_URL", async () => {
    vi.stubEnv("MANAGEMENT_API_URL", "");
    await makeBooking();
    const r = await backfillOutbound({ db, before: BEFORE });
    expect(r.seeded).toBe(0);
    expect(await db.outboundEvent.count()).toBe(0);
  });
});
