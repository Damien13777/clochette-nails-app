import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, truncateAll } from "../e2e/db";
import {
  applyGiftCardRedemption,
  GiftCardRedemptionError,
  type RedemptionInput,
} from "@/lib/gift-card-redeem";

async function makeActiveGiftCard(amountCents: number) {
  const rand = randomUUID().slice(0, 8);
  return db.giftCard.create({
    data: {
      code: `TEST-${rand}`,
      codeHash: `hash-${rand}`,
      prefix: rand.slice(-4),
      status: "ACTIVE",
      initialAmountCents: amountCents,
      remainingAmountCents: amountCents,
      buyerEmail: "buyer@test.local",
      buyerName: "Test Buyer",
      deliveryMode: "EMAIL_TO_BUYER",
      expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      amount: amountCents,
      paymentStatus: "PAID",
      creationMode: "PUBLIC",
    },
  });
}

// GiftCardRedemption.bookingId a une FK vers Booking → on crée de vrais
// bookings (avec leur service), comme en production.
async function makeBooking() {
  const rand = randomUUID().slice(0, 8);
  const service = await db.service.create({
    data: {
      slug: `svc-${rand}`,
      title: "Soin",
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
      date: new Date(),
      startTime: "10:00",
      endTime: "10:30",
      serviceId: service.id,
      clientFirstName: "Test",
      clientLastName: "Client",
      clientEmail: "client@test.local",
      clientPhone: "0600000000",
      totalDurationMinutes: 30,
      totalPriceCents: 2500,
      depositCents: 750,
      status: "AWAITING_DEPOSIT",
    },
  });
}

beforeEach(truncateAll);
afterAll(async () => {
  await db.$disconnect();
});

describe("applyGiftCardRedemption — idempotence (rejeu webhook)", () => {
  it("2× mêmes (giftCardId, bookingId, type) → débite une seule fois", async () => {
    const card = await makeActiveGiftCard(5000);
    const booking = await makeBooking();
    const input: RedemptionInput = {
      giftCardId: card.id,
      amountCents: 2000,
      bookingId: booking.id,
      redeemedByEmail: "client@test.local",
      type: "BOOKING_DEPOSIT",
    };
    await applyGiftCardRedemption(input);
    await applyGiftCardRedemption(input); // rejeu

    const after = await db.giftCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(after.remainingAmountCents).toBe(3000);
    expect(await db.giftCardRedemption.count({ where: { giftCardId: card.id } })).toBe(1);
  });
});

describe("applyGiftCardRedemption — concurrence (optimistic lock version)", () => {
  it("deux redemptions simultanées dépassant le solde → une seule réussit", async () => {
    const card = await makeActiveGiftCard(5000);
    const bA = await makeBooking();
    const bB = await makeBooking();
    const mk = (bookingId: string) =>
      applyGiftCardRedemption({
        giftCardId: card.id,
        amountCents: 3000,
        bookingId,
        redeemedByEmail: "client@test.local",
        type: "BOOKING_DEPOSIT",
      });

    const results = await Promise.allSettled([mk(bA.id), mk(bB.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

    const after = await db.giftCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(after.remainingAmountCents).toBe(2000);
    expect(await db.giftCardRedemption.count({ where: { giftCardId: card.id } })).toBe(1);
  });
});

describe("applyGiftCardRedemption — gardes", () => {
  it("solde insuffisant → throw INSUFFICIENT, solde inchangé", async () => {
    const card = await makeActiveGiftCard(1000);
    const booking = await makeBooking();
    await expect(
      applyGiftCardRedemption({
        giftCardId: card.id,
        amountCents: 2000,
        bookingId: booking.id,
        redeemedByEmail: "client@test.local",
        type: "BOOKING_DEPOSIT",
      }),
    ).rejects.toBeInstanceOf(GiftCardRedemptionError);

    const after = await db.giftCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(after.remainingAmountCents).toBe(1000);
    expect(await db.giftCardRedemption.count()).toBe(0);
  });

  it("redemption du solde total → statut FULLY_USED", async () => {
    const card = await makeActiveGiftCard(2000);
    const booking = await makeBooking();
    await applyGiftCardRedemption({
      giftCardId: card.id,
      amountCents: 2000,
      bookingId: booking.id,
      redeemedByEmail: "client@test.local",
      type: "BOOKING_DEPOSIT",
    });
    const after = await db.giftCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(after.remainingAmountCents).toBe(0);
    expect(after.status).toBe("FULLY_USED");
  });
});
